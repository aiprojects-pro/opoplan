// Bot de Telegram (catálogo §B.4 — Multi-canal).
//
// El bot recibe comandos del opositor y le responde:
//   /start       — vincula el chat de Telegram con su cuenta de OpoPlan
//                  (genera un código que el opositor introduce en la web).
//   /preguntadia — pregunta del día de su academia.
//   /miprogreso  — racha actual + media reciente.
//   /examen      — días que faltan para su examen + tip motivacional.
//
// Activación:
//   1. Crear bot con @BotFather → obtener BOT_TOKEN
//   2. En .env poner TELEGRAM_BOT_TOKEN=...
//   3. Configurar webhook a https://tu-dominio/api/telegram/webhook
//      (usando POST https://api.telegram.org/bot{TOKEN}/setWebhook)
//
// Sin BOT_TOKEN, el módulo se carga pero no responde a nada (mock no-op).
// Esto permite tener los endpoints siempre montados sin fallar el arranque.

const db = require("../lib/db");
const crypto = require("node:crypto");

const TG_API = "https://api.telegram.org";

function makeMock() {
  return {
    provider: "mock",
    enabled: false,
    async sendMessage() { return { mock: true }; },
    async setWebhook() { return { mock: true }; },
  };
}

function makeReal({ token }) {
  if (!token) return makeMock();
  async function callApi(method, body) {
    const res = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`telegram_${method}_${data.description || res.status}`);
    return data.result;
  }
  return {
    provider: "telegram",
    enabled: true,
    sendMessage: ({ chat_id, text, parse_mode = "Markdown" }) =>
      callApi("sendMessage", { chat_id, text, parse_mode }),
    setWebhook: ({ url, secret_token }) =>
      callApi("setWebhook", { url, secret_token, allowed_updates: ["message"] }),
    deleteWebhook: () => callApi("deleteWebhook", {}),
    getMe: () => callApi("getMe", {}),
  };
}

function fromEnv(env) {
  if (env && env.TELEGRAM_BOT_TOKEN) return makeReal({ token: env.TELEGRAM_BOT_TOKEN });
  return makeMock();
}

// ── Vinculación opositor ↔ chat ID de Telegram ─────────────────────────────

// Genera un código de 8 dígitos que el opositor introduce en la web tras
// hacer /start desde su Telegram. Caduca en 10 min.
function createLinkCode({ telegramChatId, telegramUsername }) {
  const code = String(Math.floor(10000000 + Math.random() * 90000000));
  db.insert("telegramLinks", {
    id: `tgl_${crypto.randomBytes(4).toString("hex")}`,
    code,
    telegramChatId: String(telegramChatId),
    telegramUsername: telegramUsername || "",
    opositorId: null, // se rellena cuando el opositor confirma desde la web
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    confirmed: false,
  });
  return code;
}

function findChatIdForOpositor(opositorId) {
  const link = db.findOne("telegramLinks",
    (l) => l.opositorId === opositorId && l.confirmed);
  return link?.telegramChatId || null;
}

// ── Procesamiento de comandos ──────────────────────────────────────────────

