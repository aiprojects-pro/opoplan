const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const { CONFIDENCE_LEVELS } = require("../lib/constants");

// Simulacros con análisis cognitivo (catálogo §A.6 / §B simulacro avanzado).
//
// Diferencia con `assessments` (clásico): aquí registramos por pregunta:
//   - tiempo invertido en ms
//   - nº de cambios de respuesta
//   - confianza declarada (sure | doubt | guess)
//   - orden de respuesta
// A partir de ahí, dashboard y opositor ven calibración, mapa de
// vulnerabilidad y patrones cognitivos.

module.exports = function simulacrosRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }

  // POST /simulacros/begin — crea un simulacro a partir de un proceso.
  // Body: { processId, count, topicIds? } — selecciona N preguntas del banco.
  r.post("/simulacros/begin", auth.requireRole("opositor"), (req, res) => {
    const orgId = orgOf(req);
    const { processId, count = 20, topicIds = [] } = req.body || {};
    if (!processId) return res.status(400).json({ error: "missing_process" });
    let pool = db.find("questionBank", (q) =>
      q.organizationId === orgId
      && q.processId === processId
      && q.active !== false
      && (!topicIds.length || topicIds.includes(q.topicId)));
    if (!pool.length) return res.status(404).json({ error: "no_questions" });
    // Selección aleatoria sin reemplazo
    const N = Math.min(Number(count) || 20, pool.length);
    pool = shuffle(pool).slice(0, N);

    const attempt = db.insert("simulacroAttempts", {
      id: db.id("sa"),
      organizationId: orgId,
      opositorId: req.user.id,
      processId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationSec: 0,
      score: null,
      questions: pool.map((q) => ({
        qbId: q.id,
        chosen: null,
        correct: q.correct,
        timeMs: 0,
        changes: 0,
        confidence: null,
      })),
    });
    // Devolvemos preguntas SIN el campo correct ni la respuesta esperada,
    // para que no se filtre al cliente
    const questions = pool.map((q) => ({
      qbId: q.id,
      text: q.text,
      options: q.options,
      norm: q.norm,
      difficulty: q.difficulty,
    }));
    res.json({ attemptId: attempt.id, questions, confidenceLevels: CONFIDENCE_LEVELS });
  });

  // POST /simulacros/:id/answer — registra una respuesta puntual con métricas
  r.post("/simulacros/:id/answer", auth.requireRole("opositor"), (req, res) => {
    const a = db.findOne("simulacroAttempts",
      (x) => x.id === req.params.id && x.opositorId === req.user.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    if (a.finishedAt) return res.status(409).json({ error: "already_finished" });
    const { qbId, chosen, timeMs, changes, confidence } = req.body || {};
    const idx = (a.questions || []).findIndex((q) => q.qbId === qbId);
    if (idx === -1) return res.status(404).json({ error: "question_not_in_attempt" });
    const q = a.questions[idx];
    q.chosen = chosen != null ? Number(chosen) : null;
    q.timeMs = Math.max(0, Number(timeMs) || 0);
    q.changes = Math.max(0, Number(changes) || 0);
    if (CONFIDENCE_LEVELS.some((c) => c.id === confidence)) q.confidence = confidence;
    db.update("simulacroAttempts", (x) => x.id === a.id, { questions: a.questions });
    res.json({ ok: true });
  });

  // POST /simulacros/:id/finish — calcula score y devuelve análisis
  r.post("/simulacros/:id/finish", auth.requireRole("opositor"), (req, res) => {
    const a = db.findOne("simulacroAttempts",
      (x) => x.id === req.params.id && x.opositorId === req.user.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    if (a.finishedAt) return res.json({ attempt: a, analysis: analyze(a) });
    const correctCount = (a.questions || []).filter((q) => q.chosen === q.correct).length;
    const total = (a.questions || []).length || 1;
    const score = +((correctCount / total) * 10).toFixed(2);
    const finishedAt = new Date().toISOString();
    const durationSec = Math.round((new Date(finishedAt).getTime() - new Date(a.startedAt).getTime()) / 1000);
    const updated = db.update("simulacroAttempts", (x) => x.id === a.id, {
      finishedAt, durationSec, score,
    });
    res.json({ attempt: updated, analysis: analyze(updated) });
  });

  // GET /simulacros/mine — historial del opositor
  r.get("/simulacros/mine", auth.requireRole("opositor"), (req, res) => {
    const list = db.find("simulacroAttempts", (a) => a.opositorId === req.user.id)
      .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
    res.json({ attempts: list.map((a) => ({
      id: a.id, processId: a.processId, startedAt: a.startedAt, finishedAt: a.finishedAt,
      durationSec: a.durationSec, score: a.score,
      questionsCount: (a.questions || []).length,
    })) });
  });

  // GET /simulacros/:id/analysis — análisis cognitivo del simulacro terminado
  r.get("/simulacros/:id/analysis", auth.requireRole("opositor", "preparador", "admin", "superadmin"), (req, res) => {
    const a = db.findOne("simulacroAttempts", (x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "opositor" && a.opositorId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    if (req.user.role !== "opositor" && a.organizationId !== orgOf(req)) {
      return res.status(403).json({ error: "forbidden" });
    }
    res.json({ analysis: analyze(a) });
  });

  return r;
};

// Análisis cognitivo de un simulacro: calibración + tiempos + cambios
function analyze(a) {
  const qs = a.questions || [];
  if (!qs.length) return null;
  // Calibración: ¿declaras alta confianza solo cuando aciertas?
  let calibrated = 0, calibTotal = 0;
  for (const q of qs) {
    if (!q.confidence) continue;
    calibTotal += 1;
    const correct = q.chosen === q.correct;
    const wellCalibrated = (q.confidence === "sure" && correct) ||
                           (q.confidence === "guess" && !correct) ||
                           (q.confidence === "doubt");
    if (wellCalibrated) calibrated += 1;
  }
  // Tiempos
  const times = qs.map((q) => q.timeMs).filter((t) => t > 0);
  const avgTimeMs = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  const slowest = qs
    .map((q, i) => ({ idx: i, qbId: q.qbId, timeMs: q.timeMs, correct: q.chosen === q.correct }))
    .filter((x) => x.timeMs > avgTimeMs * 1.8)
    .sort((a, b) => b.timeMs - a.timeMs)
    .slice(0, 5);
  // Cambios de respuesta
  const changers = qs.filter((q) => q.changes > 0).length;
  const changersWin = qs.filter((q) => q.changes > 0 && q.chosen === q.correct).length;
  // Mapa de vulnerabilidad: aciertas pero con baja confianza, o muchos cambios
  const vulnerable = qs
    .map((q) => ({
      qbId: q.qbId, correct: q.chosen === q.correct, confidence: q.confidence, changes: q.changes,
    }))
    .filter((x) => x.correct && (x.confidence === "guess" || x.confidence === "doubt" || x.changes >= 2))
    .slice(0, 10);
  return {
    score: a.score,
    durationSec: a.durationSec,
    calibrationPct: calibTotal ? Math.round((calibrated / calibTotal) * 100) : null,
    avgTimeMs,
    slowestQuestions: slowest,
    changersCount: changers,
    changersAccuracyPct: changers ? Math.round((changersWin / changers) * 100) : null,
    vulnerabilityMap: vulnerable,
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
