const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const crypto = require("crypto");

// CRM especializado para academias de oposiciones (catálogo §A.7).
//
// Lo que cubre este módulo:
//   - Leads: personas interesadas que aún no son alumnos. Pasan por un
//     pipeline de etapas hasta convertirse (o perderse).
//   - Pipeline: lead → contacto → demo → prueba → matrícula | perdido.
//   - Conversión: cuando se matricula, el lead se enlaza con el `userId` del
//     opositor creado.
//   - Segmentación: tags libres (primer_opositor, repetidor, con_trabajo,
//     con_familia, etc.) para campañas dirigidas.
//   - Alumni: opositores que aprobaron — quedan ligados a la academia para
//     testimonios, referidos, mentoring (catálogo §B.5).
//
// Lo que NO cubre todavía:
//   - Email marketing automatizado de nurturing (las plantillas existen, falta
//     un pipeline de envío programado por etapa).
//   - Integraciones con tracking externo (Mailchimp, HubSpot...).

const PIPELINE_STAGES = [
  { id: "lead",        label: "Lead",          color: "#94a3b8" },
  { id: "contacted",   label: "Contactado",    color: "#0ea5e9" },
  { id: "demo",        label: "Demo / prueba", color: "#7c3aed" },
  { id: "negotiating", label: "Negociando",    color: "#d97706" },
  { id: "matriculated", label: "Matriculado",  color: "#0c8f6f" },
  { id: "lost",        label: "Perdido",       color: "#94a3b8" },
];

const ALUMNI_STATUSES = [
  { id: "approved", label: "Aprobado" },
  { id: "in_position", label: "En el puesto" },
  { id: "ambassador", label: "Embajador" },
];

