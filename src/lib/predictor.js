// Predictor de fecha óptima de presentación (catálogo §B.3).
//
// Algoritmo intencionadamente simple, comprensible y honesto: regresión lineal
// sobre los últimos N simulacros para estimar pendiente, y proyección hasta la
// nota de corte histórica del proceso. NO es un modelo bayesiano sofisticado;
// es una herramienta orientativa que conviene presentar con sus límites.

const db = require("./db");

const APROBADO = 5.0;            // umbral mínimo absoluto
const RECENT_N = 8;               // últimos N simulacros
const MAX_FORECAST_DAYS = 730;    // proyección máxima 2 años
const NOISE_STD_FALLBACK = 0.7;   // si no hay variabilidad calculable

function meanAndStd(values) {
  if (!values.length) return { mean: 0, std: 0 };
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length < 2) return { mean: m, std: 0 };
  const v = values.reduce((s, x) => s + (x - m) * (x - m), 0) / (values.length - 1);
  return { mean: m, std: Math.sqrt(v) };
}

function linearRegression(points) {
  // points: [{x, y}] donde x es días desde el primer simulacro
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const { x, y } of points) { sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// Curva normal acumulada — implementada con aproximación de Abramowitz & Stegun
// para no depender de paquetes externos. Devuelve P(Z <= z).
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-0.5 * z * z);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

function probabilityOfPassing({ projectedScore, std, threshold }) {
  if (std === 0) return projectedScore >= threshold ? 1 : 0;
  // P(simulacro > umbral) ~ 1 - Φ((umbral - μ)/σ)
  const z = (threshold - projectedScore) / std;
  return Math.max(0, Math.min(1, 1 - normalCdf(z)));
}

function forecast({ opositorId, threshold, examDate }) {
  const attempts = db.find("simulacroAttempts", (a) => a.opositorId === opositorId)
    .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
  if (attempts.length === 0) {
    return {
      ready: false,
      reason: "no_data",
      message: "Necesitas al menos 1 simulacro completado para generar la previsión.",
    };
  }
  const recent = attempts.slice(-RECENT_N);
  const t0 = new Date(recent[0].startedAt).getTime();
  const points = recent.map((a) => ({
    x: (new Date(a.startedAt).getTime() - t0) / 86400000, // días
    y: a.score,
  }));
  const { slope, intercept } = linearRegression(points);
  const { mean: recentMean, std: recentStd } = meanAndStd(points.map((p) => p.y));
  // Con muestras pequeñas la incertidumbre es alta. Usamos un std mínimo
  // mayor para no dar probabilidades engañosas con N<3.
  const lowConfidence = recent.length < 3;
  const std = lowConfidence ? Math.max(recentStd, 1.5) : (recentStd || NOISE_STD_FALLBACK);
  const T = Number(threshold) || APROBADO;
  const todayX = points[points.length - 1].x;
  const todayProjected = intercept + slope * todayX;
  const rawProb = probabilityOfPassing({ projectedScore: todayProjected, std, threshold: T });
  // Cap de probabilidad para muestras pequeñas: no decir 99% con 1 simulacro
  const todayProb = lowConfidence ? Math.min(rawProb, 0.85) : rawProb;

  // Si la pendiente es <=0, no hay convergencia futura: la probabilidad no
  // mejora con el tiempo. En ese caso, devolvemos solo la probabilidad actual.
  let projectedDate = null;
  let probAtExam = null;
  let daysToReach = null;
  if (slope > 0.005 && todayProjected < T) {
    // Días necesarios para que la proyección alcance el umbral
    daysToReach = Math.ceil((T - todayProjected) / slope);
    if (daysToReach <= MAX_FORECAST_DAYS) {
      projectedDate = new Date(Date.now() + daysToReach * 86400000).toISOString().slice(0, 10);
    }
  }
  if (examDate) {
    const daysToExam = Math.max(0, Math.floor((new Date(examDate).getTime() - Date.now()) / 86400000));
    const projectedAtExam = todayProjected + slope * daysToExam;
    const rawProbExam = probabilityOfPassing({ projectedScore: projectedAtExam, std, threshold: T });
    probAtExam = lowConfidence ? Math.min(rawProbExam, 0.85) : rawProbExam;
  }

  return {
    ready: true,
    lowConfidence,
    confidenceMessage: lowConfidence
      ? `Con solo ${recent.length} simulacro${recent.length === 1 ? "" : "s"} la previsión es muy orientativa. Realiza al menos 3 para que la curva sea fiable.`
      : null,
    attempts: attempts.length,
    recentN: recent.length,
    recentMean: +recentMean.toFixed(2),
    recentStd: +std.toFixed(2),
    slopePerDay: +slope.toFixed(4),
    trend: Math.abs(slope) < 0.005 ? "estable" : (slope > 0 ? "mejorando" : "deteriorando"),
    threshold: T,
    todayProjectedScore: +todayProjected.toFixed(2),
    todayPassProbability: +(todayProb * 100).toFixed(1),
    projectedReadyDate: projectedDate,
    daysToReachThreshold: daysToReach,
    examDate: examDate || null,
    probAtExam: probAtExam !== null ? +(probAtExam * 100).toFixed(1) : null,
  };
}

// Brecha de aprobado por tema (catálogo §B.3, módulo detallado).
// Para cada tema: (1) tasa de acierto del opositor, (2) nº de preguntas
// estimadas en examen, (3) ROI = peso del tema × margen de mejora.
function gapByTopic({ opositorId, syllabusId }) {
  const syllabus = db.findOne("syllabi", (s) => s.id === syllabusId);
  if (!syllabus) return null;
  const attempts = db.find("simulacroAttempts", (a) => a.opositorId === opositorId);
  const stats = new Map(); // topicId → { hits, total }
  for (const att of attempts) {
    for (const ans of (att.questions || [])) {
      const qb = db.findOne("questionBank", (x) => x.id === ans.qbId);
      if (!qb) continue;
      if (!stats.has(qb.topicId)) stats.set(qb.topicId, { hits: 0, total: 0 });
      const s = stats.get(qb.topicId);
      s.total += 1;
      if (ans.chosen === ans.correct) s.hits += 1;
    }
  }
  const out = [];
  for (const t of (syllabus.topics || [])) {
    const s = stats.get(t.id);
    const total = s?.total || 0;
    const hitRate = total ? s.hits / s.total : null;
    // Asumimos peso 1 por tema (uniforme) — en producción se carga del proceso
    // o de datos históricos del examen.
    const weight = 1;
    const gap = hitRate === null ? null : (1 - hitRate);
    const roi = gap === null ? 0 : gap * weight;
    out.push({
      topicId: t.id,
      number: t.number || "",
      title: t.title,
      attempts: total,
      hitRatePct: hitRate === null ? null : Math.round(hitRate * 100),
      roi: +roi.toFixed(2),
    });
  }
  out.sort((a, b) => (b.roi || 0) - (a.roi || 0));
  return out;
}

module.exports = { forecast, gapByTopic };