async function handleUpdate(update, bot) {
  if (!update?.message) return;
  const msg = update.message;
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();
  const username = msg.from?.username || "";
  if (!chatId) return;

  // Buscar opositor vinculado
  const link = db.findOne("telegramLinks",
    (l) => String(l.telegramChatId) === String(chatId) && l.confirmed);
  const opositor = link?.opositorId
    ? db.findOne("users", (u) => u.id === link.opositorId)
    : null;

  if (text.startsWith("/start")) {
    const code = createLinkCode({ telegramChatId: chatId, telegramUsername: username });
    await bot.sendMessage({
      chat_id: chatId,
      text: `¡Hola! 👋\n\nPara vincular este chat con tu cuenta de OpoPlan, introduce este código en la sección *Multi-canal* de tu panel:\n\n\`${code}\`\n\nEl código caduca en 10 minutos.`,
    });
    return;
  }

  if (!opositor) {
    await bot.sendMessage({
      chat_id: chatId,
      text: "Este chat aún no está vinculado a una cuenta de OpoPlan. Usa /start para vincularlo.",
    });
    return;
  }

  if (text.startsWith("/preguntadia")) {
    const today = new Date().toISOString().slice(0, 10);
    const pool = db.find("questionBank",
      (q) => q.organizationId === opositor.organizationId && q.active !== false);
    if (!pool.length) {
      await bot.sendMessage({ chat_id: chatId, text: "Tu academia todavía no tiene banco de preguntas." });
      return;
    }
    const seed = today.split("-").reduce((s, x) => s + Number(x), 0);
    const q = pool[seed % pool.length];
    const opts = q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n");
    await bot.sendMessage({
      chat_id: chatId,
      text: `*Pregunta del día (${today})*\n\n${q.text}\n\n${opts}\n\n_Responde mentalmente y mira la solución dentro de un rato:_\n||Respuesta correcta: ${String.fromCharCode(65 + q.correct)}||`,
      parse_mode: "MarkdownV2",
    });
    return;
  }

  if (text.startsWith("/miprogreso")) {
    const sims = db.find("simulacroAttempts",
      (a) => a.opositorId === opositor.id && a.finishedAt);
    const last5 = sims.slice(-5);
    const avg = last5.length ? last5.reduce((s, a) => s + (a.score || 0), 0) / last5.length : 0;
    // Streak
    const habits = db.find("habits", (h) => h.opositorId === opositor.id).map((h) => h.date);
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let streak = 0;
    if (habits.includes(today) || habits.includes(yest)) {
      let cursor = habits.includes(today) ? today : yest;
      while (habits.includes(cursor)) {
        streak += 1;
        const d = new Date(cursor + "T00:00:00");
        d.setDate(d.getDate() - 1);
        cursor = d.toISOString().slice(0, 10);
      }
    }
    await bot.sendMessage({
      chat_id: chatId,
      text: `*Tu progreso* 📊\n\n🔥 Racha: *${streak}* días\n📝 Simulacros: *${sims.length}*\n📈 Media últimos 5: *${avg.toFixed(2)}/10*`,
    });
    return;
  }

  if (text.startsWith("/examen")) {
    const examDate = opositor.commitment?.examDate;
    if (!examDate) {
      await bot.sendMessage({ chat_id: chatId, text: "No tienes fecha de examen configurada todavía. Pon una en tu compromiso." });
      return;
    }
    const days = Math.max(0, Math.floor((new Date(examDate + "T00:00:00") - Date.now()) / 86400000));
    let tip;
    if (days <= 7) tip = "🎯 *Última semana.* No estudies temario nuevo. Repasa lo que ya dominas y descansa la víspera.";
    else if (days <= 30) tip = "📚 *Mes final.* Simulacros completos cronometrados, ¡mantén el ritmo!";
    else if (days <= 90) tip = "💪 Vas en tiempo. Buena hora para empezar simulacros de adaptación.";
    else tip = "🌱 Aún hay margen. La constancia diaria es lo que marca la diferencia.";
    await bot.sendMessage({
      chat_id: chatId,
      text: `*${opositor.commitment?.examName || "Tu examen"}* 📅\n\nFaltan *${days} días*.\n\n${tip}`,
    });
    return;
  }

  if (text.startsWith("/help") || text === "?") {
    await bot.sendMessage({
      chat_id: chatId,
      text: "Comandos disponibles:\n/preguntadia — pregunta tipo test del día\n/miprogreso — tu racha + nota media\n/examen — días que faltan para tu examen\n/help — esta ayuda",
    });
    return;
  }

  // Comando desconocido
  await bot.sendMessage({
    chat_id: chatId,
    text: "No entiendo ese mensaje. Usa /help para ver los comandos.",
  });
}

// El opositor confirma el código desde la web → vinculamos
function confirmLinkCode({ code, opositorId }) {
  const link = db.findOne("telegramLinks",
    (l) => l.code === code && !l.confirmed && new Date(l.expiresAt) > new Date());
  if (!link) return null;
  return db.update("telegramLinks", (l) => l.id === link.id, {
    opositorId,
    confirmed: true,
    confirmedAt: new Date().toISOString(),
  });
}

module.exports = {
  fromEnv, makeMock, makeReal,
  handleUpdate, createLinkCode, confirmLinkCode, findChatIdForOpositor,
};
