const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");

// ─────────────────────────────────────────────────────────────────────────────
// Retos / rankings entre opositores (transcripción ~20:26).
// El preparador crea retos (típicamente tests cronometrados).
// Solo participan opositores con `rankingOptIn === true` (~20:26: opt-in).
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function challengesRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  // ── Preparador / admin: gestión de retos ─────────────────────────────────

  r.get("/challenges", (req, res) => {
    const orgId = req.user.organizationId;
    let list = db.find("challenges", (c) => c.organizationId === orgId);
    if (req.user.role === "preparador") {
      list = list.filter((c) => c.preparadorId === req.user.id);
    } else if (req.user.role === "opositor") {
      // Solo ve retos visibles para él (de su preparador, status open)
      const a = db.findOne("assignments", (x) => x.opositorId === req.user.id && x.active);
      if (!a) return res.json({ challenges: [] });
      list = list.filter((c) => c.preparadorId === a.preparadorId && c.status !== "draft");
    }
    // Para opositores, ocultar las preguntas (solo se ven al jugar)
    if (req.user.role === "opositor") {
      list = list.map((c) => ({ ...c, questions: undefined, questionsCount: (c.questions || []).length }));
    }
    res.json({ challenges: list });
  });

  r.post("/challenges", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const preparadorId = req.user.role === "preparador" ? req.user.id : req.body.preparadorId;
    const c = db.insert("challenges", {
      id: db.id("ch"),
      organizationId: orgId,
      preparadorId,
      name: req.body.name || "Reto sin nombre",
      description: req.body.description || "",
      durationSec: Number(req.body.durationSec) || 600,
      questions: Array.isArray(req.body.questions) ? req.body.questions : [],
      opensAt: req.body.opensAt || new Date().toISOString(),
      closesAt: req.body.closesAt || "",
      status: req.body.status || "open", // draft | open | closed
      createdAt: new Date().toISOString(),
    });
    res.json({ challenge: c });
  });

  r.patch("/challenges/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const c = db.findOne("challenges", (x) => x.id === req.params.id && x.organizationId === orgId);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "preparador" && c.preparadorId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    const patch = {};
    for (const k of ["name", "description", "durationSec", "questions", "opensAt", "closesAt", "status"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    const u = db.update("challenges", (x) => x.id === c.id, patch);
    res.json({ challenge: u });
  });

  r.delete("/challenges/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const c = db.findOne("challenges", (x) => x.id === req.params.id && x.organizationId === orgId);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "preparador" && c.preparadorId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    db.remove("challenges", (x) => x.id === c.id);
    db.remove("challengeAttempts", (x) => x.challengeId === c.id);
    res.json({ ok: true });
  });

  // ── Opositor: jugar un reto ───────────────────────────────────────────────

  r.post("/challenges/:id/attempt", auth.requireRole("opositor"), (req, res) => {
    if (!req.user.rankingOptIn) {
      return res.status(403).json({ error: "ranking_not_opted_in" });
    }
    const c = db.findOne("challenges", (x) => x.id === req.params.id && x.status === "open");
    if (!c) return res.status(404).json({ error: "not_found" });
    const { answers, durationSec } = req.body || {};
    // Calcular puntuación (1 punto por correcta)
    let correct = 0;
    const total = (c.questions || []).length;
    (c.questions || []).forEach((q, i) => {
      if (answers && answers[i] === q.correct) correct++;
    });
    // Score con bonus por velocidad si terminó antes del tiempo máximo
    const speedBonus = Math.max(0, c.durationSec - (Number(durationSec) || c.durationSec));
    const score = correct * 100 + Math.round(speedBonus / 2);
    const attempt = db.insert("challengeAttempts", {
      id: db.id("at"),
      organizationId: req.user.organizationId,
      challengeId: c.id,
      opositorId: req.user.id,
      correct,
      total,
      durationSec: Number(durationSec) || c.durationSec,
      score,
      answers: answers || {},
      submittedAt: new Date().toISOString(),
    });
    res.json({ attempt, summary: { correct, total, score } });
  });

  // ── Ranking ───────────────────────────────────────────────────────────────

  r.get("/challenges/:id/ranking", (req, res) => {
    const orgId = req.user.organizationId;
    const c = db.findOne("challenges", (x) => x.id === req.params.id && x.organizationId === orgId);
    if (!c) return res.status(404).json({ error: "not_found" });
    const attempts = db.find("challengeAttempts", (a) => a.challengeId === c.id);
    // Mejor intento por opositor
    const best = new Map();
    for (const a of attempts) {
      const cur = best.get(a.opositorId);
      if (!cur || a.score > cur.score) best.set(a.opositorId, a);
    }
    const ranking = [...best.values()]
      .sort((a, b) => b.score - a.score)
      .map((a, i) => {
        const u = db.findOne("users", (x) => x.id === a.opositorId);
        return {
          position: i + 1,
          opositorId: a.opositorId,
          opositorName: u?.name || "(eliminado)",
          score: a.score,
          correct: a.correct,
          total: a.total,
          durationSec: a.durationSec,
        };
      });
    res.json({ challenge: { id: c.id, name: c.name }, ranking });
  });

  return r;
};