module.exports = function crmRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }
  function isStaff(req) { return ["admin", "preparador", "superadmin"].includes(req.user.role); }
  function isAdmin(req) { return ["admin", "superadmin"].includes(req.user.role); }

  // ── LEADS ─────────────────────────────────────────────────────────────
  r.get("/crm/stages", (_req, res) => res.json({ stages: PIPELINE_STAGES }));

  r.get("/crm/leads", (req, res) => {
    if (!isStaff(req)) return res.status(403).json({ error: "forbidden" });
    const { stage, q, tag } = req.query;
    let leads = db.find("leads", (l) => l.organizationId === orgOf(req));
    if (stage) leads = leads.filter((l) => l.stage === stage);
    if (tag) leads = leads.filter((l) => (l.tags || []).includes(tag));
    if (q) {
      const Q = String(q).toLowerCase();
      leads = leads.filter((l) => (l.name + " " + l.email + " " + (l.notes || "")).toLowerCase().includes(Q));
    }
    leads.sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
    // Resumen por etapa
    const byStage = {};
    for (const s of PIPELINE_STAGES) byStage[s.id] = 0;
    for (const l of db.find("leads", (l) => l.organizationId === orgOf(req))) byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    res.json({ leads, byStage });
  });

  r.post("/crm/leads", (req, res) => {
    if (!isStaff(req)) return res.status(403).json({ error: "forbidden" });
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: "missing_name" });
    const lead = db.insert("leads", {
      id: "lead_" + crypto.randomBytes(4).toString("hex"),
      organizationId: orgOf(req),
      name: b.name,
      email: b.email || "",
      phone: b.phone || "",
      source: b.source || "manual", // manual | landing | referral | event | ad
      oposicion: b.oposicion || "",
      stage: b.stage || "lead",
      tags: Array.isArray(b.tags) ? b.tags : [],
      notes: b.notes || "",
      assignedTo: b.assignedTo || req.user.id,
      // Si esta persona se matricula, aquí queda el ID del opositor real
      convertedUserId: null,
      // Histórico de movimientos en el pipeline
      events: [{ type: "created", at: new Date().toISOString(), by: req.user.id }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    res.json({ lead });
  });

  r.patch("/crm/leads/:id", (req, res) => {
    if (!isStaff(req)) return res.status(403).json({ error: "forbidden" });
    const l = db.findOne("leads", (x) => x.id === req.params.id && x.organizationId === orgOf(req));
    if (!l) return res.status(404).json({ error: "not_found" });
    const allowed = ["name", "email", "phone", "source", "oposicion", "tags", "notes", "assignedTo"];
    const patch = { updatedAt: new Date().toISOString() };
    for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
    if (req.body?.stage && req.body.stage !== l.stage) {
      patch.stage = req.body.stage;
      patch.events = [...(l.events || []), { type: "stage_change", from: l.stage, to: req.body.stage, at: new Date().toISOString(), by: req.user.id }];
    }
    res.json({ lead: db.update("leads", (x) => x.id === l.id, patch) });
  });

  r.delete("/crm/leads/:id", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const l = db.findOne("leads", (x) => x.id === req.params.id && x.organizationId === orgOf(req));
    if (!l) return res.status(404).json({ error: "not_found" });
    db.remove("leads", (x) => x.id === l.id);
    res.json({ ok: true });
  });

  // POST /crm/leads/:id/convert — convierte un lead en opositor (matrícula)
  r.post("/crm/leads/:id/convert", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const l = db.findOne("leads", (x) => x.id === req.params.id && x.organizationId === orgOf(req));
    if (!l) return res.status(404).json({ error: "not_found" });
    if (l.convertedUserId) return res.status(409).json({ error: "already_converted", userId: l.convertedUserId });
    const userId = req.body?.userId;
    if (!userId) return res.status(400).json({ error: "missing_user_id", message: "Crea primero el opositor desde Usuarios y luego pasa userId aquí." });
    const u = db.findOne("users", (x) => x.id === userId && x.organizationId === orgOf(req));
    if (!u) return res.status(404).json({ error: "user_not_found" });
    db.update("leads", (x) => x.id === l.id, {
      convertedUserId: userId,
      stage: "matriculated",
      events: [...(l.events || []), { type: "converted", to: userId, at: new Date().toISOString(), by: req.user.id }],
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true, userId });
  });

  // ── ALUMNI ──────────────────────────────────────────────────────────────
  r.get("/crm/alumni", (req, res) => {
    if (!isStaff(req)) return res.status(403).json({ error: "forbidden" });
    const list = db.find("alumni", (a) => a.organizationId === orgOf(req));
    const expanded = list.map((a) => {
      const u = db.findOne("users", (x) => x.id === a.userId);
      return { ...a, name: u?.name || a.name, email: u?.email || a.email };
    });
    res.json({ alumni: expanded, statuses: ALUMNI_STATUSES });
  });

  r.post("/crm/alumni", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const { userId, oposicion, year, position, status, testimonial, offersMentoring } = req.body || {};
    if (!userId) return res.status(400).json({ error: "missing_user_id" });
    const u = db.findOne("users", (x) => x.id === userId && x.organizationId === orgOf(req));
    if (!u) return res.status(404).json({ error: "user_not_found" });
    const existing = db.findOne("alumni", (a) => a.userId === userId && a.organizationId === orgOf(req));
    if (existing) return res.status(409).json({ error: "already_alumni", alumnusId: existing.id });
    const a = db.insert("alumni", {
      id: "alm_" + crypto.randomBytes(4).toString("hex"),
      organizationId: orgOf(req),
      userId,
      name: u.name,
      email: u.email,
      oposicion: oposicion || "",
      year: year || new Date().getFullYear(),
      position: position || "",
      status: status || "approved",
      testimonial: testimonial || "",
      offersMentoring: !!offersMentoring,
      createdAt: new Date().toISOString(),
    });
    res.json({ alumnus: a });
  });

  r.patch("/crm/alumni/:id", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const a = db.findOne("alumni", (x) => x.id === req.params.id && x.organizationId === orgOf(req));
    if (!a) return res.status(404).json({ error: "not_found" });
    const allowed = ["oposicion", "year", "position", "status", "testimonial", "offersMentoring"];
    const patch = {};
    for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
    res.json({ alumnus: db.update("alumni", (x) => x.id === a.id, patch) });
  });

  // GET /crm/mentors — alumni que ofrecen mentoring (visible a opositores)
  r.get("/crm/mentors", (req, res) => {
    const list = db.find("alumni",
      (a) => a.organizationId === orgOf(req) && a.offersMentoring);
    res.json({
      mentors: list.map((a) => ({
        id: a.id,
        name: a.name,
        oposicion: a.oposicion,
        year: a.year,
        position: a.position,
        testimonial: a.testimonial,
      })),
    });
  });

  return r;
};
