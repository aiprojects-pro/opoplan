const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const paymentsService = require("../services/payments");

// ─────────────────────────────────────────────────────────────────────────────
// Checkout y gestión de suscripciones.
//
// Si la academia tiene Stripe configurado, usamos Stripe Checkout real.
// Si no, devolvemos una URL mock que vuelve a la app marcando la suscripción
// como activa (útil para demo sin cuenta Stripe).
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function paymentsRoutes({ env, appUrl }) {
  const r = express.Router();
  r.use(auth.requireAuth);

  function getPayments(orgId) {
    const fallback = paymentsService.fromEnv(env || process.env);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    return paymentsService.fromOrg(org, fallback);
  }

  // ── Listar planes disponibles para el usuario actual ──────────────────────

  r.get("/billing/plans", (req, res) => {
    // Globales + de la academia del usuario
    const orgId = req.user.organizationId;
    const all = db.find("subscriptionPlans", (p) =>
      p.scope === "global" || p.organizationId === orgId
    );
    res.json({ plans: all });
  });

  // ── Suscripción actual del usuario ────────────────────────────────────────

  r.get("/billing/subscription", (req, res) => {
    const sub = db.findOne(
      "subscriptions",
      (s) => s.userId === req.user.id && s.status === "active"
    );
    const plan = sub
      ? db.findOne("subscriptionPlans", (p) => p.id === sub.planId)
      : null;
    res.json({ subscription: sub || null, plan });
  });

  // ── Crear sesión de Checkout ──────────────────────────────────────────────

  r.post("/billing/checkout", async (req, res) => {
    const { planId } = req.body || {};
    const plan = db.findOne("subscriptionPlans", (p) => p.id === planId);
    if (!plan) return res.status(404).json({ error: "plan_not_found" });

    const orgId = req.user.organizationId;
    const payments = getPayments(orgId);

    const successUrl = `${appUrl || ""}/?checkout=success&plan=${plan.id}`;
    const cancelUrl = `${appUrl || ""}/?checkout=cancel`;

    try {
      const session = await payments.createCheckoutSession({
        planId: plan.id,
        userId: req.user.id,
        email: req.user.email,
        priceId: plan.stripePriceId || null,
        successUrl,
        cancelUrl,
        trialDays: plan.trialDays || 0,
      });
      res.json({ url: session.url, mocked: !!session.mocked, provider: payments.provider });
    } catch (e) {
      console.error("[billing:checkout]", e);
      res.status(500).json({ error: "checkout_failed", message: e.message });
    }
  });

  // ── Webhook / confirmación ────────────────────────────────────────────────
  // En modo mock, el frontend nos avisa con `?mock_subscription=1` y llamamos
  // a este endpoint para registrar la suscripción.

  r.post("/billing/confirm", async (req, res) => {
    const { planId, mock } = req.body || {};
    const plan = db.findOne("subscriptionPlans", (p) => p.id === planId);
    if (!plan) return res.status(404).json({ error: "plan_not_found" });

    // Cancelar la suscripción anterior (si la había)
    db.update(
      "subscriptions",
      (s) => s.userId === req.user.id && s.status === "active",
      { status: "cancelled", cancelledAt: new Date().toISOString() }
    );

    const sub = db.insert("subscriptions", {
      id: db.id("sub"),
      organizationId: req.user.organizationId,
      userId: req.user.id,
      planId: plan.id,
      status: "active",
      amount: plan.priceMonthly || plan.amount || 0,
      renewalDate: nextRenewal(),
      provider: mock ? "mock" : "stripe",
      stripeSubscriptionId: req.body?.stripeSubscriptionId || "",
      activatedAt: new Date().toISOString(),
    });

    // Actualizar el plan en el usuario opositor
    if (req.user.role === "opositor") {
      db.update("users", (u) => u.id === req.user.id, { subscriptionPlanId: plan.id });
    }

    res.json({ subscription: sub });
  });

  // ── Cancelar suscripción ──────────────────────────────────────────────────

  r.post("/billing/cancel", async (req, res) => {
    const sub = db.findOne(
      "subscriptions",
      (s) => s.userId === req.user.id && s.status === "active"
    );
    if (!sub) return res.status(404).json({ error: "no_active_subscription" });

    if (sub.provider === "stripe" && sub.stripeSubscriptionId) {
      const payments = getPayments(req.user.organizationId);
      try {
        await payments.cancelSubscription(sub.stripeSubscriptionId);
      } catch (e) {
        console.error("[billing:cancel]", e);
      }
    }
    const updated = db.update(
      "subscriptions",
      (s) => s.id === sub.id,
      { status: "cancelled", cancelledAt: new Date().toISOString() }
    );
    res.json({ subscription: updated });
  });

  return r;

  function nextRenewal() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
};
