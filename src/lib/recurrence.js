// ─────────────────────────────────────────────────────────────────────────────
// Expansión de recurrencias. Dado un evento maestro con recurrence en
// {none, weekly, biweekly, monthly}, devuelve todas sus ocurrencias dentro
// del rango [from, to].
//
// Modelo de datos sugerido en `events`:
//   recurrence            "none" | "weekly" | "biweekly" | "monthly"
//   recurrenceUntil       fecha final inclusive (opcional, por defecto +90 días)
//   recurrenceExceptions  ["2026-05-12", ...] fechas a saltar
//   recurrenceParentId    si es una instancia editada/movida
//   isOverride            true → la ocurrencia maestra de ese día se ignora
//
// Las instancias devueltas son objetos planos con un `occurrenceDate` y
// el resto de campos del maestro. No se guardan en BD salvo cuando hay
// edición individual ("este evento solamente").
// ─────────────────────────────────────────────────────────────────────────────

function parseDate(s) {
  if (!s) return null;
  // Acepta "YYYY-MM-DD" o cualquier ISO. Devuelve fecha en hora local 00:00.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s);
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function addMonths(d, n) {
  const out = new Date(d);
  const targetMonth = out.getMonth() + n;
  out.setMonth(targetMonth);
  // Si el día no existe en el mes destino (ej. 31 de enero + 1 mes), JS hace overflow.
  // Compensamos retrocediendo al último día válido.
  if (out.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    out.setDate(0);
  }
  return out;
}

function expandEvent(event, from, to) {
  if (!event.date) return [];
  const start = parseDate(event.date);
  const fromD = parseDate(from);
  const toD = parseDate(to);
  if (!fromD || !toD) return [];

  const baseExceptions = new Set(event.recurrenceExceptions || []);

  const occurrences = [];
  const recur = event.recurrence || "none";

  if (recur === "none") {
    if (start >= fromD && start <= toD) {
      occurrences.push({ ...event, occurrenceDate: fmtDate(start), isOccurrence: false });
    }
    return occurrences;
  }

  // Final del rango de recurrencia
  const ruleUntil = event.recurrenceUntil ? parseDate(event.recurrenceUntil) : addDays(start, 365);
  const stop = ruleUntil < toD ? ruleUntil : toD;

  let cursor = new Date(start);
  let safety = 0;
  while (cursor <= stop && safety < 500) {
    safety++;
    if (cursor >= fromD) {
      const dateStr = fmtDate(cursor);
      if (!baseExceptions.has(dateStr)) {
        occurrences.push({
          ...event,
          occurrenceDate: dateStr,
          isOccurrence: cursor.getTime() !== start.getTime(),
          parentEventId: event.id,
        });
      }
    }
    if (recur === "weekly") cursor = addDays(cursor, 7);
    else if (recur === "biweekly") cursor = addDays(cursor, 14);
    else if (recur === "monthly") cursor = addMonths(cursor, 1);
    else break;
  }
  return occurrences;
}

function expandEvents(events, from, to) {
  const masters = events.filter((e) => !e.recurrenceParentId);
  const overrides = events.filter((e) => e.recurrenceParentId);

  // Mapa por (parentId, occurrenceDate) — la fecha donde el override "sustituye"
  // a la ocurrencia original del maestro (NO la fecha actual del override si se movió)
  const overrideKey = (pId, d) => `${pId}|${d}`;
  const overrideByOriginalDate = {};
  for (const o of overrides) {
    // `originalOccurrenceDate` se guarda al crear el override; si no existe,
    // asumimos que es la propia date (override que no se ha movido de día).
    const orig = o.originalOccurrenceDate || o.date;
    overrideByOriginalDate[overrideKey(o.recurrenceParentId, orig)] = o;
  }
  const usedOverrides = new Set();

  const out = [];
  for (const m of masters) {
    const occurrences = expandEvent(m, from, to);
    for (const occ of occurrences) {
      const key = overrideKey(m.id, occ.occurrenceDate);
      if (overrideByOriginalDate[key]) {
        const override = overrideByOriginalDate[key];
        usedOverrides.add(override.id);
        out.push({ ...override, occurrenceDate: override.date, isOccurrence: true });
      } else {
        out.push(occ);
      }
    }
  }

  // Overrides no usados (ej. el master los excluye via exception y el override
  // está en una fecha distinta) → añadirlos sueltos si caen en el rango
  const fromD = parseDate(from);
  const toD = parseDate(to);
  for (const o of overrides) {
    if (usedOverrides.has(o.id) || !o.date) continue;
    const d = parseDate(o.date);
    if (d >= fromD && d <= toD) {
      out.push({ ...o, occurrenceDate: o.date, isOccurrence: true });
    }
  }

  // Orden cronológico
  out.sort((a, b) => {
    const da = (a.occurrenceDate || a.date) + " " + (a.time || "");
    const db = (b.occurrenceDate || b.date) + " " + (b.time || "");
    return da.localeCompare(db);
  });

  return out;
}

// Genera fechas de un slot recurrente (disponibilidad). dayOfWeek: 0=lunes ... 6=domingo
function expandAvailability(slot, from, to) {
  const fromD = parseDate(from);
  const toD = parseDate(to);
  if (!fromD || !toD) return [];

  // Avanzamos desde fromD hasta encontrar el primer día de la semana que coincida
  const targetDow = Number(slot.dayOfWeek); // 0..6
  // En JS getDay(): 0=domingo, 1=lunes... Convertimos a 0=lunes
  const localDow = (d) => (d.getDay() + 6) % 7;

  let cursor = new Date(fromD);
  while (cursor <= toD && localDow(cursor) !== targetDow) cursor = addDays(cursor, 1);

  const ruleUntil = slot.until ? parseDate(slot.until) : null;
  const out = [];
  while (cursor <= toD) {
    if (ruleUntil && cursor > ruleUntil) break;
    out.push({ ...slot, date: fmtDate(cursor) });
    if (slot.recurrence === "biweekly") cursor = addDays(cursor, 14);
    else cursor = addDays(cursor, 7);
  }
  return out;
}

module.exports = { expandEvent, expandEvents, expandAvailability, fmtDate, parseDate, addDays };
