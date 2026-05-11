const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const aiService = require("../services/ai");

// ─────────────────────────────────────────────────────────────────────────────
// Herramientas de IA para el opositor (transcripción ~20:43, ~20:48).
// El opositor genera tests, resúmenes y mapas conceptuales sobre su temario
// (el de la academia o el suyo propio). El coste lo asume el opositor con
// su API key personal (~20:53). Si no tiene IA personal, se cae al fallback
// de la organización o al global.
//
// Sin flashcards (~20:44).
// Resúmenes con dos modos (~20:48):
//   - test_concise   → ideal para tipo test (datos secos, listas)
//   - development    → desarrollo extendido, prosa para temas abiertos
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function aiToolsRoutes({ env } = {}) {
  const r = express.Router();
  r.use(auth.requireAuth);

  // Helper: obtiene la IA para este opositor con cadena de fallback
  function aiFor(user) {
    const orgFallback = aiService.fromEnv(env || process.env);
    return aiService.fromUser(user, orgFallback);
  }

  // Helper: obtiene el tema (de academia o personal)
  function findTopic(user, source, topicId) {
    if (source === "personal") {
      const syl = db.findOne("personalSyllabi", (s) => s.opositorId === user.id);
      if (!syl) return null;
      return (syl.topics || []).find((t) => t.id === topicId) || null;
    }
    // Por defecto: temario de la academia (el del preparador asignado)
    const assignment = db.findOne("assignments", (a) => a.opositorId === user.id && a.active);
    if (!assignment) return null;
    const syllabi = db.find("syllabi", (s) => s.preparadorId === assignment.preparadorId);
    for (const s of syllabi) {
      const t = (s.topics || []).find((x) => x.id === topicId);
      if (t) return { ...t, syllabusTitle: s.title };
    }
    return null;
  }

  // Helper: registra el artefacto generado para que el opositor lo recupere
  function saveArtifact({ user, kind, source, topicId, topicTitle, payload }) {
    return db.insert("aiArtifacts", {
      id: db.id("ai"),
      organizationId: user.organizationId,
      opositorId: user.id,
      kind,
      source,
      topicId,
      topicTitle,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  // ── GET /ai/artifacts ─────────────────────────────────────────────────────
  // Lista los artefactos generados por el opositor (historial).
  r.get("/ai/artifacts", auth.requireRole("opositor"), (req, res) => {
    const list = db.find("aiArtifacts", (a) => a.opositorId === req.user.id)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ artifacts: list });
  });

  r.delete("/ai/artifacts/:id", auth.requireRole("opositor"), (req, res) => {
    const a = db.findOne("aiArtifacts", (x) => x.id === req.params.id && x.opositorId === req.user.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    db.remove("aiArtifacts", (x) => x.id === a.id);
    res.json({ ok: true });
  });

  // ── POST /ai/generate-test ────────────────────────────────────────────────
  // Body: { topicId, source: "academy"|"personal", count: 10, type: "abc" }
  r.post("/ai/generate-test", auth.requireRole("opositor"), async (req, res) => {
    const { topicId, source = "academy", count = 10, type = "abcd" } = req.body || {};
    if (!topicId) return res.status(400).json({ error: "missing_topic" });
    const topic = findTopic(req.user, source, topicId);
    if (!topic) return res.status(404).json({ error: "topic_not_found" });

    const ai = aiFor(req.user);
    const prompt = `Genera ${Number(count) || 10} preguntas tipo test ${type === "abc" ? "(3 opciones A, B, C)" : "(4 opciones A, B, C, D)"} sobre el tema "${topic.number || ""} ${topic.title}".
Devuelve estrictamente JSON con esta forma:
{"questions":[{"q":"...","options":["A...","B...","C..."${type === "abc" ? "" : ',"D..."'}],"correct":0,"explanation":"..."}]}
No añadas texto antes ni después del JSON.`;
    let result;
    try {
      result = await ai.ask({ prompt });
    } catch (e) {
      return res.status(502).json({ error: "ai_failed", detail: e.message });
    }
    const raw = result?.text || "";
    // Intentar parsear; si falla, devolver la respuesta cruda como mejor esfuerzo
    let parsed = null;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : raw);
    } catch {
      parsed = { raw, mocked: result?.mocked || false };
    }
    if (result?.mocked) parsed.mocked = true;
    const artifact = saveArtifact({
      user: req.user,
      kind: "test",
      source,
      topicId,
      topicTitle: `${topic.number || ""} ${topic.title}`.trim(),
      payload: parsed,
    });
    res.json({ artifact });
  });

  // ── POST /ai/generate-summary ─────────────────────────────────────────────
  // Body: { topicId, source, mode: "test_concise" | "development" }
  r.post("/ai/generate-summary", auth.requireRole("opositor"), async (req, res) => {
    const { topicId, source = "academy", mode = "test_concise" } = req.body || {};
    if (!topicId) return res.status(400).json({ error: "missing_topic" });
    const topic = findTopic(req.user, source, topicId);
    if (!topic) return res.status(404).json({ error: "topic_not_found" });

    const ai = aiFor(req.user);
    const styleHint = mode === "development"
      ? "Resumen amplio y desarrollado, en prosa, ideal para una oposición de desarrollo. Incluye introducción, desarrollo estructurado por epígrafes y conclusión. Apunta a 1500-2500 palabras."
      : "Resumen conciso, esquemático, con bullets y datos clave. Ideal para preparar un examen tipo test. Sin introducciones largas. Máximo 600 palabras.";
    const prompt = `Tema: "${topic.number || ""} ${topic.title}". ${styleHint}\n\nDevuelve el resumen en formato Markdown.`;
    let result;
    try {
      result = await ai.ask({ prompt });
    } catch (e) {
      return res.status(502).json({ error: "ai_failed", detail: e.message });
    }
    const text = result?.text || "";
    const artifact = saveArtifact({
      user: req.user,
      kind: "summary",
      source,
      topicId,
      topicTitle: `${topic.number || ""} ${topic.title}`.trim(),
      payload: { mode, text, mocked: result?.mocked || false },
    });
    res.json({ artifact });
  });

  // ── POST /ai/generate-concept-map ─────────────────────────────────────────
  // Devuelve un mapa conceptual como árbol de nodos
  r.post("/ai/generate-concept-map", auth.requireRole("opositor"), async (req, res) => {
    const { topicId, source = "academy" } = req.body || {};
    if (!topicId) return res.status(400).json({ error: "missing_topic" });
    const topic = findTopic(req.user, source, topicId);
    if (!topic) return res.status(404).json({ error: "topic_not_found" });

    const ai = aiFor(req.user);
    const prompt = `Genera un mapa conceptual del tema "${topic.number || ""} ${topic.title}".
Devuelve estrictamente JSON con la forma:
{"root":{"label":"...","children":[{"label":"...","children":[{"label":"..."}]}]}}
Profundidad máxima 3 niveles. Entre 5 y 8 ramas principales. No añadas texto antes ni después del JSON.`;
    let result;
    try {
      result = await ai.ask({ prompt });
    } catch (e) {
      return res.status(502).json({ error: "ai_failed", detail: e.message });
    }
    const raw = result?.text || "";
    let parsed = null;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : raw);
    } catch {
      parsed = { raw, mocked: result?.mocked || false };
    }
    if (result?.mocked) parsed.mocked = true;
    const artifact = saveArtifact({
      user: req.user,
      kind: "conceptMap",
      source,
      topicId,
      topicTitle: `${topic.number || ""} ${topic.title}`.trim(),
      payload: parsed,
    });
    res.json({ artifact });
  });

  // ── Temario propio del opositor (~20:43) ──────────────────────────────────

  r.get("/ai/personal-syllabus", auth.requireRole("opositor"), (req, res) => {
    let syl = db.findOne("personalSyllabi", (s) => s.opositorId === req.user.id);
    if (!syl) {
      syl = db.insert("personalSyllabi", {
        id: db.id("ps"),
        organizationId: req.user.organizationId,
        opositorId: req.user.id,
        title: "Mi temario",
        topics: [],
      });
    }
    res.json({ syllabus: syl });
  });

  r.post("/ai/personal-syllabus/topics", auth.requireRole("opositor"), (req, res) => {
    let syl = db.findOne("personalSyllabi", (s) => s.opositorId === req.user.id);
    if (!syl) {
      syl = db.insert("personalSyllabi", {
        id: db.id("ps"),
        organizationId: req.user.organizationId,
        opositorId: req.user.id,
        title: "Mi temario",
        topics: [],
      });
    }
    const topic = {
      id: db.id("pt"),
      number: req.body.number || `Tema ${syl.topics.length + 1}`,
      title: req.body.title || "Sin título",
      block: req.body.block || "",
      difficulty: req.body.difficulty || "Media",
      priority: req.body.priority || "Media",
      attachments: [],
    };
    syl.topics.push(topic);
    db.update("personalSyllabi", (s) => s.id === syl.id, { topics: syl.topics });
    res.json({ topic });
  });

  r.delete("/ai/personal-syllabus/topics/:tid", auth.requireRole("opositor"), (req, res) => {
    const syl = db.findOne("personalSyllabi", (s) => s.opositorId === req.user.id);
    if (!syl) return res.status(404).json({ error: "not_found" });
    syl.topics = (syl.topics || []).filter((t) => t.id !== req.params.tid);
    db.update("personalSyllabi", (s) => s.id === syl.id, { topics: syl.topics });
    res.json({ ok: true });
  });

  return r;
};
