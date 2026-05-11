const db = require("./db");
const { expandEvents } = require("./recurrence");
const notifications = require("../services/notifications");
const { INACTIVITY_PRESETS } = require("./constants");

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler simple en proceso. Cada N minutos recorre los eventos próximos y
// envía recordatorios a los destinatarios. Marca cada ocurrencia como
// "recordada" en la colección "remindersSent" para evitar duplicados.
//
// Política por defecto: recordatorio 24h antes y a 1h antes.
//
// Además ejecuta tareas diarias (a las 09:00 hora servidor):
//   - Inactividad: avisa al opositor que lleva N días sin entrar.
//   - Compromiso roto: avisa al preparador si el opositor lleva N días
//     seguidos sin cumplir.
//   - Tutoría sin consumir: avisa fin de mes a opositores con plan que
//     incluye tutoría mensual y no la han reservado.
// ─────────────────────────────────────────────────────────────────────────────

const REMIND_OFFSETS_HOURS = [24, 1];
const SCAN_INTERVAL_MS = 60 * 1000; // 1 minuto
const DAILY_TASK_HOUR = 9; // se dispara a las 9:00 servidor

let appUrl = "";
let timer = null;
let lastDailyKey = "";

function reminderKey(eventId, occurrenceDate, offsetHours) {
  return `${eventId}|${occurrenceDate || ""}|${offsetHours}`;
}

function alreadySent(key) {
  const sent = db.collection("remindersSent");
  return sent.includes(key);
}

function markSent(key) {
  const sent = db.collection("remindersSent");
  sent.push(key);
  db.persist();
}

function eventDateTime(occurrence) {
  // Combina occurrenceDate + time
  const date = occurrence.occurrenceDate || occurrence.date;
  const time = occurrence.time || "00:00";
  if (!date) return null;
  // Hora local
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = String(time).split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

async function scanAndSend() {
  try {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setHours(horizon.getHours() + Math.max(...REMIND_OFFSETS_HOURS) + 1);

    const allEvents = db.find("events", () => true);
    const occurrences = expandEvents(
      allEvents,
      now.toISOString().slice(0, 10),
      horizon.toISOString().slice(0, 10),
    );

    for (const occ of occurrences) {
      const dt = eventDateTime(occ);
      if (!dt) continue;
      const minutesUntil = (dt - now) / 60000;
      if (minutesUntil < 0) continue;
      const hoursUntil = minutesUntil / 60;

      for (const offset of REMIND_OFFSETS_HOURS) {
        // Disparamos cuando entramos en el último minuto del offset.
        // Tolerancia: dentro de los 60 minutos posteriores al instante objetivo.
        const target = offset;
        if (hoursUntil <= target && hoursUntil >= target - SCAN_INTERVAL_MS / 60000 / 60) {
          const key = reminderKey(occ.id || occ.parentEventId, occ.occurrenceDate, offset);
          if (alreadySent(key)) continue;

          const recipientIds = (occ.recipients || []).filter((id) => id && id !== "all");
          if (!recipientIds.length) {
            markSent(key);
            continue;
          }
          await notifications
            .notifyUsers({
              orgId: occ.organizationId,
              userIds: recipientIds,
              template: "eventReminder",
              data: {
                eventTitle: occ.title,
                eventDate: occ.occurrenceDate || occ.date,
                eventTime: occ.time,
                eventType: occ.type,
              },
              appUrl,
            })
            .catch((e) => console.error("[reminder]", e));

          markSent(key);
        }
      }
    }
  } catch (e) {
    console.error("[scheduler:scan]", e);
  }

  // Tareas diarias: solo se disparan una vez al día, a las DAILY_TASK_HOUR
  try {
    const now2 = new Date();
    const todayKey = now2.toISOString().slice(0, 10);
    if (now2.getHours() >= DAILY_TASK_HOUR && lastDailyKey !== todayKey) {
      lastDailyKey = todayKey;
      await runDailyTasks();
    }
  } catch (e) {
    console.error("[scheduler:daily]", e);
  }
}

// ── Tareas diarias ──────────────────────────────────────────────────────────

async function runDailyTasks() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const opositores = db.find("users", (u) => u.role === "opositor" && u.status === "active");

  for (const opo of opositores) {
    // 1) Inactividad
    await checkInactivity(opo, today);
    // 2) Compromiso roto
    await checkBrokenCommitment(opo, today);
    // 3) Tutoría no consumida (solo último día del mes)
    if (isLastDayOfMonth(today)) {
      await checkUnconsumedTutoring(opo, today);
    }
  }
}

