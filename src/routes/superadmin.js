const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const passwords = require("../lib/passwords");
const { PLAN_LINES } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// API del super-administrador. Solo accesible para users.role === "superadmin".
//
// Mejoras incorporadas de la conversación de revisión:
//   - El dashboard muestra TODOS los roles correctamente (~20:08): admin,
//     preparador, opositor, suscripciones activas reales (no solo opositores).
//   - Los planes incluyen el conteo de suscripciones activas y el estado de
//     "borrable" (~20:05): si un plan tiene suscriptores, no se puede eliminar.
//   - Los planes se clasifican por línea (oposiciones, universidad, EBAU,
//     preparador independiente) — transcripción ~19:57.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function superadminRoutes() {
  const r = express.Router();

  r.use(auth.requireRole("superadmin"));

  // Dashboard agregado de toda la plataforma
  r.get("/dashboard", (req, res) => {
    const orgs = db.find("organizations", () => true);
    const users = db.find("users", () => true);
    const subs = db.find("subscriptions", (s) => s.status === "active");
    const plans = db.find("subscriptionPlans", () => true);

    const usersByRole = users.reduce((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});

    // Bug detectado en la conversación (~20:08): hay que mostrar también el
    // administrador como suscripción activa (porque la academia sí está activa)
    // y reflejar correctamente cuantas suscripciones activas tiene cada org.
    const revenueByOrg = subs.reduce((acc, s) => {
      acc[s.organizationId] = (acc[s.organizationId] || 0) + (Number(s.amount) || 0);
      return acc;
    }, {});

    const orgSummary = orgs.map((o) => {
      const orgUsers = users.filter((u) => u.organizationId === o.id);
      const orgSubs = subs.filter((s) => s.organizationId === o.id);
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        type: o.type || "academia",
        users: orgUsers.length,
        admins: orgUsers.filter((u) => u.role === "admin").length,
        preparadores: orgUsers.filter((u) => u.role === "preparador").length,
        opositores: orgUsers.filter((u) => u.role === "opositor").length,
        // Suscripciones activas de la organización.
        // Si la academia está activa la contamos como "academia activa".
        activeSubs: orgSubs.length,
        academyActive: o.status === "active",
        monthlyRevenue: revenueByOrg[o.id] || 0,
      };
    });

    res.json({
      totals: {
        organizations: orgs.length,
        activeOrganizations: orgs.filter((o) => o.status === "active").length,
        users: users.length,
        admins: usersByRole.admin || 0,
        preparadores: usersByRole.preparador || 0,
        opositores: usersByRole.opositor || 0,
        activeSubscriptions: subs.length,
        // El total que se ve arriba en el panel ahora suma:
        // suscripciones reales + academias activas (que también pagan).
        totalActiveAccounts: subs.length + orgs.filter((o) => o.status === "active").length,
        monthlyRevenue: subs.reduce((a, s) => a + (Number(s.amount) || 0), 0),
        plansAvailable: plans.filter((p) => p.active).length,
      },
      organizations: orgSummary,
      // Catálogo de líneas de planes para que el UI pueda filtrar
      planLines: PLAN_LINES,
    });
  });

  // Listado de organizaciones con detalle completo
  r.get("/organizations", (req, res) => {
    const orgs = db.find("organizations", () => true);
    const users = db.find("users", () => true);
    res.json({
      organizations: orgs.map((o) => ({
        ...o,
        userCount: users.filter((u) => u.organizationId === o.id).length,
        adminCount: users.filter((u) => u.organizationId === o.id && u.role === "admin").length,
      })),
    });
  });

  // Crear academia + administrador inicial
  r.post("/organizations", (req, res) => {
    const { name, slug, type, adminName, adminEmail, adminPassword, branding, contact, billing } = req.body || {};
    if (!name || !slug || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const cleanSlug = String(slug)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "");
    if (db.findOne("organizations", (o) => o.slug === cleanSlug)) {
      return res.status(409).json({ error: "slug_in_use" });
    }
    if (db.findOne("users", (u) => u.email.toLowerCase() === String(adminEmail).toLowerCase())) {
      return res.status(409).json({ error: "email_in_use" });
    }

    const orgId = db.id("org");
    const org = db.insert("organizations", {
      id: orgId,
      name,
      slug: cleanSlug,
      status: "active",
      type: type === "preparador_independiente" ? "preparador_independiente" : "academia",
      createdAt: new Date().toISOString().slice(0, 10),
      branding: {
        tagline: branding?.tagline || "",
        initials: branding?.initials || name.slice(0, 2).toUpperCase(),
        primaryColor: branding?.primaryColor || "#155ea8",
        secondaryColor: branding?.secondaryColor || "#08264a",
        accentColor: branding?.accentColor || "#0c8f6f",
        logo: branding?.logo || "",
        favicon: branding?.favicon || "",
      },
      contact: contact || { email: "", phone: "", website: "", address: "" },
      billing: billing || { legalName: "", taxId: "", address: "", country: "ES", iban: "" },
      integrations: {
        stripe: { enabled: false, publishableKey: "", secretKey: "", webhookSecret: "" },
        email: { enabled: false, provider: "resend", apiKey: "", from: "" },
        storage: { enabled: false, provider: "r2", bucket: "", endpoint: "", accessKeyId: "", secretAccessKey: "" },
        ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
        moodle: { enabled: false, baseUrl: "", clientId: "", clientSecret: "" },
        videoconference: { enabled: false, provider: "zoom", account: "", baseUrl: "" },
        redsys: { enabled: false, merchantCode: "", terminal: "1", secretKey: "", environment: "sandbox" },
        legal: { privacyUrl: "", termsUrl: "", dataController: "", supportEmail: "" },
      },
      globalPlanOverrides: {},
      nps: { enabled: false, template: "nps_classic", frequency: "monthly", customQuestions: [] },
      defaults: {
        inactivityReminder: { preset: "normal", days: 7 },
        brokenCommitmentEmail: { enabled: true, daysInARow: 3 },
        unconsumedTutoringEmail: { enabled: true },
      },
    });

    const admin = db.insert("users", {
      id: db.id("u"),
      organizationId: orgId,
      role: "admin",
      name: adminName || "Administrador",
      email: adminEmail,
      phone: "",
      photo: "",
      passwordHash: passwords.hash(adminPassword),
      status: "active",
    });

    res.json({ organization: org, admin: { id: admin.id, email: admin.email } });
  });

  // Editar academia (incluye branding, contacto, facturación, estado)
  r.patch("/organizations/:id", (req, res) => {
    const updated = db.update("organizations", (o) => o.id === req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ organization: updated });
  });

  // Desactivar academia
  r.delete("/organizations/:id", (req, res) => {
    const updated = db.update("organizations", (o) => o.id === req.params.id, { status: "inactive" });
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  });

  // Reactivar
  r.post("/organizations/:id/activate", (req, res) => {
    const updated = db.update("organizations", (o) => o.id === req.params.id, { status: "active" });
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ organization: updated });
  });

  // ── Planes globales ────────────────────────────────────────────────────────

  // GET /plans incluye conteo de suscriptores activos por plan y si es borrable
  // (~20:05): "si tiene 0 personas lo puedo borrar; si tiene 3 personas no".
  r.get("/plans", (req, res) => {
    const plans = db.find("subscriptionPlans", (p) => p.scope === "global");
    const subs = db.find("subscriptions", (s) => s.status === "active");
    const enriched = plans.map((p) => ({
      ...p,
      activeSubscribers: subs.filter((s) => s.planId === p.id).length,
      deletable: subs.filter((s) => s.planId === p.id).length === 0,
    }));
    res.json({ plans: enriched, lines: PLAN_LINES });
  });

  r.post("/plans", (req, res) => {
    const { name, line, target, price, currency, period, trialDays, features, active, quota } = req.body || {};
    if (!name || price == null) return res.status(400).json({ error: "missing_fields" });
    const plan = db.insert("subscriptionPlans", {
      id: db.id("plan"),
      scope: "global",
      organizationId: null,
      line: line || "oposiciones",
      name,
      target: target || "opositor",
      price: Number(price),
      currency: currency || "EUR",
      period: period || "monthly",
      trialDays: Number(trialDays) || 0,
      features: Array.isArray(features) ? features : [],
      active: active !== false,
      quota: quota || null,
    });
    res.json({ plan });
  });

  r.patch("/plans/:id", (req, res) => {
    const updated = db.update(
      "subscriptionPlans",
      (p) => p.id === req.params.id && p.scope === "global",
      req.body || {},
    );
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ plan: updated });
  });

  // DELETE protegido (~20:05): si tiene suscriptores activos rechazamos.
  r.delete("/plans/:id", (req, res) => {
    const plan = db.findOne("subscriptionPlans", (p) => p.id === req.params.id && p.scope === "global");
    if (!plan) return res.status(404).json({ error: "not_found" });
    const activeSubs = db.find("subscriptions", (s) => s.status === "active" && s.planId === plan.id);
    if (req.query.force !== "true" && activeSubs.length > 0) {
      return res.status(409).json({
        error: "has_active_subscribers",
        activeSubscribers: activeSubs.length,
        message: `Este plan tiene ${activeSubs.length} suscriptores activos. Desactívalo en lugar de borrarlo, o usa ?force=true para forzar.`,
      });
    }
    // En caso de no tener suscriptores: marca como inactivo (no borrado físico)
    const updated = db.update("subscriptionPlans", (p) => p.id === plan.id, { active: false });
    res.json({ ok: true, plan: updated });
  });

  return r;
};
