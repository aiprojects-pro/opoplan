const db = require("./db");

// ─────────────────────────────────────────────────────────────────────────────
// Recálculo automático del plan semanal de un opositor a partir de su
// compromiso (commitment) y el temario de su preparador.
//
// Reglas:
//  - Sin weeklyHours → plan vacío.
//  - Distribuye las horas semanales entre los días activos (excluye restDays).
//  - Si la semana cae dentro de un rango de vacaciones, se omiten esos días.
//  - Asigna 60% estudio · 25% repaso · 15% simulacro.
//  - Prioriza temas con priority "Muy alta"/"Alta" y mastery más bajo.
//  - Bloques de 30/60/90/120 minutos según horas diarias.
//
// Versiones futuras: aprendizaje espaciado, repaso por curva del olvido,
// adaptación según resultados de pruebas, recálculo a la fecha del examen.
// ─────────────────────────────────────────────────────────────────────────────

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function pickBlockMinutes(dailyHours) {
  const total = Math.round((dailyHours || 0) * 60);
  if (total >= 180) return [90, 60, 30]; // tres bloques en sesiones largas
  if (total >= 120) return [60, 60];
  if (total >= 90) return [60, 30];
  if (total >= 60) return [60];
  if (total >= 30) return [30];
  return [];
}

function distributionForBlock(index, total) {
  // 60 / 25 / 15 — alternamos por orden para que cada semana haya variedad
  const ratio = (index + 1) / total;
  if (ratio <= 0.6) return "Estudio";
  if (ratio <= 0.85) return "Repaso";
  return "Simulacro";
}

function pickTopicsForOpositor(opositorId, organizationId) {
  // Encontramos al preparador asignado y su temario
  const a = db.findOne("assignments", (x) => x.opositorId === opositorId && x.active);
  if (!a) return [];
  const syllabi = db.find(
    "syllabi",
    (s) => s.preparadorId === a.preparadorId && s.organizationId === organizationId,
  );
  const topics = syllabi.flatMap((s) => s.topics || []);
  const progressByTopic = Object.fromEntries(
    db.find("progress", (p) => p.opositorId === opositorId).map((p) => [p.topicId, p]),
  );

  // Recálculo adaptativo: si una prueba reciente tiene nota baja en un tema,
  // ese tema baja su "mastery efectivo" y sube en prioridad.
  const recentAssessments = db
    .find("assessments", (x) => x.opositorId === opositorId)
    .filter((x) => x.score != null && x.topic)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 5);

  const adaptiveBoost = {}; // topicTitleNormalized -> reducción de mastery
  for (const a of recentAssessments) {
    const norm = String(a.topic || "").toLowerCase().trim();
    if (!norm) continue;
    const ratio = (a.score || 0) / (a.maxScore || 10);
    if (ratio < 0.5) adaptiveBoost[norm] = (adaptiveBoost[norm] || 0) + 25;
    else if (ratio < 0.7) adaptiveBoost[norm] = (adaptiveBoost[norm] || 0) + 10;
  }

  const effectiveMastery = (topic) => {
    const base = progressByTopic[topic.id]?.mastery ?? 50;
    const norm = String(topic.title || "").toLowerCase().trim();
    let penalty = 0;
    for (const [k, v] of Object.entries(adaptiveBoost)) {
      if (norm.includes(k) || k.includes(norm)) penalty += v;
    }
    return Math.max(0, base - penalty);
  };

  // Orden: prioridad descendente, mastery efectivo ascendente
  const priorityRank = { "Muy alta": 4, Alta: 3, Media: 2, Baja: 1 };
  return topics.slice().sort((a, b) => {
    const pa = priorityRank[a.priority] || 0;
    const pb = priorityRank[b.priority] || 0;
    if (pb !== pa) return pb - pa;
    return effectiveMastery(a) - effectiveMastery(b);
  });
}

function isDayInVacation(dayName, vacationRanges) {
  if (!Array.isArray(vacationRanges) || vacationRanges.length === 0) return false;
  // Implementación simple: si todo el rango cubre el día de la próxima ocurrencia.
  // Como aquí trabajamos con días de la semana sueltos (no con fechas concretas),
  // únicamente devolvemos true si el rango "cubre" la semana actual.
  const today = new Date();
  return vacationRanges.some((r) => {
    if (!r.from || !r.to) return false;
    const from = new Date(r.from);
    const to = new Date(r.to);
    return today >= from && today <= to;
  });
}

