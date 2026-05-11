const express = require("express");
const auth = require("../middleware/auth");
const analytics = require("../lib/analytics");
const db = require("../lib/db");

// Endpoints del Dashboard Analítico (catálogo §A.3, §A.4).
// Acceso: admin de la academia y preparadores. Cada preparador solo ve datos
// de sus opositores asignados; el admin los ve todos.

module.exports = function analyticsRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }
  function isPrepOrAbove(req) { return ["preparador", "admin", "superadmin"].includes(req.user.role); }

  r.get("/analytics/heatmap", (req, res) => {
    if (!isPrepOrAbove(req)) return res.status(403).json({ error: "forbidden" });
    const syllabusId = req.query.syllabusId;
    if (!syllabusId) {
      // Si no se especifica, cogemos el primer temario visible
      const all = db.find("syllabi", (s) => s.organizationId === orgOf(req));
      if (!all.length) return res.json({ heatmap: null });
      const data = analytics.topicHeatmap({ orgId: orgOf(req), syllabusId: all[0].id });
      return res.json({ heatmap: data });
    }
    res.json({ heatmap: analytics.topicHeatmap({ orgId: orgOf(req), syllabusId }) });
  });

  r.get("/analytics/most-failed", (req, res) => {
    if (!isPrepOrAbove(req)) return res.status(403).json({ error: "forbidden" });
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    res.json({ questions: analytics.mostFailedQuestions({ orgId: orgOf(req), limit }) });
  });

  r.get("/analytics/group-comparison", (req, res) => {
    if (!["admin", "superadmin"].includes(req.user.role)) return res.status(403).json({ error: "forbidden" });
    res.json({ groups: analytics.groupComparison({ orgId: orgOf(req) }) });
  });

  // Rendimiento de un opositor concreto (preparador o admin)
  r.get("/analytics/opositor/:id/performance", (req, res) => {
    if (!isPrepOrAbove(req)) return res.status(403).json({ error: "forbidden" });
    const opo = db.findOne("users", (u) => u.id === req.params.id && u.organizationId === orgOf(req) && u.role === "opositor");
    if (!opo) return res.status(404).json({ error: "not_found" });
    res.json({
      opositorId: opo.id,
      opositorName: opo.name,
      ...analytics.opositorPerformance({ orgId: orgOf(req), opositorId: opo.id }),
    });
  });

  // Riesgo de abandono — todos los opositores de la academia (admin)
  // o solo los del preparador (preparador)
  r.get("/analytics/abandon-risk", (req, res) => {
    if (!isPrepOrAbove(req)) return res.status(403).json({ error: "forbidden" });
    let opositorIds;
    if (req.user.role === "preparador") {
      const assignments = db.find("assignments", (a) => a.preparadorId === req.user.id && a.active);
      opositorIds = assignments.map((a) => a.opositorId);
    } else {
      opositorIds = db.find("users", (u) => u.organizationId === orgOf(req) && u.role === "opositor" && u.status === "active").map((u) => u.id);
    }
    const risks = opositorIds.map((id) => analytics.abandonRisk({ orgId: orgOf(req), opositorId: id })).filter(Boolean);
    risks.sort((a, b) => b.score - a.score);
    res.json({ risks });
  });

  return r;
};
