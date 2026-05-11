const express = require("express");
const auth = require("../middleware/auth");
const predictor = require("../lib/predictor");
const db = require("../lib/db");

module.exports = function predictorRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  // GET /predictor/forecast — para opositor (su propia previsión) o
  // preparador/admin pasando ?opositorId=...
  r.get("/predictor/forecast", (req, res) => {
    let oposId = req.query.opositorId;
    if (req.user.role === "opositor") oposId = req.user.id;
    else if (!["preparador", "admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    if (!oposId) return res.status(400).json({ error: "missing_opositor" });
    // Cogemos fecha de examen del proceso del opositor (si tiene asignación)
    const assignment = db.findOne("assignments", (a) => a.opositorId === oposId && a.active);
    const proc = assignment?.processId
      ? db.findOne("processes", (p) => p.id === assignment.processId)
      : null;
    const examDate = req.query.examDate || proc?.examDate || null;
    const threshold = Number(req.query.threshold) || 5.0;
    res.json({ forecast: predictor.forecast({ opositorId: oposId, threshold, examDate }) });
  });

  // GET /predictor/gap — brecha por tema con ROI
  r.get("/predictor/gap", (req, res) => {
    let oposId = req.query.opositorId;
    if (req.user.role === "opositor") oposId = req.user.id;
    else if (!["preparador", "admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    if (!oposId) return res.status(400).json({ error: "missing_opositor" });
    let syllabusId = req.query.syllabusId;
    if (!syllabusId) {
      const assignment = db.findOne("assignments", (a) => a.opositorId === oposId && a.active);
      const proc = assignment?.processId ? db.findOne("processes", (p) => p.id === assignment.processId) : null;
      syllabusId = proc?.syllabusId;
    }
    if (!syllabusId) return res.json({ gap: null });
    res.json({ gap: predictor.gapByTopic({ opositorId: oposId, syllabusId }) });
  });

  return r;
};