async function checkInactivity(opo, today) {
  // Determinar umbral: del preparador o de la org
  const assignment = db.findOne("assignments", (a) => a.opositorId === opo.id && a.active);
  const preparador = assignment ? db.findOne("users", (u) => u.id === assignment.preparadorId) : null;
  const org = db.findOne("organizations", (o) => o.id === opo.organizationId);
  const presetKey = preparador?.inactivitySettings?.preset
    || org?.defaults?.inactivityReminder?.preset
    || "normal";
  const preset = INACTIVITY_PRESETS[presetKey] || INACTIVITY_PRESETS.normal;
  if (!preset || !preset.days) return;

  // Obtener última actividad
  const log = db.find("activityLog", (l) => l.userId === opo.id)
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0];
  const last = log?.at ? new Date(log.at) : (opo.createdAt ? new Date(opo.createdAt) : null);
  if (!last) return;
  const daysSince = Math.floor((today - last) / 86400000);
  if (daysSince < preset.days) return;

  // No reenviar si ya avisamos hoy
  const key = `inactivity|${opo.id}|${today.toISOString().slice(0, 10)}`;
  if (alreadySent(key)) return;
  markSent(key);

  await notifications.notifyUsers({
    orgId: opo.organizationId,
    userIds: [opo.id],
    template: "inactivity",
    data: { days: daysSince },
    appUrl,
  }).catch((e) => console.error("[notify:inactivity]", e));
}

async function checkBrokenCommitment(opo, today) {
  const org = db.findOne("organizations", (o) => o.id === opo.organizationId);
  const cfg = org?.defaults?.brokenCommitmentEmail;
  if (!cfg?.enabled) return;
  const threshold = cfg.daysInARow || 3;
  const habits = db.find("habits", (h) => h.opositorId === opo.id)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let streak = 0;
  for (let i = habits.length - 1; i >= 0; i--) {
    const h = habits[i];
    if (h.planCompliance === "none") streak++;
    else break;
  }
  if (streak < threshold) return;

  const assignment = db.findOne("assignments", (a) => a.opositorId === opo.id && a.active);
  if (!assignment?.preparadorId) return;

  const key = `broken|${opo.id}|${today.toISOString().slice(0, 10)}`;
  if (alreadySent(key)) return;
  markSent(key);

  await notifications.notifyUsers({
    orgId: opo.organizationId,
    userIds: [assignment.preparadorId],
    template: "brokenCommitment",
    data: { opositorName: opo.name, daysInARow: streak },
    appUrl,
  }).catch((e) => console.error("[notify:broken]", e));
}

async function checkUnconsumedTutoring(opo, today) {
  const plan = db.findOne("subscriptionPlans", (p) => p.id === opo.subscriptionPlanId);
  if (!plan?.includes?.tutoring) return; // solo planes con tutoría
  const ym = today.toISOString().slice(0, 7);
  const bookings = db.find("bookings", (b) =>
    b.opositorId === opo.id
    && (b.status === "confirmed" || b.status === "pending")
    && (b.date || "").startsWith(ym));
  if (bookings.length) return;

  const key = `unconsumed|${opo.id}|${ym}`;
  if (alreadySent(key)) return;
  markSent(key);

  const monthName = today.toLocaleString("es-ES", { month: "long", year: "numeric" });
  await notifications.notifyUsers({
    orgId: opo.organizationId,
    userIds: [opo.id],
    template: "unconsumedTutoring",
    data: { month: monthName },
    appUrl,
  }).catch((e) => console.error("[notify:unconsumed]", e));
}

function isLastDayOfMonth(d) {
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return t.getDate() === d.getDate();
}

function start({ appUrl: url } = {}) {
  appUrl = url || "";
  if (timer) clearInterval(timer);
  timer = setInterval(scanAndSend, SCAN_INTERVAL_MS);
  // Pasada inmediata para no esperar 1 minuto en arranque
  setTimeout(scanAndSend, 2000);
  console.log(`[scheduler] activo (${REMIND_OFFSETS_HOURS.join("h, ")}h antes)`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Ejecución manual (para tests)
async function runOnce() {
  await scanAndSend();
}

module.exports = { start, stop, runOnce };
