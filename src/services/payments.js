// ─────────────────────────────────────────────────────────────────────────────
// Servicio de pagos. Stripe en modo test/sandbox por defecto. Si no hay claves,
// devuelve un stub que registra la suscripción internamente y simula el
// webhook (útil para desarrollo sin cuenta Stripe).
// ─────────────────────────────────────────────────────────────────────────────

function makeMock() {
  return {
    provider: "mock",
    async createCheckoutSession({ planId, userId, email, successUrl, cancelUrl }) {
      // Devuelve una URL falsa que vuelve a la app marcando la suscripción
      // como activa. Útil mientras no haya cuenta Stripe.
      const u = new URL(successUrl);
      u.searchParams.set("mock_subscription", "1");
      u.searchParams.set("plan", planId);
      u.searchParams.set("user", userId);
      return { url: u.toString(), mocked: true };
    },
    async cancelSubscription(/* stripeSubscriptionId */) {
      return { canceled: true, mocked: true };
    },
    verifyWebhook(/* rawBody, signature */) {
      return { type: "mock", data: {} };
    },
  };
}

function makeStripe({ secretKey, webhookSecret }) {
  const Stripe = require("stripe");
  const stripe = new Stripe(secretKey);
  return {
    provider: "stripe",
    async createCheckoutSession({ planId, userId, email, priceId, successUrl, cancelUrl, trialDays }) {
      if (!priceId) {
        // Si todavía no hay priceId real, redirigimos a éxito como mock.
        return makeMock().createCheckoutSession({ planId, userId, email, successUrl, cancelUrl });
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: trialDays ? { trial_period_days: trialDays } : undefined,
        metadata: { userId, planId },
      });
      return { url: session.url, id: session.id };
    },
    async cancelSubscription(stripeSubscriptionId) {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
      return { canceled: true };
    },
    verifyWebhook(rawBody, signature) {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    },
  };
}

function fromEnv(env) {
  if (env.STRIPE_SECRET_KEY) {
    return makeStripe({ secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET });
  }
  return makeMock();
}

function fromOrg(org, fallback) {
  const cfg = org && org.integrations && org.integrations.stripe;
  if (!cfg || !cfg.enabled || !cfg.secretKey) return fallback;
  return makeStripe({ secretKey: cfg.secretKey, webhookSecret: cfg.webhookSecret });
}

module.exports = { fromEnv, fromOrg, makeMock, makeStripe };
