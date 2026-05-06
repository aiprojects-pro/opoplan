const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const { ASSESSMENT_TYPES } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// Pruebas / simulacros / evaluaciones que un opositor realiza.
// Tipos disponibles (Fase 3 amplía con `fisica` e `idioma`).
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TYPES = ASSESSMENT_TYPES.map((t) => t.id);

module.exports = function assessmentsRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function canSee(user, a) {
    if (user.role === "admin" || user.role === "superadmin") return a.organizationId === user.organizationId || !user.organizationId;
    if (user.role === "opositor") return a.opositorId === user.id;
    if (user.role === "preparador") {
      const ass = db.findOne("assignments", (x) => x.opositorId === a.opositorId && x.active);
      return ass && ass.preparadorId === user.id;
    }
    return false;
  }

  r.get("/assessments", (req, res) => {
    const orgId = req.user.organizationId;
    let list = db.find("assessments", (a) => a.organizationId === orgId);

    if (req.user.role === "opositor") {
      list = list.filter((a) => a.opositorId === req.user.id);
    } else if (req.user.role === "preparador") {
      const myOpos = db
        .find("assignments", (x) => x.preparadorId === req.user.id && x.active)
        .map((x) => x.opositorId);
      list = list.filter((a) => myOpos.includes(a.opositorId));
    }

    if (req.query.opositorId) list = list.filter((a) => a.opositorId === req.query.opositorId);
    if (req.query.type) list = list.filter((a) => a.type === req.query.type);

    res.json({ assessments: list, types: ASSESSMENT_TYPES });
  });

  r.post("/assessments", auth.requireRole("preparador", "admin", "superadmin", "opositor"), (req, res) => {
    const orgId = req.user.organizationId;
    const { opositorId, type, title, score, maxScore, date, topic, notes, durationMin } = req.body || {};
    if (!type || !title) return res.status(400).json({ error: "missing_fields" });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: "invalid_type" });

    const targetOpositor = req.user.role === "opositor" ? req.user.id : opositorId;
    if (!targetOpositor) return res.status(400).json({ error: "missing_opositor" });

    const a = db.insert("assessments", {
      id: db.id("as"),
      organizationId: orgId,
      opositorId: targetOpositor,
      type,
      title,
      topic: topic || "",
      score: score != null ? Number(score) : null,
      maxScore: Number(maxScore) || 10,
      date: date || new Date().toISOString().slice(0, 10),
      durationMin: Number(durationMin) || 0,
      notes: notes || "",
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    });
    res.json({ assessment: a });
  });

  r.patch("/assessments/:id", (req, res) => {
    const a = db.findOne("assessments", (x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, a)) return res.status(403).json({ error: "forbidden" });

    const allowed = ["title", "type", "topic", "score", "maxScore", "date", "durationMin", "notes"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (patch.type && !VALID_TYPES.includes(patch.type)) return res.status(400).json({ error: "invalid_type" });
    const updated = db.update("assessments", (x) => x.id === a.id, patch);
    res.json({ assessment: updated });
  });

  r.delete("/assessments/:id", (req, res) => {
    const a = db.findOne("assessments", (x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, a)) return res.status(403).json({ error: "forbidden" });
    db.remove("assessments", (x) => x.id === a.id);
    res.json({ ok: true });
  });

  // Catálogo de tipos (para que el frontend lo pinte)
  r.get("/assessment-types", (req, res) => {
    res.json({ types: ASSESSMENT_TYPES });
  });

  return r;
};
