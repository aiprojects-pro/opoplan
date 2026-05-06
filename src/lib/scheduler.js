const db = require("./db");
const { expandEvents } = require("./recurrence");
const notifications = require("../services/notifications");

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler simple en proceso. Cada N minutos recorre los eventos próximos y
// envía recordatorios a los destinatarios. Marca cada ocurrencia como
// "recordada" en la colección "remindersSent" para evitar duplicados.
//
// Política por defecto: recordatorio 24h antes y a 1h antes.
// En producción se podría sustituir por cron, BullMQ o EventBridge.
// ─────────────────────────────────────────────────────────────────────────────

const REMIND_OFFSETS_HOURS = [24, 1];
const SCAN_INTERVAL_MS = 60 * 1000; // 1 minuto

let appUrl = "";
let timer = null;

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
