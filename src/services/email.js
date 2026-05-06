// ─────────────────────────────────────────────────────────────────────────────
// Servicio de email. Tres modos:
//   - "mock": no envía, solo registra en consola (default si no hay claves).
//   - "resend": usa la API de Resend (recomendado, free tier 3.000/mes).
//   - "smtp": nodemailer contra cualquier SMTP (Gmail, Office365, etc.).
// Cada academia puede sobreescribir el proveedor desde su panel de admin.
// ─────────────────────────────────────────────────────────────────────────────

function makeMock() {
  return {
    provider: "mock",
    async send({ to, subject, html, text }) {
      console.log("[email:mock] →", to, "·", subject);
      return { ok: true, mocked: true };
    },
  };
}

function makeResend({ apiKey, from }) {
  return {
    provider: "resend",
    async send({ to, subject, html, text, replyTo }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html: html || undefined,
          text: text || undefined,
          reply_to: replyTo || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[email:resend] error", res.status, err);
        return { ok: false, error: err };
      }
      const data = await res.json();
      return { ok: true, id: data.id };
    },
  };
}

function makeSmtp(opts) {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: Number(opts.port || 587),
    secure: String(opts.secure) === "true",
    auth: opts.user ? { user: opts.user, pass: opts.password } : undefined,
  });
  return {
    provider: "smtp",
    async send({ to, subject, html, text, replyTo }) {
      try {
        const info = await transporter.sendMail({
          from: opts.from,
          to,
          subject,
          html,
          text,
          replyTo,
        });
        return { ok: true, id: info.messageId };
      } catch (e) {
        console.error("[email:smtp] error", e.message);
        return { ok: false, error: e.message };
      }
    },
  };
}

function fromEnv(env) {
  const provider = (env.EMAIL_PROVIDER || "mock").toLowerCase();
  if (provider === "resend" && env.RESEND_API_KEY) {
    return makeResend({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM || "noreply@opoplan.es" });
  }
  if (provider === "smtp" && env.SMTP_HOST) {
    return makeSmtp({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM || env.SMTP_USER,
    });
  }
  return makeMock();
}

// Construye un servicio desde la config de una organización (sobreescribe global)
function fromOrg(org, fallback) {
  const cfg = org && org.integrations && org.integrations.email;
  if (!cfg || !cfg.enabled) return fallback;
  if (cfg.provider === "resend" && cfg.apiKey) {
    return makeResend({ apiKey: cfg.apiKey, from: cfg.from || "noreply@opoplan.es" });
  }
  if (cfg.provider === "smtp" && cfg.host) {
    return makeSmtp({ ...cfg, from: cfg.from || cfg.user });
  }
  return fallback;
}

module.exports = { fromEnv, fromOrg, makeMock, makeResend, makeSmtp };
