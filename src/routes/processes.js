const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const { PROCESS_STATUSES } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// Procesos selectivos del preparador (transcripción ~20:22).
// Un preparador puede gestionar varios procesos a la vez, asignar opositores
// a cada uno y ver su carga total. Las cuotas se validan contra su plan
// de suscripción (subscriptionPlans.quota).
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function processesRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  // Lista los procesos del preparador (o de la organización si admin).
  r.get("/processes", (req, res) => {
    const orgId = req.user.organizationId;
    let list = db.find("processes", (p) => p.organizationId === orgId);
    if (req.user.role === "preparador") {
      list = list.filter((p) => p.preparadorId === req.user.id);
    }
    // Enriquecer con conteo de opositores
    const expanded = list.map((p) => {
      const assigned = db.find("assignments", (a) => a.processId === p.id && a.active);
      return { ...p, opositoresCount: assigned.length };
    });
    res.json({ processes: expanded });
  });

  // Quota: cuántos opositores y procesos puede tener este preparador
  r.get("/processes/quota", auth.requireRole("preparador"), (req, res) => {
    const me = req.user;
    const plan = db.findOne("subscriptionPlans", (p) => p.id === me.subscriptionPlanId);
    const quota = plan?.quota || { maxOpositores: 999, maxProcesses: 999 };
    const myProcesses = db.find("processes", (p) => p.preparadorId === me.id);
    const myAssignments = db.find("assignments", (a) => a.preparadorId === me.id && a.active);
    res.json({
      quota,
      usage: {
        processes: myProcesses.length,
        opositores: myAssignments.length,
      },
      planName: plan?.name || "(sin plan)",
    });
  });

  r.post("/processes", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const preparadorId = req.user.role === "preparador" ? req.user.id : req.body.preparadorId;
    if (!preparadorId) return res.status(400).json({ error: "missing_preparador" });

    // Validar cuota si es preparador
    if (req.user.role === "preparador") {
      const plan = db.findOne("subscriptionPlans", (p) => p.id === req.user.subscriptionPlanId);
      const quota = plan?.quota?.maxProcesses ?? 999;
      const current = db.find("processes", (p) => p.preparadorId === preparadorId).length;
      if (current >= quota) {
        return res.status(409).json({ error: "quota_exceeded", quota, current });
      }
    }

    const proc = db.insert("processes", {
      id: db.id("pr"),
      organizationId: orgId,
      preparadorId,
      name: req.body.name || "Proceso sin nombre",
      examName: req.body.examName || "",
      examDate: req.body.examDate || "",
      organism: req.body.organism || "",
      level: req.body.level || "",
      status: PROCESS_STATUSES.includes(req.body.status) ? req.body.status : "planning",
      description: req.body.description || "",
      syllabusId: req.body.syllabusId || null,
      createdAt: new Date().toISOString(),
    });
    res.json({ process: proc });
  });

  r.patch("/processes/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const proc = db.findOne("processes", (p) => p.id === req.params.id && p.organizationId === orgId);
    if (!proc) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "preparador" && proc.preparadorId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    const allowed = ["name", "examName", "examDate", "organism", "level", "status", "description", "syllabusId"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (patch.status && !PROCESS_STATUSES.includes(patch.status)) delete patch.status;
    const updated = db.update("processes", (p) => p.id === proc.id, patch);
    res.json({ process: updated });
  });

  r.delete("/processes/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const proc = db.findOne("processes", (p) => p.id === req.params.id && p.organizationId === orgId);
    if (!proc) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "preparador" && proc.preparadorId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    // Si tiene opositores asignados, no permitir borrar (reasignar primero)
    const assigned = db.find("assignments", (a) => a.processId === proc.id && a.active);
    if (assigned.length && req.query.force !== "true") {
      return res.status(409).json({ error: "has_opositores", count: assigned.length });
    }
    db.remove("processes", (p) => p.id === proc.id);
    res.json({ ok: true });
  });

  // Asignar/reasignar opositor a proceso
  r.post("/processes/:id/assign", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const proc = db.findOne("processes", (p) => p.id === req.params.id && p.organizationId === orgId);
    if (!proc) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "preparador" && proc.preparadorId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    const { opositorId } = req.body || {};
    if (!opositorId) return res.status(400).json({ error: "missing_opositor" });
    const opo = db.findOne("users", (u) => u.id === opositorId && u.organizationId === orgId && u.role === "opositor");
    if (!opo) return res.status(404).json({ error: "opositor_not_found" });

    // Marcar asignaciones previas como inactivas si pertenecen al mismo preparador
    db.update("assignments",
      (a) => a.opositorId === opositorId && a.active,
      { active: false, deactivatedAt: new Date().toISOString() });

    const a = db.insert("assignments", {
      id: db.id("as"),
      organizationId: orgId,
      preparadorId: proc.preparadorId,
      processId: proc.id,
      opositorId,
      active: true,
      createdAt: new Date().toISOString(),
    });
    res.json({ assignment: a });
  });

  return r;
};
