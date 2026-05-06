const express = require("express");
const crypto = require("crypto");
const db = require("../lib/db");
const auth = require("../middleware/auth");

function hash(password) {
  return crypto.createHash("sha256").update(`opoplan:${password}`).digest("hex");
}

module.exports = function authRoutes({ sessionSecret }) {
  const r = express.Router();

  // Información pública sobre una academia (por slug) — para personalizar
  // el login con el branding correcto.
  r.get("/org-by-slug/:slug", (req, res) => {
    const org = db.findOne("organizations", (o) => o.slug === req.params.slug && o.status === "active");
    if (!org) return res.status(404).json({ error: "not_found" });
    res.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      branding: org.branding,
    });
  });

  // Lista pública de academias activas (para el selector del login)
  r.get("/orgs", (req, res) => {
    const orgs = db.find("organizations", (o) => o.status === "active").map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      branding: { initials: o.branding?.initials, primaryColor: o.branding?.primaryColor },
    }));
    res.json({ orgs });
  });

  // Login
  r.post("/login", (req, res) => {
    const { email, password, role, orgSlug } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing_fields" });

    const user = db.findOne(
      "users",
      (u) =>
        u.email.toLowerCase() === String(email).toLowerCase() &&
        u.passwordHash === hash(password),
    );
    if (!user) return res.status(401).json({ error: "invalid_credentials" });
    if (user.status !== "active") return res.status(403).json({ error: "user_inactive" });

    // Si el usuario indicó un rol concreto, comprobamos que coincide
    if (role && user.role !== role) return res.status(403).json({ error: "wrong_role" });

    // Si pidió una academia concreta y el usuario es de otra, rechazo
    if (orgSlug && user.organizationId) {
      const org = db.findOne("organizations", (o) => o.id === user.organizationId);
      if (!org || org.slug !== orgSlug) return res.status(403).json({ error: "wrong_org" });
    }

    auth.setSession(res, sessionSecret, user.id);

    const org = user.organizationId
      ? db.findOne("organizations", (o) => o.id === user.organizationId)
      : null;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        photo: user.photo || "",
        organizationId: user.organizationId,
      },
      organization: org
        ? { id: org.id, name: org.name, slug: org.slug, branding: org.branding }
        : null,
    });
  });

  // Logout
  r.post("/logout", (req, res) => {
    auth.clearSession(res);
    res.json({ ok: true });
  });

  // Estado de la sesión actual
  r.get("/me", (req, res) => {
    if (!req.user) return res.json({ user: null });
    const org = req.org;
    res.json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        photo: req.user.photo || "",
        organizationId: req.user.organizationId,
        commitment: req.user.commitment || null,
      },
      organization: org
        ? {
            id: org.id,
            name: org.name,
            slug: org.slug,
            branding: org.branding,
            contact: org.contact,
            billing: org.billing,
          }
        : null,
    });
  });

  // Registro público de opositor (sigue existiendo pero ahora exige slug)
  r.post("/register-opositor", (req, res) => {
    const { name, email, password, phone, orgSlug } = req.body || {};
    if (!name || !email || !password || !orgSlug) return res.status(400).json({ error: "missing_fields" });
    const org = db.findOne("organizations", (o) => o.slug === orgSlug && o.status === "active");
    if (!org) return res.status(404).json({ error: "org_not_found" });
    const exists = db.findOne("users", (u) => u.email.toLowerCase() === String(email).toLowerCase());
    if (exists) return res.status(409).json({ error: "email_in_use" });
    const newUser = db.insert("users", {
      id: db.id("u"),
      organizationId: org.id,
      role: "opositor",
      name,
      email,
      phone: phone || "",
      photo: "",
      passwordHash: hash(password),
      status: "active",
      subscriptionPlanId: "plan_free",
      commitment: { examName: "", examDate: "", weeklyHours: 0, dailyHours: 0, activeDays: [], restDays: [], vacationRanges: [] },
    });
    auth.setSession(res, sessionSecret, newUser.id);
    res.json({ user: { id: newUser.id, name, email, role: "opositor", organizationId: org.id } });
  });

  return r;
};
