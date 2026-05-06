const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const aiService = require("../services/ai");

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot por opositor.
//
// Reglas:
//   - El preparador debe activar previamente el chatbot del opositor
//     (campo `chatbotEnabled` en el usuario opositor).
//   - El opositor crea hilos (threads) y envía mensajes.
//   - Cada mensaje se almacena. La respuesta del bot se guarda en el mismo hilo.
//   - El preparador puede ver todas las conversaciones de sus opositores.
//   - Si la academia no tiene Gemini configurado se usa mock con aviso.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function chatRoutes({ env }) {
  const r = express.Router();
  r.use(auth.requireAuth);

  function getAi(orgId) {
    const fallback = aiService.fromEnv(env || process.env);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    return aiService.fromOrg(org, fallback);
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
    // Ordenar por última actualización descendente
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

  // ── Enviar mensaje + respuesta de la IA ───────────────────────────────────

  r.post("/chat/threads/:id/messages", auth.requireRole("opositor"), async (req, res) => {
    const t = db.findOne("chatThreads", (x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "not_found" });
    if (t.opositorId !== req.user.id) return res.status(403).json({ error: "forbidden" });
    const opositor = db.findOne("users", (u) => u.id === req.user.id);
    if (!opositor?.chatbotEnabled) {
      return res.status(403).json({ error: "chatbot_not_enabled" });
    }

    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "empty_message" });

    // Construir contexto: temario, plan, últimos resultados de pruebas
    const ai = getAi(req.user.organizationId);
    const context = buildContext(opositor);
    const system = `Eres un asistente educativo para opositores españoles. Responde en español, de forma clara y concisa. Cita siempre al BOE o normativa cuando proceda. Información del estudiante:\n${context}\n\nIMPORTANTE: tus respuestas son revisadas por su preparador. No inventes datos. Si no estás seguro, dilo. No proporciones contenido inapropiado, off-topic o que pueda perjudicar el aprendizaje.`;

    const history = (t.messages || []).map((m) => ({ role: m.role, text: m.text }));

    // Guardamos primero el mensaje del usuario
    const userMsg = { id: db.id("msg"), role: "user", text, at: new Date().toISOString() };
    const messages = [...(t.messages || []), userMsg];

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
      // Auto-titular el hilo si era el primer mensaje
      ...(t.title === "Nueva conversación" && messages.length <= 2
        ? { title: text.slice(0, 60) }
        : {}),
    });

    res.json({ userMessage: userMsg, botMessage: botMsg });
  });

  // ── Borrar hilo ────────────────────────────────────────────────────────────

  r.delete("/chat/threads/:id", (req, res) => {
    const t = db.findOne("chatThreads", (x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "not_found" });
    if (!canSeeThread(req.user, t)) return res.status(403).json({ error: "forbidden" });
    db.remove("chatThreads", (x) => x.id === t.id);
    res.json({ ok: true });
  });

  // ── Activar / desactivar el chatbot por opositor (solo preparador/admin) ──

  r.patch("/chat/users/:opositorId/enable", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const opo = db.findOne("users", (u) => u.id === req.params.opositorId && u.role === "opositor");
    if (!opo) return res.status(404).json({ error: "not_found" });
    // Si es preparador, comprobar asignación
    if (req.user.role === "preparador") {
      const a = db.findOne("assignments", (x) => x.opositorId === opo.id && x.active);
      if (!a || a.preparadorId !== req.user.id) return res.status(403).json({ error: "forbidden" });
    }
    const enabled = !!req.body?.enabled;
    const updated = db.update("users", (u) => u.id === opo.id, { chatbotEnabled: enabled });
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
    // Últimos resultados
    const recent = db.find("assessments", (a) => a.opositorId === opositor.id)
      .slice(-3)
      .map((a) => `${a.title} (${a.type}): ${a.score ?? "?"}/${a.maxScore || 10}`);
    if (recent.length) lines.push(`- Pruebas recientes: ${recent.join("; ")}`);
    return lines.join("\n");
  }
};
