const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const {
  STRESS_QUESTIONS,
  WELLBEING_RESOURCES,
  stressScore,
  stressLabel,
} = require("../lib/constants");

// Bienestar y gestión del estrés (catálogo §B.7).
//
// Endpoints expuestos al opositor:
//   - GET  /wellbeing/stress-check       → cuestionario + último resultado
//   - POST /wellbeing/stress-check       → guarda respuesta semanal
//   - GET  /wellbeing/stress-history     → últimas N semanas
//   - GET  /wellbeing/resources          → biblioteca
//   - GET  /wellbeing/sustainability     → indicador calculado de carga

module.exports = function wellbeingRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function isOpositor(req) { return req.user.role === "opositor"; }

  // Devuelve el cuestionario y la respuesta más reciente de esta semana
  // (si la hay), para no preguntar más de una vez.
  r.get("/wellbeing/stress-check", (req, res) => {
    if (!isOpositor(req)) return res.status(403).json({ error: "forbidden" });
    const weekOf = mondayOf(new Date());
    const last = db.find("stressChecks", (s) => s.opositorId === req.user.id)
      .sort((a, b) => (b.weekOf || "").localeCompare(a.weekOf || ""))[0];
    res.json({
      questions: STRESS_QUESTIONS,
      thisWeek: weekOf,
      alreadyAnswered: !!last && last.weekOf === weekOf,
      last: last ? { weekOf: last.weekOf, score: last.score, label: stressLabel(last.score) } : null,
    });
  });

  r.post("/wellbeing/stress-check", (req, res) => {
    if (!isOpositor(req)) return res.status(403).json({ error: "forbidden" });
    const answers = req.body?.answers || {};
    const score = stressScore(answers);
    const label = stressLabel(score);
    const weekOf = mondayOf(new Date());
    // Sobrescribimos si ya hay respuesta esta semana (permitimos rectificar).
    const existing = db.findOne("stressChecks",
      (s) => s.opositorId === req.user.id && s.weekOf === weekOf);
    let saved;
    if (existing) {
      saved = db.update("stressChecks", (s) => s.id === existing.id, {
        answers, score, notes: req.body?.notes || "",
      });
    } else {
      saved = db.insert("stressChecks", {
        id: db.id("sc"),
        organizationId: req.user.organizationId,
        opositorId: req.user.id,
        weekOf,
        answers,
        score,
        notes: req.body?.notes || "",
        createdAt: new Date().toISOString(),
      });
    }
    res.json({ check: saved, label });
  });

  r.get("/wellbeing/stress-history", (req, res) => {
    if (!isOpositor(req)) return res.status(403).json({ error: "forbidden" });
    const limit = Math.max(1, Math.min(52, Number(req.query.limit) || 12));
    const all = db.find("stressChecks", (s) => s.opositorId === req.user.id)
      .sort((a, b) => (a.weekOf || "").localeCompare(b.weekOf || ""))
      .slice(-limit)
      .map((s) => ({ weekOf: s.weekOf, score: s.score, label: stressLabel(s.score) }));
    res.json({ history: all });
  });

  r.get("/wellbeing/resources", (req, res) => {
    if (!isOpositor(req)) return res.status(403).json({ error: "forbidden" });
    res.json({ resources: WELLBEING_RESOURCES });
  });

  // Indicador de sostenibilidad: combina horas medias por día (de habits)
  // con el último estrés. Devuelve un nivel 0..100 y consejo.
  r.get("/wellbeing/sustainability", (req, res) => {
    if (!isOpositor(req)) return res.status(403).json({ error: "forbidden" });
    const habits = db.find("habits", (h) => h.opositorId === req.user.id)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 14); // últimas 2 semanas
    const avgHours = habits.length
      ? habits.reduce((s, h) => s + (Number(h.hours) || 0), 0) / habits.length
      : 0;
    const stress = db.find("stressChecks", (s) => s.opositorId === req.user.id)
      .sort((a, b) => (b.weekOf || "").localeCompare(a.weekOf || ""))[0];
    const stressVal = stress?.score || 12; // si no hay datos, asumimos medio
    // Heurística: por encima de 6h/día sostenidas + estrés alto → riesgo
    let risk = 0;
    if (avgHours > 7) risk += 30;
    else if (avgHours > 5) risk += 15;
    if (stressVal > 19) risk += 50;
    else if (stressVal > 14) risk += 25;
    risk = Math.min(100, risk);
    let advice = "Tu ritmo es sostenible.";
    if (risk >= 60) advice = "Riesgo alto de agotamiento: considera reducir 1 hora diaria y añadir un día de descanso a la semana.";
    else if (risk >= 35) advice = "Carga moderada-alta. Vigila la calidad del sueño y el descanso del fin de semana.";
    res.json({
      avgHoursPerDay: +avgHours.toFixed(1),
      stressScore: stressVal,
      riskScore: risk,
      advice,
    });
  });

  return r;
};

function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay() || 7; // 1..7 (lun..dom)
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  return x.toISOString().slice(0, 10);
}
