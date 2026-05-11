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

  // ── Cálculo de capacidad real hasta el examen ────────────────────────
  // Si tenemos `examDate`, calculamos cuántas semanas tenemos por delante,
  // cuántas sesiones de cada tema necesitamos según dificultad/prioridad,
  // y avisamos si la dedicación actual es insuficiente.
  let weeksUntilExam = null;
  let sessionsPerTopic = {};
  let totalSessionsNeeded = 0;
  let weeklyCapacity = 0;
  let feasibilityNote = null;

  const examDate = commitment.examDate ? new Date(commitment.examDate + "T00:00:00") : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (examDate && examDate > today) {
    weeksUntilExam = Math.max(1, Math.ceil((examDate - today) / (7 * 86400000)));
    // Sesiones recomendadas por tema según dificultad × prioridad
    const difficultyFactor = { Alta: 3, Media: 2, Baja: 1 };
    const priorityFactor = { "Muy alta": 1.5, Alta: 1.2, Media: 1, Baja: 0.8 };
    for (const t of topics) {
      const base = difficultyFactor[t.difficulty] || 2;
      const mul = priorityFactor[t.priority] || 1;
      // Mínimo 2 sesiones (1 estudio + 1 repaso) por tema
      sessionsPerTopic[t.id] = Math.max(2, Math.round(base * mul));
      totalSessionsNeeded += sessionsPerTopic[t.id];
    }
    // Capacidad: bloques totales que el opositor puede hacer hasta el examen
    weeklyCapacity = eligibleDays.length * blocksPerDay.length;
    const totalCapacity = weeklyCapacity * weeksUntilExam;
    // El 60% se dedica a estudio (los otros: 25% repaso, 15% simulacro)
    const studyCapacity = Math.floor(totalCapacity * 0.6);
    if (studyCapacity < totalSessionsNeeded) {
      const deficit = totalSessionsNeeded - studyCapacity;
      const extraHoursPerWeek = Math.ceil((deficit / weeksUntilExam) * (blocksPerDay[0] || 60) / 60);
      feasibilityNote = `Cubrir ${topics.length} temas en ${weeksUntilExam} semanas con la dedicación actual deja ${deficit} sesiones de estudio sin cubrir. Considera aumentar +${extraHoursPerWeek} h/semana o ampliar plazo.`;
    }
  }

  // ── Construcción del plan semanal ────────────────────────────────────
  // En lugar de iterar en orden cíclico, distribuimos los temas con
  // peso proporcional a sus sesiones necesarias. Esto hace que los temas
  // difíciles/prioritarios aparezcan más veces a lo largo del plan.
  const totalBlocks = eligibleDays.length * blocksPerDay.length;
  const tasks = [];

  // Construimos una "secuencia ponderada" de topicIds para esta semana:
  // cada tema aparece tantas veces como su peso normalizado.
  const weeklyTopicSeq = buildWeightedSequence(topics, sessionsPerTopic, totalBlocks);

  let seqIdx = 0;
  for (const day of eligibleDays) {
    blocksPerDay.forEach((minutes, blockIdx) => {
      const globalIdx = tasks.length;
      const type = distributionForBlock(globalIdx, totalBlocks);
      const topic = weeklyTopicSeq[seqIdx % Math.max(1, weeklyTopicSeq.length)];
      seqIdx++;
      tasks.push({
        id: db.id("task"),
        day,
        type,
        title: topic ? `${topic.number} ${topic.title}` : `${type} general`,
        minutes,
        done: false,
        notes: "",
        topicId: topic?.id || null,
        topicTitle: topic?.title || null, // ← título real del tema, accesible para UI
        topicNumber: topic?.number || null,
        topicDifficulty: topic?.difficulty || null,
        topicPriority: topic?.priority || null,
        // Hueco horario sugerido (mañana / tarde / noche según índice)
        suggestedSlot: blockIdx === 0 ? "mañana" : blockIdx === 1 ? "tarde" : "noche",
      });
    });
  }

  // Recomendación según horas + factibilidad
  const idealHours = 18;
  let recommendation;
  if (weeklyHours < 8) recommendation = "Dedicación baja. Plantea aumentar a 12–15h/semana.";
  else if (weeklyHours < idealHours) recommendation = "Dedicación moderada. Buen ritmo de progreso.";
  else if (weeklyHours <= 30) recommendation = "Dedicación adecuada para el ritmo objetivo.";
  else recommendation = "Dedicación intensiva. Vigila el descanso y evita sobrecarga.";
  // Si tenemos examDate y no llega, ese mensaje es más relevante
  if (feasibilityNote) recommendation = feasibilityNote;

  return {
    scenario,
    weeklyHours,
    recommendation,
    tasks,
    weeksUntilExam,
    totalTopics: topics.length,
    sessionsPerTopic,
    totalSessionsNeeded,
    weeklyCapacity,
    feasibility: feasibilityNote ? "tight" : (weeksUntilExam ? "ok" : "no_exam_date"),
    feasibilityNote,
    generatedAt: new Date().toISOString(),
  };
}

// Construye una secuencia donde cada tema aparece N veces según su peso
// (sessionsPerTopic[id]). Los temas se intercalan en lugar de agruparse,
// así el opositor no estudia el mismo tema 3 días seguidos.
function buildWeightedSequence(topics, sessionsPerTopic, targetLength) {
  if (!topics.length) return [];
  // Si no tenemos pesos (sin examDate), peso uniforme = 1
  const weights = topics.map((t) => sessionsPerTopic[t.id] || 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  // Round-robin con pesos: cada tema mantiene un "crédito" que va consumiendo
  const credits = weights.map((w) => 0);
  const seq = [];
  // Generamos al menos `targetLength` elementos (mínimo igual al nº temas)
  const len = Math.max(targetLength, topics.length);
  for (let i = 0; i < len; i++) {
    // Sumamos peso a cada uno; el de mayor crédito absoluto va primero
    for (let j = 0; j < topics.length; j++) credits[j] += weights[j] / totalWeight;
    let bestIdx = 0;
    for (let j = 1; j < topics.length; j++) {
      if (credits[j] > credits[bestIdx]) bestIdx = j;
    }
    credits[bestIdx] -= 1;
    seq.push(topics[bestIdx]);
  }
  return seq;
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
      // Campos de la planificación con fecha de examen y factibilidad
      weeksUntilExam: generated.weeksUntilExam,
      totalTopics: generated.totalTopics,
      sessionsPerTopic: generated.sessionsPerTopic,
      totalSessionsNeeded: generated.totalSessionsNeeded,
      weeklyCapacity: generated.weeklyCapacity,
      feasibility: generated.feasibility,
      feasibilityNote: generated.feasibilityNote,
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
