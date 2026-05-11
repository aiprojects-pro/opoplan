const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const { generateSyntheticAlert } = require("../services/normativeMonitor");

module.exports = function normativeRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }
  function isStaff(req) { return ["admin", "superadmin", "preparador"].includes(req.user.role); }

  // GET /normative/alerts — listar alertas de la academia, ordenadas por
  // criticidad y fecha. Filtro opcional ?status=open|dismissed|resolved.
  r.get("/normative/alerts", (req, res) => {
    if (!isStaff(req)) return res.status(403).json({ error: "forbidden" });
    const status = req.query.status;
    let alerts = db.find("normativeAlerts", (a) => a.organizationId === orgOf(req));
    if (status) alerts = alerts.filter((a) => a.status === status);
    const order = { critical: 0, important: 1, informative: 2 };
    alerts.sort((a, b) => {
      const la = order[a.level] ?? 9;
      const lb = order[b.level] ?? 9;
      if (la !== lb) return la - lb;
      return (b.publishedAt || "").localeCompare(a.publishedAt || "");
    });
    // Expandimos refs a temas y preguntas afectadas
    const expanded = alerts.map((a) => ({
      ...a,
      affectedTopics: (a.affectsTopicIds || []).map((tid) => {
        const top = db.findOne("syllabi", (s) => (s.topics || []).some((t) => t.id === tid));
        const t = top?.topics?.find((x) => x.id === tid);
        return t ? { id: t.id, number: t.number, title: t.title, syllabusId: top.id } : null;
      }).filter(Boolean),
      affectedQuestionsCount: (a.affectsQuestionIds || []).length,
    }));
    res.json({ alerts: expanded });
  });

  // PATCH /normative/alerts/:id — cambiar status (dismissed | resolved).
  // Cuando 'resolved', se asume que la academia ya ha actualizado sus
  // preguntas; podemos opcionalmente desmarcar 'requires_review' en las
  // preguntas afectadas (lo dejamos como TODO si hace falta).
  r.patch("/normative/alerts/:id", (req, res) => {
    if (!isStaff(req)) return res.status(403).json({ error: "forbidden" });
    const a = db.findOne("normativeAlerts", (x) => x.id === req.params.id && x.organizationId === orgOf(req));
    if (!a) return res.status(404).json({ error: "not_found" });
    const next = req.body?.status;
    if (!["open", "dismissed", "resolved"].includes(next)) return res.status(400).json({ error: "invalid_status" });
    const updated = db.update("normativeAlerts", (x) => x.id === a.id, {
      status: next,
      resolvedAt: next === "resolved" ? new Date().toISOString() : a.resolvedAt || null,
    });
    res.json({ alert: updated });
  });

  // POST /normative/synthetic — solo superadmin: genera una alerta sintética
  // para que la academia pueda probar el flujo cuando no hay feed real.
  r.post("/normative/synthetic", auth.requireRole("superadmin", "admin"), (req, res) => {
    const orgId = req.body.organizationId || orgOf(req);
    const alert = db.insert("normativeAlerts", generateSyntheticAlert({ orgId, level: req.body.level }));
    res.json({ alert });
  });

  // POST /normative/run-once — dispara el provider real (BOE u otro).
  // Solo superadmin. En entornos donde NORMATIVE_PROVIDER=boe esto descarga
  // el sumario de los últimos N días y crea alertas para coincidencias.
  r.post("/normative/run-once", auth.requireRole("superadmin"), async (req, res) => {
    const orgId = req.body.organizationId;
    if (!orgId) return res.status(400).json({ error: "missing_organization_id" });
    try {
      const monitor = require("../services/normativeMonitor").fromEnv(process.env);
      const result = await monitor.runOnce({ orgId, db });
      res.json(result);
    } catch (e) {
      console.error("[normative:run-once]", e);
      res.status(500).json({ error: "run_once_failed", message: e.message });
    }
  });

  return r;
};
