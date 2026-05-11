const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const crypto = require("crypto");

// Servicio de Auditoría de Apuntes (catálogo §A.9).
//
// Es esencialmente un workflow: la academia solicita auditoría, sube los
// materiales, el equipo de la plataforma (superadmin) los revisa y entrega
// un informe de discrepancias normativas.
//
// Lo que hace este módulo:
//   - La academia abre una solicitud, sube los apuntes, marca el temario
//     contra el que comparar.
//   - El superadmin actualiza el estado, sube el informe y, opcionalmente,
//     marca preguntas afectadas.
//   - Trazabilidad completa: histórico de comentarios y cambios de estado.
//
// Lo que NO hace (es trabajo humano):
//   - El análisis automático de discrepancias normativas. Eso lo hace una
//     persona, posiblemente apoyada por una herramienta de IA con RAG sobre
//     el corpus normativo. El módulo solo gestiona el ciclo.

const STATUSES = [
  { id: "requested",      label: "Solicitada" },
  { id: "in_review",      label: "En revisión" },
  { id: "report_ready",   label: "Informe listo" },
  { id: "delivered",      label: "Entregada" },
  { id: "cancelled",      label: "Cancelada" },
];

module.exports = function auditRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }
  function isAdmin(req) { return ["admin", "superadmin"].includes(req.user.role); }
  function isSuperadmin(req) { return req.user.role === "superadmin"; }

  r.get("/audits/statuses", (_req, res) => res.json({ statuses: STATUSES }));

  // GET /audits/mine — auditorías pedidas por mi academia
  r.get("/audits/mine", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const list = db.find("auditRequests", (a) => a.organizationId === orgOf(req));
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ audits: list });
  });

  // POST /audits — admin solicita auditoría
  r.post("/audits", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: "missing_title" });
    const audit = db.insert("auditRequests", {
      id: "aud_" + crypto.randomBytes(4).toString("hex"),
      organizationId: orgOf(req),
      title: b.title,
      description: b.description || "",
      // Material a auditar: array de fileIds
      fileIds: Array.isArray(b.fileIds) ? b.fileIds : [],
      // Temario de referencia
      syllabusId: b.syllabusId || null,
      // Tipo de auditoría: completa | normativa | de cobertura
      type: b.type || "complete",
      // Plazo solicitado (informativo)
      deadline: b.deadline || null,
      status: "requested",
      // Histórico de cambios y comentarios
      events: [{
        type: "created",
        at: new Date().toISOString(),
        by: req.user.id,
        message: "Auditoría solicitada",
      }],
      // El informe entregado por el equipo de la plataforma
      report: {
        deliveredAt: null,
        summary: "",
        discrepancies: [], // [{topicId, norm, severity, before, after, suggestion}]
        affectedQuestionIds: [],
      },
      createdAt: new Date().toISOString(),
    });
    res.json({ audit });
  });

  // POST /audits/:id/comment — añadir comentario
  r.post("/audits/:id/comment", (req, res) => {
    const a = db.findOne("auditRequests", (x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    if (!isSuperadmin(req) && a.organizationId !== orgOf(req)) return res.status(403).json({ error: "forbidden" });
    const message = (req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "empty" });
    const events = [...(a.events || []), {
      type: "comment",
      at: new Date().toISOString(),
      by: req.user.id,
      byRole: req.user.role,
      message,
    }];
    const updated = db.update("auditRequests", (x) => x.id === a.id, { events });
    res.json({ audit: updated });
  });

  // PATCH /audits/:id — superadmin cambia estado / añade informe
  // El admin de la academia puede cancelar pero no avanzar el estado.
  r.patch("/audits/:id", (req, res) => {
    const a = db.findOne("auditRequests", (x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    if (!isSuperadmin(req) && a.organizationId !== orgOf(req)) return res.status(403).json({ error: "forbidden" });
    if (!isSuperadmin(req)) {
      // Admin solo puede cancelar
      if (req.body?.status && req.body.status !== "cancelled") {
        return res.status(403).json({ error: "only_cancel_allowed" });
      }
    }
    const patch = {};
    if (req.body?.status && STATUSES.some((s) => s.id === req.body.status)) {
      patch.status = req.body.status;
      patch.events = [...(a.events || []), {
        type: "status_change", from: a.status, to: req.body.status,
        at: new Date().toISOString(), by: req.user.id,
      }];
    }
    // Solo superadmin puede modificar el informe
    if (isSuperadmin(req) && req.body?.report) {
      patch.report = { ...(a.report || {}), ...req.body.report };
      if (req.body.report.summary && !a.report?.deliveredAt) {
        patch.report.deliveredAt = new Date().toISOString();
      }
    }
    res.json({ audit: db.update("auditRequests", (x) => x.id === a.id, patch) });
  });

  // GET /audits/all — superadmin ve todas las auditorías de la plataforma
  r.get("/audits/all", auth.requireRole("superadmin"), (_req, res) => {
    const list = db.find("auditRequests", () => true);
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const expanded = list.map((a) => {
      const org = db.findOne("organizations", (o) => o.id === a.organizationId);
      return { ...a, organizationName: org?.name || "" };
    });
    res.json({ audits: expanded });
  });

  return r;
};
