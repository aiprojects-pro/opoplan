const express = require("express");
const crypto = require("crypto");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const notifications = require("../services/notifications");

function hash(password) {
  return crypto.createHash("sha256").update(`opoplan:${password}`).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// API del administrador de academia. Cada admin solo ve y modifica datos de
// su propia organización (req.user.organizationId). El super-admin puede
// inspeccionar cualquier organización pasando ?orgId=...
// ─────────────────────────────────────────────────────────────────────────────

function orgIdOf(req) {
  if (req.user.role === "superadmin") return req.query.orgId || null;
  return req.user.organizationId;
}

module.exports = function adminRoutes({ appUrl } = {}) {
  const r = express.Router();

  r.use(auth.requireRole("admin", "superadmin"));

  // ── Mi organización ────────────────────────────────────────────────────────

  r.get("/organization", (req, res) => {
    const orgId = orgIdOf(req);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    if (!org) return res.status(404).json({ error: "not_found" });
    res.json({ organization: org });
  });

  // Branding, contacto, facturación, integraciones — todo en un único PATCH.
  // Acepta secciones parciales: { branding: {...}, contact: {...}, ... }
  r.patch("/organization", (req, res) => {
    const orgId = orgIdOf(req);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    if (!org) return res.status(404).json({ error: "not_found" });

    const patch = {};
    for (const key of ["name", "branding", "contact", "billing", "integrations"]) {
      if (req.body[key] !== undefined) {
        // Merge superficial sección a sección para no borrar claves no enviadas
        patch[key] = typeof org[key] === "object" && !Array.isArray(org[key])
          ? { ...org[key], ...req.body[key] }
          : req.body[key];
        // Para integrations hay un nivel más
        if (key === "integrations" && req.body.integrations) {
          patch.integrations = { ...org.integrations };
          for (const sub of Object.keys(req.body.integrations)) {
            patch.integrations[sub] = { ...(org.integrations?.[sub] || {}), ...req.body.integrations[sub] };
          }
        }
      }
    }

    const updated = db.update("organizations", (o) => o.id === orgId, patch);
    res.json({ organization: updated });
  });

  // ── Dashboard de la academia ───────────────────────────────────────────────

  r.get("/dashboard", (req, res) => {
    const orgId = orgIdOf(req);
    const users = db.find("users", (u) => u.organizationId === orgId);
    const opositores = users.filter((u) => u.role === "opositor");
    const preparadores = users.filter((u) => u.role === "preparador");
    const assignments = db.find("assignments", (a) => a.organizationId === orgId && a.active);
    const subs = db.find("subscriptions", (s) => s.organizationId === orgId && s.status === "active");
    const interactions = db.find("interactions", (i) => i.organizationId === orgId);
    const corrections = db.find("corrections", (c) => c.organizationId === orgId);
    const procedures = db.find("procedures", (p) => p.organizationId === orgId);

    // Carga por preparador
    const loadByPreparador = preparadores.map((p) => {
      const myOpos = assignments.filter((a) => a.preparadorId === p.id);
      const myInteractions = interactions.filter((i) => i.preparadorId === p.id);
      const myCorrections = corrections.filter((c) => c.preparadorId === p.id);
      return {
        id: p.id,
        name: p.name,
        opositoresAssigned: myOpos.length,
        interactionsThisMonth: myInteractions.length,
        pendingCorrections: myCorrections.filter((c) => c.status === "pendiente").length,
      };
    });

    res.json({
      totals: {
        users: users.length,
        opositores: opositores.length,
        preparadores: preparadores.length,
        admins: users.filter((u) => u.role === "admin").length,
        activeSubscriptions: subs.length,
        monthlyRevenue: subs.reduce((a, s) => a + (Number(s.amount) || 0), 0),
        pendingCorrections: corrections.filter((c) => c.status === "pendiente").length,
        urgentProcedures: procedures.filter((p) => p.status === "urgente").length,
        announcementsToday: 0,
      },
      loadByPreparador,
    });
  });

  // ── Usuarios y roles ───────────────────────────────────────────────────────

  r.get("/users", (req, res) => {
    const orgId = orgIdOf(req);
    const users = db.find("users", (u) => u.organizationId === orgId);
    const assignments = db.find("assignments", (a) => a.organizationId === orgId && a.active);

    const enriched = users.map((u) => {
      const safe = { ...u };
      delete safe.passwordHash;
      if (u.role === "preparador") {
        safe.opositoresAssigned = assignments.filter((a) => a.preparadorId === u.id).length;
      }
      if (u.role === "opositor") {
        const a = assignments.find((x) => x.opositorId === u.id);
        safe.preparadorId = a ? a.preparadorId : null;
        safe.preparadorName = a ? users.find((x) => x.id === a.preparadorId)?.name || null : null;
      }
      return safe;
    });

    res.json({ users: enriched });
  });

  r.post("/users", (req, res) => {
    const orgId = orgIdOf(req);
    const { name, email, password, role, phone, specialty, subscriptionPlanId } = req.body || {};
    if (!name || !email || !password || !role) return res.status(400).json({ error: "missing_fields" });
    if (!["admin", "preparador", "opositor"].includes(role)) return res.status(400).json({ error: "invalid_role" });
    if (db.findOne("users", (u) => u.email.toLowerCase() === String(email).toLowerCase())) {
      return res.status(409).json({ error: "email_in_use" });
    }
    const newUser = db.insert("users", {
      id: db.id("u"),
      organizationId: orgId,
      role,
      name,
      email,
      phone: phone || "",
      photo: "",
      passwordHash: hash(password),
      status: "active",
      ...(role === "preparador" ? { specialty: specialty || "" } : {}),
      ...(role === "opositor"
        ? {
            subscriptionPlanId: subscriptionPlanId || "plan_free",
            commitment: { examName: "", examDate: "", weeklyHours: 0, dailyHours: 0, activeDays: [], restDays: [], vacationRanges: [] },
          }
        : {}),
    });
    const out = { ...newUser };
    delete out.passwordHash;

    // Si es opositor, crear automáticamente la tarea recurrente "Revisar BOE"
    // todos los viernes 13:00 (1h). Modificable o eliminable después.
    if (role === "opositor") {
      const today = new Date();
      // Próximo viernes
      const friday = new Date(today);
      const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
      friday.setDate(today.getDate() + daysUntilFriday);
      db.insert("events", {
        id: db.id("e"),
        organizationId: orgId,
        ownerType: "opositor",
        ownerId: newUser.id,
        opositorId: newUser.id,
        recipients: [newUser.id],
        title: "📰 Revisar BOE",
        type: "tarea",
        date: friday.toISOString().slice(0, 10),
        time: "13:00",
        durationMin: 60,
        recurrence: "weekly",
        recurrenceUntil: "",
        recurrenceExceptions: [],
        description: "Revisar el Boletín Oficial del Estado para detectar nuevas convocatorias, modificaciones normativas y publicaciones relevantes.",
        createdAt: new Date().toISOString(),
      });
    }

    // Bienvenida por email (no bloqueamos la respuesta si falla)
    notifications
      .notify({
        orgId,
        to: newUser.email,
        template: "welcome",
        data: { name: newUser.name, role: newUser.role },
        appUrl,
      })
      .catch((e) => console.error("[notify:welcome]", e));

    res.json({ user: out });
  });

  // Activar / desactivar usuario
  r.patch("/users/:id/status", (req, res) => {
    const orgId = orgIdOf(req);
    const { status } = req.body || {};
    if (!["active", "inactive"].includes(status)) return res.status(400).json({ error: "invalid_status" });
    const user = db.findOne("users", (u) => u.id === req.params.id && u.organizationId === orgId);
    if (!user) return res.status(404).json({ error: "not_found" });
    const updated = db.update("users", (u) => u.id === user.id, { status });
    const out = { ...updated };
    delete out.passwordHash;
    res.json({ user: out });
  });

  r.patch("/users/:id", (req, res) => {
    const orgId = orgIdOf(req);
    const user = db.findOne("users", (u) => u.id === req.params.id && u.organizationId === orgId);
    if (!user) return res.status(404).json({ error: "not_found" });
    const patch = { ...req.body };
    if (patch.password) {
      patch.passwordHash = hash(patch.password);
      delete patch.password;
    }
    delete patch.id;
    delete patch.role; // no se cambia el rol así por seguridad
    delete patch.organizationId;
    const updated = db.update("users", (u) => u.id === user.id, patch);
    const out = { ...updated };
    delete out.passwordHash;
    res.json({ user: out });
  });

  r.delete("/users/:id", (req, res) => {
    const orgId = orgIdOf(req);
    const user = db.findOne("users", (u) => u.id === req.params.id && u.organizationId === orgId);
    if (!user) return res.status(404).json({ error: "not_found" });
    if (user.id === req.user.id) return res.status(400).json({ error: "cannot_delete_self" });
    db.update("users", (u) => u.id === user.id, { status: "inactive" });
    res.json({ ok: true });
  });

  // ── Asignaciones preparador ↔ opositor con histórico ───────────────────────

  r.get("/assignments", (req, res) => {
    const orgId = orgIdOf(req);
    res.json({
      assignments: db.find("assignments", (a) => a.organizationId === orgId),
      history: db.find("assignmentHistory", (h) => h.organizationId === orgId),
    });
  });

  r.post("/assignments", (req, res) => {
    const orgId = orgIdOf(req);
    const { preparadorId, opositorId, reason } = req.body || {};
    if (!preparadorId || !opositorId) return res.status(400).json({ error: "missing_fields" });

    // Cierra cualquier asignación activa anterior del opositor
    const previous = db.find("assignments", (a) => a.organizationId === orgId && a.opositorId === opositorId && a.active);
    for (const prev of previous) {
      db.update("assignments", (a) => a.id === prev.id, { active: false, until: new Date().toISOString().slice(0, 10) });
      db.insert("assignmentHistory", {
        id: db.id("ah"),
        organizationId: orgId,
        opositorId,
        previousPreparadorId: prev.preparadorId,
        newPreparadorId: preparadorId,
        changedAt: new Date().toISOString(),
        changedBy: req.user.id,
        reason: reason || "",
      });
    }

    const a = db.insert("assignments", {
      id: db.id("a"),
      organizationId: orgId,
      preparadorId,
      opositorId,
      since: new Date().toISOString().slice(0, 10),
      active: true,
    });

    // Notificamos a preparador y opositor
    const opositor = db.findOne("users", (u) => u.id === opositorId);
    const preparador = db.findOne("users", (u) => u.id === preparadorId);
    if (opositor && preparador) {
      const data = { opositorName: opositor.name, preparadorName: preparador.name, reason: reason || "" };
      notifications.notifyUsers({
        orgId,
        userIds: [preparadorId, opositorId],
        template: "assignment",
        data,
        appUrl,
      }).catch((e) => console.error("[notify:assignment]", e));
    }

    res.json({ assignment: a });
  });

  // ── Planes propios de la academia (suma a los globales) ───────────────────

  r.get("/plans", (req, res) => {
    const orgId = orgIdOf(req);
    const global = db.find("subscriptionPlans", (p) => p.scope === "global" && p.active);
    const own = db.find("subscriptionPlans", (p) => p.scope === "org" && p.organizationId === orgId);
    res.json({ global, own });
  });

  r.post("/plans", (req, res) => {
    const orgId = orgIdOf(req);
    const { name, target, price, currency, period, trialDays, features, active } = req.body || {};
    if (!name || price == null) return res.status(400).json({ error: "missing_fields" });
    const plan = db.insert("subscriptionPlans", {
      id: db.id("plan"),
      scope: "org",
      organizationId: orgId,
      name,
      target: target || "opositor",
      price: Number(price),
      currency: currency || "EUR",
      period: period || "monthly",
      trialDays: Number(trialDays) || 0,
      features: Array.isArray(features) ? features : [],
      active: active !== false,
    });
    res.json({ plan });
  });

  r.patch("/plans/:id", (req, res) => {
    const orgId = orgIdOf(req);
    const updated = db.update(
      "subscriptionPlans",
      (p) => p.id === req.params.id && p.organizationId === orgId,
      req.body || {},
    );
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ plan: updated });
  });

  // ── Suscripciones de la academia ──────────────────────────────────────────

  r.get("/subscriptions", (req, res) => {
    const orgId = orgIdOf(req);
    const subs = db.find("subscriptions", (s) => s.organizationId === orgId);
    const users = db.find("users", (u) => u.organizationId === orgId);
    const plans = db.find("subscriptionPlans", () => true);
    res.json({
      subscriptions: subs.map((s) => ({
        ...s,
        userName: users.find((u) => u.id === s.userId)?.name || "(usuario eliminado)",
        userEmail: users.find((u) => u.id === s.userId)?.email || "",
        planName: plans.find((p) => p.id === s.planId)?.name || s.planId,
      })),
    });
  });

  r.post("/subscriptions", (req, res) => {
    const orgId = orgIdOf(req);
    const { userId, planId } = req.body || {};
    const plan = db.findOne("subscriptionPlans", (p) => p.id === planId);
    if (!plan) return res.status(400).json({ error: "invalid_plan" });
    const sub = db.insert("subscriptions", {
      id: db.id("sub"),
      organizationId: orgId,
      userId,
      planId,
      status: "active",
      amount: plan.price,
      renewalDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      provider: "internal",
      stripeSubscriptionId: "",
    });
    db.update("users", (u) => u.id === userId && u.organizationId === orgId, { subscriptionPlanId: planId });
    res.json({ subscription: sub });
  });

  return r;
};
