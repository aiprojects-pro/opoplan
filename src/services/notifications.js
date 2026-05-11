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
  welcomeWithCredentials: (ctx) => ({
    subject: `Bienvenido/a a ${ctx.orgName} — tu acceso`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">¡Hola, ${escape(ctx.name)}!</h2>
       <p>Tu academia <strong>${escape(ctx.orgName)}</strong> ha creado tu cuenta como <strong>${escape(ctx.role)}</strong>.</p>
       <table style="margin:18px 0;background:#f5f7fb;border-radius:10px;width:100%;">
         <tr><td style="padding:16px 18px;">
           <div style="font-size:12px;color:#6b7896;">Email</div>
           <div style="font-weight:700;font-size:15px;margin-bottom:10px;">${escape(ctx.email)}</div>
           <div style="font-size:12px;color:#6b7896;">${ctx.generated ? "Contraseña temporal" : "Contraseña"}</div>
           <div style="background:white;border:1px solid #d6deea;padding:10px 14px;border-radius:8px;margin-top:4px;display:inline-block;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:1.1rem;letter-spacing:0.04em;font-weight:700;">${escape(ctx.tempPassword)}</div>
         </td></tr>
       </table>
       ${ctx.generated ? `
         <div style="background:#fff8e1;border:1px solid #f0d77a;border-radius:10px;padding:12px 16px;margin:16px 0;font-size:13px;">
           ⚠️ <strong>Por seguridad, cambia esta contraseña la primera vez que entres.</strong> Esta clave se ha generado al darte de alta y solo deberías usarla para tu primer acceso.
         </div>` : ""}
       <p style="margin-top:20px;">${btn("Acceder ahora", ctx.appUrl, ctx.primary)}</p>
       <p style="font-size:12px;color:#6b7896;margin-top:18px;">Si no esperabas este email, ignóralo o contacta con tu academia.</p>`),
    text: `Hola ${ctx.name},\n\nTu cuenta en ${ctx.orgName} está lista.\nEmail: ${ctx.email}\n${ctx.generated ? "Contraseña temporal" : "Contraseña"}: ${ctx.tempPassword}\n\n${ctx.generated ? "⚠️ Cambia esta contraseña la primera vez que entres.\n\n" : ""}Accede en ${ctx.appUrl}`,
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
  bookingCreated: (ctx) => ({
    subject: `Tutoría reservada: ${ctx.bookingDate} ${ctx.bookingTime}`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">Nueva tutoría reservada</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <p>Se ha reservado una tutoría:</p>
       <table style="margin:16px 0;background:#f5f7fb;border-radius:10px;width:100%;">
         <tr><td style="padding:14px 18px;">
           <strong>${escape(ctx.bookingDate)} a las ${escape(ctx.bookingTime)}</strong><br/>
           <span style="color:#6b7896;font-size:13px;">Opositor: ${escape(ctx.opositorName)} · Preparador: ${escape(ctx.preparadorName)}</span>
         </td></tr>
       </table>
       ${ctx.videoJoinUrl ? `
         <div style="background:#eaf4ff;border:1px solid #b9d8f5;border-radius:10px;padding:14px 18px;margin:16px 0;">
           <strong>📹 Videoconferencia (${escape(ctx.videoProvider || "")})</strong>
           ${ctx.videoPasscode ? `<br/><small style="color:#6b7896;">Contraseña: <code>${escape(ctx.videoPasscode)}</code></small>` : ""}
           <div style="margin-top:10px;">${btn("Unirse a la videollamada", ctx.videoJoinUrl, ctx.primary)}</div>
         </div>` : ""}
       ${ctx.notes ? `<p style="background:#fff8e1;padding:10px 14px;border-radius:8px;font-size:13px;"><strong>Notas:</strong> ${escape(ctx.notes)}</p>` : ""}
       <p style="margin-top:20px;">${btn("Ver agenda", ctx.appUrl, ctx.primary)}</p>`),
    text: `Tutoría reservada para ${ctx.bookingDate} ${ctx.bookingTime} (${ctx.opositorName} con ${ctx.preparadorName}).${ctx.videoJoinUrl ? `\nEnlace: ${ctx.videoJoinUrl}` : ""}`,
  }),
  bookingCancelled: (ctx) => ({
    subject: `Tutoría cancelada: ${ctx.bookingDate} ${ctx.bookingTime}`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">Tutoría cancelada</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <p>La tutoría del <strong>${escape(ctx.bookingDate)} a las ${escape(ctx.bookingTime)}</strong> ha sido cancelada por <strong>${escape(ctx.cancelledBy)}</strong>.</p>
       <p style="margin-top:20px;">${btn("Ver agenda", ctx.appUrl, ctx.primary)}</p>`),
    text: `La tutoría del ${ctx.bookingDate} ${ctx.bookingTime} ha sido cancelada por ${ctx.cancelledBy}.`,
  }),
  inactivity: (ctx) => ({
    subject: `Hace ${ctx.days} días que no entras — ¡Vuelve a la rutina!`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">Te echamos de menos</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <p>Llevas <strong>${escape(String(ctx.days))} días</strong> sin entrar a la plataforma. Recuerda que la constancia es la clave en una oposición.</p>
       <p>Tu plan personalizado te está esperando. Cualquier duda, contacta con tu preparador.</p>
       <p style="margin-top:20px;">${btn("Volver a mi plan", ctx.appUrl, ctx.primary)}</p>`),
    text: `Hola ${ctx.name}, llevas ${ctx.days} días sin entrar. Vuelve a tu plan en ${ctx.appUrl}.`,
  }),
  brokenCommitment: (ctx) => ({
    subject: `Atención: ${ctx.opositorName} no cumple su compromiso`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">Compromiso no cumplido</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <p>Tu opositor/a <strong>${escape(ctx.opositorName)}</strong> lleva <strong>${escape(String(ctx.daysInARow))} días seguidos</strong> sin completar las horas comprometidas.</p>
       <p>Te recomendamos contactarle para entender la situación y reorganizar el plan si es necesario.</p>
       <p style="margin-top:20px;">${btn("Ver opositor", ctx.appUrl, ctx.primary)}</p>`),
    text: `${ctx.opositorName} lleva ${ctx.daysInARow} días sin cumplir su compromiso.`,
  }),
  unconsumedTutoring: (ctx) => ({
    subject: `Tienes una tutoría sin consumir este mes`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">No olvides tu tutoría mensual</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <p>Tu plan incluye tutorías mensuales y aún no has reservado la de <strong>${escape(ctx.month)}</strong>.</p>
       <p>Aprovecha este recurso: te ayudará a aclarar dudas y ajustar tu preparación.</p>
       <p style="margin-top:20px;">${btn("Reservar tutoría", ctx.appUrl, ctx.primary)}</p>`),
    text: `Tienes una tutoría sin consumir este mes (${ctx.month}). Reserva en ${ctx.appUrl}.`,
  }),
  npsInvite: (ctx) => ({
    subject: `${ctx.orgName}: tu opinión nos importa`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">¿Cómo valoras tu experiencia?</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <p>Nos gustaría conocer tu opinión sobre <strong>${escape(ctx.orgName)}</strong>. Solo te llevará un par de minutos.</p>
       <p style="margin-top:20px;">${btn("Responder encuesta", ctx.appUrl + "?survey=" + (ctx.surveyId || ""), ctx.primary)}</p>`),
    text: `Responde nuestra encuesta NPS en ${ctx.appUrl}`,
  }),
  rankingResult: (ctx) => ({
    subject: `Resultado del reto: ${ctx.challengeName}`,
    html: shell(ctx.orgId,
      `<h2 style="margin:0 0 12px;color:#08264a;">¡Reto finalizado!</h2>
       <p>Hola ${escape(ctx.name)},</p>
       <p>Has quedado en la posición <strong>#${escape(String(ctx.position))}</strong> de <strong>${escape(ctx.challengeName)}</strong>.</p>
       <p style="margin-top:20px;">${btn("Ver ranking", ctx.appUrl, ctx.primary)}</p>`),
    text: `Posición #${ctx.position} en ${ctx.challengeName}.`,
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
