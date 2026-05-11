const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const tg = require("../services/telegramBot");

module.exports = function telegramRoutes({ env } = {}) {
  const r = express.Router();
  const bot = tg.fromEnv(env || process.env);
  const webhookSecret = (env || process.env).TELEGRAM_WEBHOOK_SECRET;

  // Webhook endpoint que llama Telegram con cada mensaje al bot.
  // Telegram envía un header X-Telegram-Bot-Api-Secret-Token con el secret
  // que configuramos al hacer setWebhook — verificamos para evitar spoofing.
  r.post("/telegram/webhook", express.json(), async (req, res) => {
    if (!bot.enabled) return res.status(404).end();
    if (webhookSecret) {
      const sig = req.headers["x-telegram-bot-api-secret-token"];
      if (sig !== webhookSecret) return res.status(401).json({ error: "bad_signature" });
    }
    try {
      await tg.handleUpdate(req.body, bot);
      res.json({ ok: true });
    } catch (e) {
      console.error("[telegram:handle]", e);
      res.json({ ok: false }); // Telegram no reintenta si devolvemos 200
    }
  });

  // Endpoint para que el opositor confirme el código en la web tras /start
  r.post("/telegram/confirm", auth.requireRole("opositor"), (req, res) => {
    const code = (req.body?.code || "").trim();
    if (!code) return res.status(400).json({ error: "missing_code" });
    const link = tg.confirmLinkCode({ code, opositorId: req.user.id });
    if (!link) return res.status(404).json({ error: "invalid_or_expired_code" });
    res.json({ linked: true, telegramUsername: link.telegramUsername });
  });

  // Estado de vinculación del opositor
  r.get("/telegram/status", auth.requireRole("opositor"), (req, res) => {
    const chatId = tg.findChatIdForOpositor(req.user.id);
    res.json({
      enabled: bot.enabled,
      linked: !!chatId,
      chatId: chatId,
      botUsername: (env || process.env).TELEGRAM_BOT_USERNAME || null,
    });
  });

  // Desvincular
  r.post("/telegram/unlink", auth.requireRole("opositor"), (req, res) => {
    db.remove("telegramLinks", (l) => l.opositorId === req.user.id);
    res.json({ unlinked: true });
  });

  // Setup webhook (solo superadmin) — para activar el webhook tras desplegar
  r.post("/telegram/setup-webhook", auth.requireRole("superadmin"), async (req, res) => {
    if (!bot.enabled) return res.status(400).json({ error: "bot_not_configured" });
    const url = req.body?.url;
    if (!url) return res.status(400).json({ error: "missing_url" });
    try {
      const result = await bot.setWebhook({ url, secret_token: webhookSecret });
      res.json({ ok: true, result });
    } catch (e) {
      res.status(500).json({ error: "setup_failed", message: e.message });
    }
  });

  return r;
};
