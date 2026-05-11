// Cálculos del Dashboard Analítico Pedagógico (catálogo §A.3).
//
// Los inputs son los `simulacroAttempts` del modelo: cada uno tiene un array
// `questions` con la respuesta elegida, la respuesta correcta, el tiempo y la
// confianza. A partir de ahí se calculan todas las métricas del dashboard.

const db = require("./db");

// Mapa de calor por tema: tasa de acierto media para cada topic del temario.
// Si no hay intentos, devolvemos null para que el UI muestre "sin datos".
function topicHeatmap({ orgId, syllabusId }) {
  const syllabus = db.findOne("syllabi", (s) => s.id === syllabusId && s.organizationId === orgId);
  if (!syllabus) return null;
  const qbByTopic = new Map(); // topicId → [qbId,...]
  for (const q of db.find("questionBank", (x) => x.organizationId === orgId && x.active !== false)) {
    if (!qbByTopic.has(q.topicId)) qbByTopic.set(q.topicId, []);
    qbByTopic.get(q.topicId).push(q.id);
  }
  // Recorremos todos los simulacroAttempts de la academia y agregamos
  const stats = new Map(); // topicId → { hits, total }
  for (const att of db.find("simulacroAttempts", (a) => a.organizationId === orgId)) {
    for (const ans of (att.questions || [])) {
      const qb = db.findOne("questionBank", (x) => x.id === ans.qbId);
      if (!qb) continue;
      if (!stats.has(qb.topicId)) stats.set(qb.topicId, { hits: 0, total: 0 });
      const s = stats.get(qb.topicId);
      s.total += 1;
      if (ans.chosen === ans.correct) s.hits += 1;
    }
  }
  const topics = (syllabus.topics || []).map((t) => {
    const s = stats.get(t.id);
    const total = s?.total || 0;
    const hits = s?.hits || 0;
    return {
      id: t.id,
      number: t.number || "",
      title: t.title,
      block: t.block || "",
      attempts: total,
      hitRate: total ? Math.round((hits / total) * 100) : null,
      questions: (qbByTopic.get(t.id) || []).length,
    };
  });
  return { syllabusId, syllabusTitle: syllabus.title, topics };
}

// Top N preguntas con mayor tasa de error + distractor dominante.
function mostFailedQuestions({ orgId, limit = 20 }) {
  // Agregamos: por qbId, conteo de cada opción elegida y aciertos
  const stats = new Map();
  for (const att of db.find("simulacroAttempts", (a) => a.organizationId === orgId)) {
    for (const ans of (att.questions || [])) {
      if (!stats.has(ans.qbId)) stats.set(ans.qbId, { total: 0, hits: 0, picks: {} });
      const s = stats.get(ans.qbId);
      s.total += 1;
      if (ans.chosen === ans.correct) s.hits += 1;
      s.picks[ans.chosen] = (s.picks[ans.chosen] || 0) + 1;
    }
  }
  const out = [];
  for (const [qbId, s] of stats) {
    if (s.total < 1) continue;
    const qb = db.findOne("questionBank", (x) => x.id === qbId);
    if (!qb) continue;
    // Distractor dominante = opción incorrecta más elegida
    let dominant = null;
    let dominantPct = 0;
    for (const [opt, count] of Object.entries(s.picks)) {
      const optIdx = Number(opt);
      if (optIdx === qb.correct) continue;
      const pct = Math.round((count / s.total) * 100);
      if (pct > dominantPct) {
        dominantPct = pct;
        dominant = { index: optIdx, label: qb.options[optIdx], pct };
      }
    }
    out.push({
      qbId,
      text: qb.text,
      correctIndex: qb.correct,
      correctLabel: qb.options[qb.correct],
      attempts: s.total,
      errorRate: Math.round((1 - s.hits / s.total) * 100),
      dominantDistractor: dominant,
      norm: qb.norm,
      tags: qb.tags || [],
    });
  }
  out.sort((a, b) => b.errorRate - a.errorRate);
  return out.slice(0, limit);
}

// Rendimiento por opositor: media + tendencia (últimos 5 simulacros).
function opositorPerformance({ orgId, opositorId }) {
  const attempts = db.find("simulacroAttempts",
    (a) => a.organizationId === orgId && a.opositorId === opositorId)
    .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
  if (!attempts.length) return { attempts: 0 };
  const last5 = attempts.slice(-5);
  const scores = last5.map((a) => a.score);
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  // Tendencia simple por regresión lineal sobre last5
  const n = scores.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += scores[i]; sumXY += i * scores[i]; sumXX += i * i;
  }
  const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) : 0;
  const trend = Math.abs(slope) < 0.05 ? "estable" : (slope > 0 ? "mejorando" : "deteriorando");
  // Calibración: ¿la confianza coincide con el resultado?
  let calibrated = 0, calibTotal = 0;
  for (const a of last5) {
    for (const ans of (a.questions || [])) {
      calibTotal += 1;
      const correct = ans.chosen === ans.correct;
      if ((ans.confidence === "sure" && correct) ||
          (ans.confidence === "guess" && !correct) ||
          (ans.confidence === "doubt")) {
        calibrated += 1;
      }
    }
  }
  return {
    attempts: attempts.length,
    last5Mean: +mean.toFixed(2),
    last5Scores: scores,
    trend,
    slope: +slope.toFixed(3),
    calibrationPct: calibTotal ? Math.round((calibrated / calibTotal) * 100) : null,
  };
}

