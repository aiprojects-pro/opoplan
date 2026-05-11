const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const aiService = require("../services/ai");
const { CHATBOT_MODES } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot por opositor.
//
// Bug arreglado de la conversación (~20:18): el preparador no podía activar
// el chat con sus opositores ("conversaciones de mis opositores aquí no
// selecciona una conversación. Si yo activo aquí no puedo todavía
// comunicarme con ellos"). Causa: el toggle estaba a nivel global del
// preparador en lugar de PER OPOSITOR. Solucionado: el chatbot se activa por
// opositor (siempre fue así en el modelo) pero ahora el endpoint funciona aun
// cuando el preparador no haya seleccionado conversación, y devuelve el modo
// de chatbot que el preparador haya elegido (~20:18: "que esto se podría
// programar... son cosas generales contéstale tú; si es específica espérate").
//
// Modos (constants.CHATBOT_MODES):
//   - off
//   - supervised: la IA NO responde; el opositor deja la duda, el preparador
//     contesta cuando puede (manual)
//   - auto_general: la IA responde dudas generales (planificación, técnicas
//     de estudio). Las dudas específicas las marca como "para el preparador"
//   - auto_full: la IA responde todo
//
// Selección de IA (orden de prioridad):
//   1. IA personal del opositor (su propia API key, ~20:53)
//   2. IA del preparador
//   3. IA de la academia
//   4. ENV global
//   5. Mock
// ─────────────────────────────────────────────────────────────────────────────

const SPECIFIC_KEYWORDS = [
  "tema ", "artículo", "ley ", "real decreto", "constitución",
  "sentencia", "norma", "boletín", "boe", "test del", "examen del",
  "supuesto", "rúbrica",
];

function classifyQuestion(text) {
  const t = String(text || "").toLowerCase();
  if (SPECIFIC_KEYWORDS.some((k) => t.includes(k))) return "specific";
  return "general";
}

