const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const { regeneratePlanFor } = require("../lib/replan");
const crypto = require("crypto");

function hash(password) {
  return crypto.createHash("sha256").update(`opoplan:${password}`).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Rutas específicas para preparador y opositor.
// En este turno: lo justo para que la app siga siendo funcional.
// En la siguiente entrega: chatbot por opositor, disponibilidad + reservas,
// catálogo de trámites con tarea recurrente, observaciones por tarea, etc.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function rolesRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  // ── Preparador ─────────────────────────────────────────────────────────────

  r.get("/preparador/dashboard", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const prepId = req.user.role === "preparador" ? req.user.id : req.query.preparadorId;
    const orgId = req.user.organizationId;
    const assignments = db.find("assignments", (a) => a.preparadorId === prepId && a.active);
    const oposIds = assignments.map((a) => a.opositorId);
    const opositores = db.find("users", (u) => oposIds.includes(u.id));
    const progress = db.find("progress", (p) => oposIds.includes(p.opositorId));
    const interactions = db.find("interactions", (i) => i.preparadorId === prepId);
    const corrections = db.find("corrections", (c) => c.preparadorId === prepId);

    res.json({
      opositores: opositores.map((o) => {
        const myProgress = progress.filter((p) => p.opositorId === o.id);
        const avgMastery = myProgress.length
          ? Math.round(myProgress.reduce((a, p) => a + (p.mastery || 0), 0) / myProgress.length)
          : 0;
        return {
          id: o.id,
          name: o.name,
          email: o.email,
          phone: o.phone,
          mastery: avgMastery,
          examDate: o.commitment?.examDate || "",
          weeklyHours: o.commitment?.weeklyHours || 0,
        };
      }),
      stats: {
        opositoresCount: opositores.length,
        interactionsThisMonth: interactions.length,
        pendingCorrections: corrections.filter((c) => c.status === "pendiente").length,
      },
    });
  });

  r.get("/preparador/syllabi", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const prepId = req.user.role === "preparador" ? req.user.id : req.query.preparadorId;
    res.json({ syllabi: db.find("syllabi", (s) => s.preparadorId === prepId) });
  });

  r.post("/preparador/syllabi", auth.requireRole("preparador"), (req, res) => {
    const { title, description } = req.body || {};
    const s = db.insert("syllabi", {
      id: db.id("s"),
      organizationId: req.user.organizationId,
      preparadorId: req.user.id,
      title: title || "Nuevo temario",
      description: description || "",
      topics: [],
    });
    res.json({ syllabus: s });
  });

  r.post("/preparador/syllabi/:id/topics", auth.requireRole("preparador"), (req, res) => {
    const s = db.findOne("syllabi", (x) => x.id === req.params.id && x.preparadorId === req.user.id);
    if (!s) return res.status(404).json({ error: "not_found" });
    const topic = {
      id: db.id("t"),
      block: req.body.block || "",
      number: req.body.number || `Tema ${s.topics.length + 1}`,
      title: req.body.title || "Sin título",
      difficulty: req.body.difficulty || "Media",
      priority: req.body.priority || "Alta",
      attachments: [],
    };
    s.topics.push(topic);
    db.update("syllabi", (x) => x.id === s.id, { topics: s.topics });
    res.json({ topic });
  });

  // ── Opositor ───────────────────────────────────────────────────────────────

  r.get("/opositor/dashboard", auth.requireRole("opositor", "admin", "superadmin", "preparador"), (req, res) => {
    const oposId = req.user.role === "opositor" ? req.user.id : req.query.opositorId;
    const opo = db.findOne("users", (u) => u.id === oposId);
    if (!opo) return res.status(404).json({ error: "not_found" });
    const assignment = db.findOne("assignments", (a) => a.opositorId === oposId && a.active);
    const preparador = assignment ? db.findOne("users", (u) => u.id === assignment.preparadorId) : null;
    const plan = db.findOne("plans", (p) => p.opositorId === oposId);
    const progress = db.find("progress", (p) => p.opositorId === oposId);
    const procedures = db.find("procedures", (p) => p.opositorId === oposId);
    const assessments = db.find("assessments", (a) => a.opositorId === oposId);
    const habits = db.find("habits", (h) => h.opositorId === oposId);
    const materials = db.find("materials", (m) => m.opositorId === oposId || (!m.opositorId && m.organizationId === opo.organizationId));

    res.json({
      profile: {
        id: opo.id,
        name: opo.name,
        email: opo.email,
        phone: opo.phone,
        photo: opo.photo,
        commitment: opo.commitment,
        subscriptionPlanId: opo.subscriptionPlanId,
        chatbotEnabled: !!opo.chatbotEnabled,
      },
      preparador: preparador ? { id: preparador.id, name: preparador.name, email: preparador.email } : null,
      plan,
      progress,
      procedures,
      assessments,
      habits,
      materials,
    });
  });

  // Actualizar compromiso del opositor (con recálculo automático del plan)
  r.patch("/opositor/commitment", auth.requireRole("opositor"), (req, res) => {
    const previous = req.user.commitment || {};
    // Merge cuidadoso: si llega un campo lo respetamos; si no, mantenemos el anterior
    const next = { ...previous };
    for (const key of ["examName", "examDate", "weeklyHours", "dailyHours", "activeDays", "restDays", "vacationRanges"]) {
      if (req.body[key] !== undefined) next[key] = req.body[key];
    }
    // Validación ligera: activeDays y restDays no se pueden solapar
    if (Array.isArray(next.activeDays) && Array.isArray(next.restDays)) {
      next.restDays = next.restDays.filter((d) => !next.activeDays.includes(d));
    }
    db.update("users", (u) => u.id === req.user.id, { commitment: next });
    // Recálculo del plan tras cambiar el compromiso (preserva tareas hechas)
    const plan = regeneratePlanFor(req.user.id, { preserveDone: true });
    const out = { ...db.findOne("users", (u) => u.id === req.user.id) };
    delete out.passwordHash;
    res.json({ user: out, plan });
  });

  // Forzar recálculo manual del plan
  r.post("/opositor/replan", auth.requireRole("opositor"), (req, res) => {
    const plan = regeneratePlanFor(req.user.id, { preserveDone: req.body?.preserveDone !== false });
    res.json({ plan });
  });

  // Subir foto de perfil (recibe id de archivo ya subido, lo asocia al usuario)
  r.patch("/opositor/photo", auth.requireRole("opositor", "preparador", "admin", "superadmin"), (req, res) => {
    const { fileId } = req.body || {};
    if (!fileId) return res.status(400).json({ error: "missing_file" });
    const file = db.findOne("files", (f) => f.id === fileId);
    if (!file || file.ownerId !== req.user.id) return res.status(404).json({ error: "not_found" });
    db.update("users", (u) => u.id === req.user.id, { photo: file.url || `/api/files/download/${file.id}` });
    const out = { ...db.findOne("users", (u) => u.id === req.user.id) };
    delete out.passwordHash;
    res.json({ user: out });
  });

  // Editar datos básicos de perfil (nombre, teléfono, contraseña)
  r.patch("/opositor/profile", auth.requireAuth, (req, res) => {
    const patch = {};
    if (req.body.name) patch.name = req.body.name;
    if (req.body.phone !== undefined) patch.phone = req.body.phone;
    if (req.body.password) patch.passwordHash = hash(req.body.password);
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "nothing_to_update" });
    db.update("users", (u) => u.id === req.user.id, patch);
    const out = { ...db.findOne("users", (u) => u.id === req.user.id) };
    delete out.passwordHash;
    res.json({ user: out });
  });

  // Marcar tarea como hecha + observación (compliance: full/partial/none)
  // Las observaciones se conservan para 2ª y 3ª vuelta de repaso.
  r.patch("/opositor/tasks/:planId/:taskId", auth.requireRole("opositor"), (req, res) => {
    const plan = db.findOne("plans", (p) => p.id === req.params.planId && p.opositorId === req.user.id);
    if (!plan) return res.status(404).json({ error: "not_found" });
    const task = plan.tasks.find((t) => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: "task_not_found" });

    if (req.body.compliance !== undefined) {
      // full → done; partial / none → pendiente pero registramos el cumplimiento
      task.compliance = req.body.compliance; // "full" | "partial" | "none"
      task.done = req.body.compliance === "full";
    } else if (req.body.done !== undefined) {
      task.done = !!req.body.done;
      task.compliance = task.done ? "full" : task.compliance || "none";
    }
    if (req.body.notes !== undefined) {
      // Conservamos histórico de observaciones (para 2ª y 3ª vuelta)
      task.notes = req.body.notes;
      task.observations = task.observations || [];
      if (req.body.notes && req.body.notes.trim()) {
        task.observations.push({
          text: req.body.notes,
          compliance: task.compliance || "full",
          at: new Date().toISOString(),
        });
      }
    }
    db.update("plans", (p) => p.id === plan.id, { tasks: plan.tasks });
    res.json({ task });
  });

  // Hábito del día
  r.post("/opositor/habits", auth.requireRole("opositor"), (req, res) => {
    const h = db.insert("habits", {
      id: db.id("h"),
      organizationId: req.user.organizationId,
      opositorId: req.user.id,
      date: req.body.date || new Date().toISOString().slice(0, 10),
      hours: Number(req.body.hours) || 0,
      energy: req.body.energy || "media",
      mood: req.body.mood || "estable",
      focus: Number(req.body.focus) || 0,
      planCompliance: req.body.planCompliance || "full",
      notes: req.body.notes || "",
    });
    res.json({ habit: h });
  });

  return r;
};