// Comparativa entre grupos = entre preparadores de la misma academia.
function groupComparison({ orgId }) {
  const preparadores = db.find("users", (u) => u.organizationId === orgId && u.role === "preparador" && u.status === "active");
  const out = [];
  for (const prep of preparadores) {
    const opos = db.find("assignments", (a) => a.preparadorId === prep.id && a.active)
      .map((a) => a.opositorId);
    const attempts = db.find("simulacroAttempts",
      (a) => a.organizationId === orgId && opos.includes(a.opositorId));
    if (!attempts.length) {
      out.push({ preparadorId: prep.id, preparadorName: prep.name, opositores: opos.length, attempts: 0 });
      continue;
    }
    const scores = attempts.map((a) => a.score);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    out.push({
      preparadorId: prep.id,
      preparadorName: prep.name,
      opositores: opos.length,
      attempts: attempts.length,
      meanScore: +mean.toFixed(2),
    });
  }
  return out;
}

// Detección temprana de abandono (catálogo §A.4): scoring 0-100 por opositor.
// Combina señales que ya tenemos: actividad reciente, evolución de la nota,
// días sin sesión, días seguidos sin cumplir compromiso.
function abandonRisk({ orgId, opositorId }) {
  const opo = db.findOne("users", (u) => u.id === opositorId && u.organizationId === orgId && u.role === "opositor");
  if (!opo) return null;
  const now = Date.now();
  // 1) Última actividad
  const acts = db.find("activityLog", (a) => a.userId === opositorId).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const lastActAt = acts[0]?.at;
  const daysSinceLast = lastActAt ? Math.floor((now - new Date(lastActAt).getTime()) / 86400000) : 99;
  // 2) Tendencia últimos 3 simulacros
  const att = db.find("simulacroAttempts", (a) => a.opositorId === opositorId)
    .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""))
    .slice(-3);
  let trendDown = 0;
  if (att.length >= 2) {
    for (let i = 1; i < att.length; i++) if (att[i].score < att[i - 1].score) trendDown += 1;
  }
  // 3) Días seguidos sin cumplir
  const habits = db.find("habits", (h) => h.opositorId === opositorId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  let brokenStreak = 0;
  for (const h of habits) { if (h.planCompliance === "none") brokenStreak += 1; else break; }
  // 4) Estrés alto reciente
  const stress = db.find("stressChecks", (s) => s.opositorId === opositorId)
    .sort((a, b) => (b.weekOf || "").localeCompare(a.weekOf || ""))[0];
  const stressFactor = stress?.score || 0;

  // Scoring 0-100. Pesos calibrados a ojo con sentido común — se ajustan
  // cuando haya datos reales suficientes (al menos 200-300 opositores).
  let score = 0;
  score += Math.min(40, daysSinceLast * 4); // 10 días sin entrar = 40 pts
  score += trendDown * 10;                  // cada caída -1 sim consecutiva = 10 pts
  score += Math.min(30, brokenStreak * 5);  // 6 días seguidos sin cumplir = 30 pts
  score += Math.min(20, Math.max(0, stressFactor - 14) * 5); // estrés alto = hasta 20 pts
  score = Math.min(100, score);

  let level = "low";
  let suggestedAction = null;
  if (score >= 70) {
    level = "high";
    suggestedAction = "Llamada del tutor en 24h + oferta personalizada de retención.";
  } else if (score >= 50) {
    level = "medium";
    suggestedAction = "Email del tutor con la ficha del alumno y guion sugerido.";
  } else if (score >= 30) {
    level = "low_medium";
    suggestedAction = "Email automático con resumen de progreso y motivacional.";
  }
  return {
    opositorId,
    name: opo.name,
    email: opo.email,
    score,
    level,
    suggestedAction,
    factors: {
      daysSinceLastActivity: daysSinceLast,
      simulacroTrendDownCount: trendDown,
      brokenStreakDays: brokenStreak,
      stressScore: stressFactor,
    },
  };
}

module.exports = { topicHeatmap, mostFailedQuestions, opositorPerformance, groupComparison, abandonRisk };