function buildPlan(opositor, scenario = "realista") {
  const commitment = opositor.commitment || {};
  const weeklyHours = Number(commitment.weeklyHours) || 0;
  const dailyHours = Number(commitment.dailyHours) || 0;
  const activeDays = (commitment.activeDays || []).filter((d) => DIAS_SEMANA.includes(d));
  const restDays = commitment.restDays || [];
  const vacations = commitment.vacationRanges || [];

  if (weeklyHours <= 0 || activeDays.length === 0) {
    return {
      scenario,
      weeklyHours,
      recommendation:
        weeklyHours <= 0
          ? "Define tus horas de estudio semanales para generar el plan."
          : "Selecciona al menos un día activo de estudio.",
      tasks: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // Filtramos días activos: no en restDays, no en vacaciones globales
  const eligibleDays = activeDays.filter(
    (d) => !restDays.includes(d) && !isDayInVacation(d, vacations),
  );
  if (eligibleDays.length === 0) {
    return {
      scenario,
      weeklyHours,
      recommendation: "Estás en periodo de vacaciones. Disfruta y descansa.",
      tasks: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // Distribución de bloques por día
  // Si dailyHours no está definido, lo derivamos
  const dailyHoursReal = dailyHours > 0 ? dailyHours : weeklyHours / eligibleDays.length;
  const blocksPerDay = pickBlockMinutes(dailyHoursReal);
  if (blocksPerDay.length === 0) {
    return {
      scenario,
      weeklyHours,
      recommendation: "Aumenta tus horas diarias para generar bloques de estudio.",
      tasks: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const topics = pickTopicsForOpositor(opositor.id, opositor.organizationId);
  const totalBlocks = eligibleDays.length * blocksPerDay.length;
  const tasks = [];
  let topicIdx = 0;

  for (const day of eligibleDays) {
    blocksPerDay.forEach((minutes, blockIdx) => {
      const globalIdx = tasks.length;
      const type = distributionForBlock(globalIdx, totalBlocks);
      const topic = topics[topicIdx % Math.max(1, topics.length)];
      topicIdx++;
      tasks.push({
        id: db.id("task"),
        day,
        type,
        title: topic ? `${topic.number} ${topic.title}` : `${type} general`,
        minutes,
        done: false,
        notes: "",
        topicId: topic?.id || null,
        // Hueco horario sugerido (mañana / tarde / noche según índice)
        suggestedSlot: blockIdx === 0 ? "mañana" : blockIdx === 1 ? "tarde" : "noche",
      });
    });
  }

  // Recomendación según horas
  const idealHours = 18; // umbral simple
  let recommendation;
  if (weeklyHours < 8) recommendation = "Dedicación baja. Plantea aumentar a 12–15h/semana.";
  else if (weeklyHours < idealHours) recommendation = "Dedicación moderada. Buen ritmo de progreso.";
  else if (weeklyHours <= 30) recommendation = "Dedicación adecuada para el ritmo objetivo.";
  else recommendation = "Dedicación intensiva. Vigila el descanso y evita sobrecarga.";

  return {
    scenario,
    weeklyHours,
    recommendation,
    tasks,
    generatedAt: new Date().toISOString(),
  };
}

// ── API pública ──────────────────────────────────────────────────────────────

function regeneratePlanFor(opositorId, { scenario = "realista", preserveDone = true } = {}) {
  const opositor = db.findOne("users", (u) => u.id === opositorId && u.role === "opositor");
  if (!opositor) return null;
  const generated = buildPlan(opositor, scenario);

  // Recupera el plan existente y conserva tareas completadas si se pide
  const existing = db.findOne("plans", (p) => p.opositorId === opositorId);
  if (preserveDone && existing) {
    const doneByKey = {};
    for (const t of existing.tasks || []) {
      if (t.done) doneByKey[`${t.day}|${t.title}`] = t;
    }
    generated.tasks = generated.tasks.map((t) => {
      const previous = doneByKey[`${t.day}|${t.title}`];
      return previous ? { ...t, done: true, notes: previous.notes || "" } : t;
    });
  }

  if (existing) {
    db.update("plans", (p) => p.id === existing.id, {
      scenario: generated.scenario,
      weeklyHours: generated.weeklyHours,
      recommendation: generated.recommendation,
      tasks: generated.tasks,
      generatedAt: generated.generatedAt,
    });
    return { ...existing, ...generated };
  }
  return db.insert("plans", {
    id: db.id("pl"),
    organizationId: opositor.organizationId,
    opositorId,
    ...generated,
  });
}

module.exports = { regeneratePlanFor, buildPlan };
