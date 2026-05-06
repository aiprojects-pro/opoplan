const express = require("express");
const crypto = require("crypto");
const db = require("../lib/db");
const auth = require("../middleware/auth");

function hash(password) {
  return crypto.createHash("sha256").update(`opoplan:${password}`).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// API del super-administrador. Solo accesible para users.role === "superadmin".
//   - GET    /api/superadmin/dashboard          → métricas globales
//   - GET    /api/superadmin/organizations
//   - POST   /api/superadmin/organizations      → alta de academia + admin
//   - PATCH  /api/superadmin/organizations/:id  → editar academia
//   - DELETE /api/superadmin/organizations/:id  → desactivar academia
//   - GET    /api/superadmin/plans              → planes globales
//   - POST   /api/superadmin/plans              → crear plan global
//   - PATCH  /api/superadmin/plans/:id          → editar plan global
//   - DELETE /api/superadmin/plans/:id          → desactivar plan global
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

    const revenueByOrg = subs.reduce((acc, s) => {
      acc[s.organizationId] = (acc[s.organizationId] || 0) + (Number(s.amount) || 0);
      return acc;
    }, {});

    const orgSummary = orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      users: users.filter((u) => u.organizationId === o.id).length,
      activeSubs: subs.filter((s) => s.organizationId === o.id).length,
      monthlyRevenue: revenueByOrg[o.id] || 0,
    }));

    res.json({
      totals: {
        organizations: orgs.length,
        activeOrganizations: orgs.filter((o) => o.status === "active").length,
        users: users.length,
        admins: usersByRole.admin || 0,
        preparadores: usersByRole.preparador || 0,
        opositores: usersByRole.opositor || 0,
        activeSubscriptions: subs.length,
        monthlyRevenue: subs.reduce((a, s) => a + (Number(s.amount) || 0), 0),
        plansAvailable: plans.filter((p) => p.active).length,
      },
      organizations: orgSummary,
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
    const { name, slug, adminName, adminEmail, adminPassword, branding, contact, billing } = req.body || {};
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
        redsys: { enabled: false, merchantCode: "", terminal: "1", secretKey: "", environment: "sandbox" },
        legal: { privacyUrl: "", termsUrl: "", dataController: "", supportEmail: "" },
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
      passwordHash: hash(adminPassword),
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

  r.get("/plans", (req, res) => {
    res.json({ plans: db.find("subscriptionPlans", (p) => p.scope === "global") });
  });

  r.post("/plans", (req, res) => {
    const { name, target, price, currency, period, trialDays, features, active } = req.body || {};
    if (!name || price == null) return res.status(400).json({ error: "missing_fields" });
    const plan = db.insert("subscriptionPlans", {
      id: db.id("plan"),
      scope: "global",
      organizationId: null,
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
    const updated = db.update(
      "subscriptionPlans",
      (p) => p.id === req.params.id && p.scope === "global",
      req.body || {},
    );
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ plan: updated });
  });

  r.delete("/plans/:id", (req, res) => {
    const updated = db.update(
      "subscriptionPlans",
      (p) => p.id === req.params.id && p.scope === "global",
      { active: false },
    );
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  });

  return r;
};
