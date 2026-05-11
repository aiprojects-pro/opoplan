const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const paymentsConnect = require("../services/paymentsConnect");

// Endpoints de Stripe Connect.
//
// El admin de la academia hace onboarding para empezar a recibir pagos.
// Después, cualquier compra de marketplace o suscripción a póliza de seguro
// que pase por aquí se cobra de verdad y reparte automáticamente.

module.exports = function paymentsConnectRoutes({ env, appUrl }) {
  const r = express.Router();
  const provider = paymentsConnect.fromEnv(env || process.env);
  const url = appUrl || (env && env.APP_URL) || "http://localhost:3000";

  function orgOf(req) { return req.user?.organizationId; }
  function isAdmin(req) { return req.user && ["admin", "superadmin"].includes(req.user.role); }

  // Onboarding: crea cuenta conectada (si no existe) y devuelve URL para completar.
  r.post("/payments-connect/onboarding", auth.requireAuth, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const org = db.findOne("organizations", (o) => o.id === orgOf(req));
    if (!org) return res.status(404).json({ error: "org_not_found" });
    let accountId = org.payments?.connectAccountId;
    try {
      if (!accountId) {
        const acc = await provider.createConnectAccount({
          orgId: org.id, orgName: org.name, country: "ES",
          email: org.contact?.email,
        });
        accountId = acc.id;
        db.update("organizations", (o) => o.id === org.id, {
          payments: { ...(org.payments || {}), connectAccountId: accountId, connectStatus: "pending" },
        });
      }
      const link = await provider.createOnboardingLink({
        accountId,
        returnUrl: `${url}/?onboarding=ok`,
        refreshUrl: `${url}/?onboarding=refresh`,
      });
      res.json({ accountId, url: link.url, expiresAt: link.expiresAt, provider: provider.provider });
    } catch (e) {
      console.error("[connect:onboarding]", e);
      res.status(500).json({ error: "onboarding_failed", message: e.message });
    }
  });

  // Estado de la cuenta conectada (para mostrar en UI)
  r.get("/payments-connect/status", auth.requireAuth, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const org = db.findOne("organizations", (o) => o.id === orgOf(req));
    const accountId = org?.payments?.connectAccountId;
    if (!accountId) return res.json({ connected: false, provider: provider.provider });
    try {
      let account;
      if (provider.provider === "mock") {
        account = await provider.getAccount({ orgId: org.id });
      } else {
        account = await provider.getAccount({ accountId });
      }
      res.json({
        connected: true,
        accountId,
        chargesEnabled: !!account?.charges_enabled,
        payoutsEnabled: !!account?.payouts_enabled,
        detailsSubmitted: !!account?.details_submitted,
        provider: provider.provider,
      });
    } catch (e) {
      res.status(500).json({ error: "status_failed", message: e.message });
    }
  });

  // En modo mock: simular que la academia completó el onboarding (para demos)
  r.post("/payments-connect/simulate-complete", auth.requireAuth, async (req, res) => {
    if (provider.provider !== "mock") return res.status(400).json({ error: "only_mock" });
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const org = db.findOne("organizations", (o) => o.id === orgOf(req));
    const accountId = org?.payments?.connectAccountId;
    if (!accountId) return res.status(400).json({ error: "not_started" });
    await provider.simulateOnboardingComplete({ accountId });
    db.update("organizations", (o) => o.id === org.id, {
      payments: { ...(org.payments || {}), connectStatus: "active" },
    });
    res.json({ ok: true });
  });

  // Webhook de Stripe — solo activo en provider real
  r.post("/payments-connect/webhook", express.raw({ type: "application/json" }), (req, res) => {
    if (provider.provider !== "stripe") return res.status(404).end();
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = provider.verifyWebhookSignature({
        payload: req.body, signature: sig,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      });
    } catch (e) {
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }
    handleStripeEvent(event).catch((e) => console.error("[webhook:handle]", e));
    res.json({ received: true });
  });

  return r;
};

// Procesa eventos relevantes y mueve estados internos.
async function handleStripeEvent(event) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      const purchaseId = pi.metadata?.purchaseId;
      const enrollmentId = pi.metadata?.enrollmentId;
      if (purchaseId) {
        const db = require("../lib/db");
        db.update("marketplacePurchases", (p) => p.id === purchaseId, {
          paymentStatus: "settled",
          settledAt: new Date().toISOString(),
        });
      } else if (enrollmentId) {
        const db = require("../lib/db");
        db.update("insuranceEnrollments", (e) => e.id === enrollmentId, {
          premiumStatus: "paid",
          paidAt: new Date().toISOString(),
        });
      }
      break;
    }
    case "account.updated": {
      const acc = event.data.object;
      const orgId = acc.metadata?.orgId;
      if (orgId) {
        const db = require("../lib/db");
        const org = db.findOne("organizations", (o) => o.id === orgId);
        if (org) {
          db.update("organizations", (o) => o.id === orgId, {
            payments: {
              ...(org.payments || {}),
              connectStatus: acc.charges_enabled ? "active" : "pending",
            },
          });
        }
      }
      break;
    }
    default:
      // Otros eventos: no hacemos nada
  }
}
