const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const { NPS_TEMPLATES, npsCategory } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// Encuesta NPS (transcripción ~21:00).
// Configurable a nivel de academia: plantilla + frecuencia + audiencia.
// El opositor recibe la encuesta cuando le toca (envío manual o programado)
// y puede responderla desde su panel.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function npsRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  // ── Opositor: ver y responder encuesta activa ────────────────────────────

  r.get("/nps/active-survey", auth.requireRole("opositor"), (req, res) => {
    const org = db.findOne("organizations", (o) => o.id === req.user.organizationId);
    if (!org?.nps?.enabled) return res.json({ survey: null });
    const tpl = NPS_TEMPLATES[org.nps.template] || NPS_TEMPLATES.nps_classic;

    // ¿Ya respondió en el periodo configurado? Por defecto, no repetir antes
    // de 90 días.
    const cooldownDays = org.nps.cooldownDays || 90;
    const cutoff = new Date(Date.now() - cooldownDays * 86400000).toISOString();
    const last = db.findOne("npsResponses", (n) => n.opositorId === req.user.id && (n.respondedAt || "") > cutoff);
    if (last) return res.json({ survey: null, alreadyAnswered: true });

    res.json({
      survey: {
        templateId: org.nps.template || "nps_classic",
        title: tpl.title,
        questions: tpl.questions,
      },
    });
  });

  r.post("/nps/respond", auth.requireRole("opositor"), (req, res) => {
    const { templateId, score, answers } = req.body || {};
    if (typeof score !== "number" || score < 0 || score > 10) {
      return res.status(400).json({ error: "invalid_score" });
    }
    const resp = db.insert("npsResponses", {
      id: db.id("np"),
      organizationId: req.user.organizationId,
      opositorId: req.user.id,
      templateId: templateId || "nps_classic",
      score,
      category: npsCategory(score),
      answers: answers || {},
      respondedAt: new Date().toISOString(),
    });
    res.json({ response: resp });
  });

  // ── Admin/preparador: ver respuestas y métricas ───────────────────────────

  r.get("/nps/responses", auth.requireRole("admin", "preparador", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const all = db.find("npsResponses", (n) => n.organizationId === orgId);
    const total = all.length;
    const promoters = all.filter((n) => n.category === "promoter").length;
    const passives = all.filter((n) => n.category === "passive").length;
    const detractors = all.filter((n) => n.category === "detractor").length;
    const ratio = total ? Math.round(((promoters - detractors) * 100) / total) : 0;
    res.json({
      responses: all.map((n) => {
        const u = db.findOne("users", (x) => x.id === n.opositorId);
        return { ...n, opositorName: u?.name || "" };
      }),
      stats: { total, promoters, passives, detractors, score: ratio },
    });
  });

  return r;
};