module.exports = function chatRoutes({ env }) {
  const r = express.Router();
  r.use(auth.requireAuth);

  function getAi(opositor) {
    const fallbackEnv = aiService.fromEnv(env || process.env);
    const org = db.findOne("organizations", (o) => o.id === opositor.organizationId);
    let ai = aiService.fromOrg(org, fallbackEnv);

    // Si su preparador tiene IA personal, prevalece sobre la academia
    const a = db.findOne("assignments", (x) => x.opositorId === opositor.id && x.active);
    if (a) {
      const prep = db.findOne("users", (u) => u.id === a.preparadorId);
      ai = aiService.fromUser(prep, ai);
    }
    // Si el opositor tiene IA personal, prevalece sobre todo (~20:53)
    ai = aiService.fromUser(opositor, ai);
    return ai;
  }

  function canSeeThread(user, t) {
    if (user.role === "admin" || user.role === "superadmin") return t.organizationId === user.organizationId || !user.organizationId;
    if (user.role === "opositor") return t.opositorId === user.id;
    if (user.role === "preparador") {
      const a = db.findOne("assignments", (x) => x.opositorId === t.opositorId && x.active);
      return a && a.preparadorId === user.id;
    }
    return false;
  }

  // Modo del chatbot que aplica al opositor: el del preparador asignado.
  function chatModeFor(opositor) {
    const a = db.findOne("assignments", (x) => x.opositorId === opositor.id && x.active);
    if (!a) return "supervised";
    const prep = db.findOne("users", (u) => u.id === a.preparadorId);
    return prep?.chatbotMode || "supervised";
  }

  // ── Estado actual del chat para un opositor ───────────────────────────────
  // Útil para que la UI pinte de forma adecuada (~20:18).
  r.get("/chat/status", auth.requireRole("opositor"), (req, res) => {
    const opositor = db.findOne("users", (u) => u.id === req.user.id);
    if (!opositor) return res.status(404).json({ error: "not_found" });
    const mode = chatModeFor(opositor);
    res.json({
      enabled: !!opositor.chatbotEnabled,
      mode,
      modeLabel: CHATBOT_MODES.find((m) => m.id === mode)?.label || mode,
      hasPersonalAi: !!opositor.ai?.enabled,
    });
  });

  // ── Listar hilos ───────────────────────────────────────────────────────────

  r.get("/chat/threads", (req, res) => {
    const orgId = req.user.organizationId;
    let list = db.find("chatThreads", (t) => t.organizationId === orgId);
    if (req.user.role === "opositor") list = list.filter((t) => t.opositorId === req.user.id);
    if (req.user.role === "preparador") {
      const myOpos = db
        .find("assignments", (x) => x.preparadorId === req.user.id && x.active)
        .map((x) => x.opositorId);
      list = list.filter((t) => myOpos.includes(t.opositorId));
    }
    if (req.query.opositorId) list = list.filter((t) => t.opositorId === req.query.opositorId);
    list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    res.json({ threads: list });
  });

  r.get("/chat/threads/:id", (req, res) => {
    const t = db.findOne("chatThreads", (x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "not_found" });
    if (!canSeeThread(req.user, t)) return res.status(403).json({ error: "forbidden" });
    res.json({ thread: t });
  });

  // ── Crear hilo ─────────────────────────────────────────────────────────────

  r.post("/chat/threads", auth.requireRole("opositor"), (req, res) => {
    const opositor = db.findOne("users", (u) => u.id === req.user.id);
    if (!opositor?.chatbotEnabled) {
      return res.status(403).json({ error: "chatbot_not_enabled", message: "Tu preparador todavía no ha activado el asistente." });
    }
    const t = db.insert("chatThreads", {
      id: db.id("th"),
      organizationId: req.user.organizationId,
      opositorId: req.user.id,
      title: req.body?.title || "Nueva conversación",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    res.json({ thread: t });
  });

  // ── Enviar mensaje ────────────────────────────────────────────────────────

  r.post("/chat/threads/:id/messages", auth.requireRole("opositor"), async (req, res) => {
    const t = db.findOne("chatThreads", (x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "not_found" });
    if (t.opositorId !== req.user.id) return res.status(403).json({ error: "forbidden" });
    const opositor = db.findOne("users", (u) => u.id === req.user.id);
    if (!opositor?.chatbotEnabled) return res.status(403).json({ error: "chatbot_not_enabled" });

    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "empty_message" });

    const mode = chatModeFor(opositor);

    // Mensaje del usuario siempre se guarda
    const userMsg = { id: db.id("msg"), role: "user", text, at: new Date().toISOString() };
    const messages = [...(t.messages || []), userMsg];

    // Si el modo es "off" o "supervised", no respondemos automáticamente.
    if (mode === "off" || mode === "supervised") {
      const note = {
        id: db.id("msg"),
        role: "system",
        text: "Tu pregunta queda registrada. Tu preparador la verá y te responderá.",
        at: new Date().toISOString(),
      };
      messages.push(note);
      db.update("chatThreads", (x) => x.id === t.id, {
        messages,
        updatedAt: new Date().toISOString(),
        ...(t.title === "Nueva conversación" ? { title: text.slice(0, 60) } : {}),
      });
      return res.json({ userMessage: userMsg, botMessage: note, mode });
    }

    // Si el modo es "auto_general" y la pregunta parece específica,
    // dejamos pendiente para el preparador.
    if (mode === "auto_general" && classifyQuestion(text) === "specific") {
      const note = {
        id: db.id("msg"),
        role: "system",
        text: "Esta pregunta parece específica de tu temario. La he marcado para que la responda tu preparador. Si quieres una respuesta inmediata, reformula la duda en términos generales.",
        at: new Date().toISOString(),
      };
      messages.push(note);
      db.update("chatThreads", (x) => x.id === t.id, {
        messages,
        updatedAt: new Date().toISOString(),
        ...(t.title === "Nueva conversación" ? { title: text.slice(0, 60) } : {}),
      });
      return res.json({ userMessage: userMsg, botMessage: note, mode });
    }

    // En modo auto, llamamos a la IA
    const ai = getAi(opositor);
    const context = buildContext(opositor);
    const system = `Eres un asistente educativo para opositores españoles. Responde en español de forma clara, concisa y amable. Cita el BOE o la normativa aplicable cuando proceda. Información del estudiante:\n${context}\n\nIMPORTANTE: tus respuestas son revisadas por su preparador. No inventes datos ni cifras. Si no estás seguro, dilo.`;
    const history = (t.messages || []).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));

    let aiResponse;
    try {
      aiResponse = await ai.ask({ system, prompt: text, history });
    } catch (e) {
      console.error("[chat:ai]", e);
      aiResponse = { text: "Error al consultar el asistente. Inténtalo de nuevo en un momento.", error: true };
    }

    const botMsg = {
      id: db.id("msg"),
      role: "assistant",
      text: aiResponse.text,
      at: new Date().toISOString(),
      provider: ai.provider,
      mocked: !!aiResponse.mocked,
    };
    messages.push(botMsg);

    db.update("chatThreads", (x) => x.id === t.id, {
      messages,
      updatedAt: new Date().toISOString(),
      ...(t.title === "Nueva conversación" && messages.length <= 2 ? { title: text.slice(0, 60) } : {}),
    });

    res.json({ userMessage: userMsg, botMessage: botMsg, mode });
  });

  // El preparador puede contestar manualmente a un hilo (~20:18 – modo
  // supervisado). El mensaje sale como `assistant` con marca `manual: true`.
  r.post("/chat/threads/:id/reply", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const t = db.findOne("chatThreads", (x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "not_found" });
    if (!canSeeThread(req.user, t)) return res.status(403).json({ error: "forbidden" });
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "empty_message" });
    const msg = {
      id: db.id("msg"),
      role: "assistant",
      text,
      at: new Date().toISOString(),
      manual: true,
      authorId: req.user.id,
    };
    const messages = [...(t.messages || []), msg];
    db.update("chatThreads", (x) => x.id === t.id, { messages, updatedAt: new Date().toISOString() });
    res.json({ message: msg });
  });

  r.delete("/chat/threads/:id", (req, res) => {
    const t = db.findOne("chatThreads", (x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "not_found" });
    if (!canSeeThread(req.user, t)) return res.status(403).json({ error: "forbidden" });
    db.remove("chatThreads", (x) => x.id === t.id);
    res.json({ ok: true });
  });

  // ── Activar / desactivar chatbot por opositor (preparador / admin) ────────

  r.patch("/chat/users/:opositorId/enable", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const opo = db.findOne("users", (u) => u.id === req.params.opositorId && u.role === "opositor");
    if (!opo) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "preparador") {
      const a = db.findOne("assignments", (x) => x.opositorId === opo.id && x.active);
      if (!a || a.preparadorId !== req.user.id) return res.status(403).json({ error: "forbidden" });
    }
    const enabled = !!req.body?.enabled;
    const updated = db.update("users", (u) => u.id === opo.id, { chatbotEnabled: enabled });
    const out = { ...updated }; delete out.passwordHash;
    res.json({ user: out });
  });

  // El preparador define su modo global de chatbot
  r.patch("/chat/me/mode", auth.requireRole("preparador"), (req, res) => {
    const mode = req.body?.mode;
    if (!CHATBOT_MODES.find((m) => m.id === mode)) return res.status(400).json({ error: "invalid_mode" });
    const updated = db.update("users", (u) => u.id === req.user.id, { chatbotMode: mode });
    const out = { ...updated }; delete out.passwordHash;
    res.json({ user: out });
  });

  return r;

  function buildContext(opositor) {
    const lines = [];
    lines.push(`- Nombre: ${opositor.name}`);
    if (opositor.commitment?.examName) lines.push(`- Oposición: ${opositor.commitment.examName}`);
    if (opositor.commitment?.examDate) lines.push(`- Fecha objetivo de examen: ${opositor.commitment.examDate}`);
    if (opositor.commitment?.weeklyHours) lines.push(`- Dedicación: ${opositor.commitment.weeklyHours}h/semana`);
    const recent = db.find("assessments", (a) => a.opositorId === opositor.id)
      .slice(-3)
      .map((a) => `${a.title} (${a.type}): ${a.score ?? "?"}/${a.maxScore || 10}`);
    if (recent.length) lines.push(`- Pruebas recientes: ${recent.join("; ")}`);
    return lines.join("\n");
  }
};
