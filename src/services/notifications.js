const db = require("../lib/db");
const emailService = require("./email");

// ─────────────────────────────────────────────────────────────────────────────
// Notificaciones por email con branding de la academia.
// Plantillas: welcome, assignment, eventReminder, announcement.
// Cada envío se registra en la colección "notifications".
// ─────────────────────────────────────────────────────────────────────────────

let globalEmail = null;
function setGlobalEmail(svc) { globalEmail = svc; }

function pickEmailService(orgId) {
  if (!orgId) return globalEmail || emailService.makeMock();
  const org = db.findOne("organizations", (o) => o.id === orgId);
  return emailService.fromOrg(org, globalEmail || emailService.makeMock());
}

function escape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function btn(label, url, color) {
  return `<a href="${escape(url)}" style="display:inline-block;background:${color || "#155ea8"};color:white;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">${escape(label)}</a>`;
}

function shell(orgId, content) {
  const org = orgId ? db.findOne("organizations", (o) => o.id === orgId) : null;
  const name = org?.name || "OpoPlan";
  const primary = org?.branding?.primaryColor || "#155ea8";
  const secondary = org?.branding?.secondaryColor || "#08264a";
  const tagline = org?.branding?.tagline || "Plataforma de preparación de oposiciones";
  const support = org?.contact?.email || org?.integrations?.legal?.supportEmail || "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#142033;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:14px;overflow:hidden;box-shadow:0 6px 20px rgba(8,38,74,0.08);">
      <tr><td style="background:linear-gradient(135deg,${secondary},${primary});padding:28px 32px;color:white;">
        <div style="font-size:22px;font-weight:800;letter-spacing:-0.01em;">${escape(name)}</div>
        <div style="font-size:13px;opacity:0.85;margin-top:4px;">${escape(tagline)}</div>
      </td></tr>
      <tr><td style="padding:32px;font-size:14.5px;line-height:1.6;">${content}</td></tr>
      <tr><td style="background:#eef2f9;padding:18px 32px;font-size:12px;color:#6b7896;text-align:center;">
        Enviado desde ${escape(name)}.${support ? ` · Soporte: <a href="mailto:${escape(support)}" style="color:${primary};">${escape(support)}</a>` : ""}
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

const templates = {
  welcome: (ctx) => ({
    subject: `Bienvenido/a a ${ctx.orgName}`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">¡Hola, ${escape(ctx.name)}!</h2>
       <p>Tu cuenta como <strong>${escape(ctx.role)}</strong> está lista en <strong>${escape(ctx.orgName)}</strong>.</p>
       <p>Ya puedes acceder y empezar a usar la plataforma.</p>
       <p style="margin-top:20px;">${btn("Acceder a mi panel", ctx.appUrl, ctx.primary)}</p>`),
    text: `Hola ${ctx.name}, tu cuenta como ${ctx.role} en ${ctx.orgName} está lista. Accede en ${ctx.appUrl}`,
  }),
  assignment: (ctx) => ({
    subject: `Nuevo opositor asignado: ${ctx.opositorName}`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">Nueva asignación</h2>
       <p><strong>${escape(ctx.opositorName)}</strong> ha sido asignado/a a <strong>${escape(ctx.preparadorName)}</strong>.</p>
       ${ctx.reason ? `<p style="background:#f5f7fb;padding:12px 14px;border-radius:8px;color:#6b7896;font-size:13px;"><strong>Motivo:</strong> ${escape(ctx.reason)}</p>` : ""}
       <p>Revisa el panel para empezar a planificar la preparación.</p>
       <p style="margin-top:20px;">${btn("Abrir panel", ctx.appUrl, ctx.primary)}</p>`),
    text: `${ctx.opositorName} ha sido asignado/a a ${ctx.preparadorName} en ${ctx.orgName}.`,
  }),
  eventReminder: (ctx) => ({
    subject: `Recordatorio: ${ctx.eventTitle} (${ctx.eventDate} ${ctx.eventTime})`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">Tienes un evento próximo</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <table style="margin:16px 0;background:#f5f7fb;border-radius:10px;width:100%;">
         <tr><td style="padding:14px 18px;"><strong>${escape(ctx.eventTitle)}</strong><br/>
         <span style="color:#6b7896;font-size:13px;">${escape(ctx.eventType)} · ${escape(ctx.eventDate)} ${escape(ctx.eventTime)}</span></td></tr>
       </table>
       <p style="margin-top:20px;">${btn("Ver agenda", ctx.appUrl, ctx.primary)}</p>`),
    text: `Recordatorio: ${ctx.eventTitle} el ${ctx.eventDate} a las ${ctx.eventTime}.`,
  }),
  announcement: (ctx) => ({
    subject: `${ctx.orgName}: ${ctx.title}`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">${escape(ctx.title)}</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <p style="white-space:pre-line;">${escape(ctx.body)}</p>
       <p style="margin-top:20px;">${btn("Ver en la plataforma", ctx.appUrl, ctx.primary)}</p>`),
    text: `${ctx.title}\n\n${ctx.body}`,
  }),
};

async function notify({ orgId, to, template, data, appUrl }) {
  if (!to) return { ok: false, error: "missing_to" };
  const fn = templates[template];
  if (!fn) return { ok: false, error: "unknown_template" };

  const org = orgId ? db.findOne("organizations", (o) => o.id === orgId) : null;
  const ctx = {
    ...data,
    orgId,
    orgName: org?.name || "OpoPlan",
    primary: org?.branding?.primaryColor || "#155ea8",
    appUrl: appUrl || data?.appUrl || "",
  };

  const { subject, html, text } = fn(ctx);
  const svc = pickEmailService(orgId);

  let result;
  try {
    result = await svc.send({ to, subject, html, text });
  } catch (e) {
    result = { ok: false, error: e.message };
  }

  db.insert("notifications", {
    id: db.id("n"),
    organizationId: orgId,
    to: Array.isArray(to) ? to.join(", ") : to,
    template,
    subject,
    sentAt: new Date().toISOString(),
    provider: svc.provider,
    ok: !!result.ok,
    error: result.error || null,
  });

  return result;
}

async function notifyUsers({ orgId, userIds, template, data, appUrl }) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const users = db.find("users", (u) => ids.includes(u.id) && u.email && u.status === "active");
  const results = [];
  for (const u of users) {
    const r = await notify({ orgId, to: u.email, template, data: { name: u.name, ...data }, appUrl });
    results.push({ userId: u.id, ...r });
  }
  return results;
}

module.exports = { setGlobalEmail, notify, notifyUsers };
