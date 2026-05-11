// Stripe Connect — pagos entre academias y de opositores a academias.
//
// Catálogo §A.8 (Marketplace) y §A.10.1 (Seguro de convocatoria) lo requieren.
// Stripe Connect funciona así:
//   1. La academia se "onboardea" como cuenta conectada (Express o Standard).
//      Anthropic NO puede firmar el contrato por ti: el dueño de la academia
//      lo hace en su navegador con el link que generamos.
//   2. Los pagos los procesa Stripe, que retiene una comisión para nosotros
//      (`application_fee_amount`) y deposita el resto en la cuenta de la
//      academia.
//   3. Webhooks notifican `payment_intent.succeeded`, `transfer.created`,
//      `account.updated`, etc. — usamos esos eventos para mover el estado
//      de las compras de "pending_transfer" a "settled".
//
// Dos proveedores:
//   - mock:    sin Stripe, simula respuestas deterministas. Útil para demos
//              y entornos donde no hay claves.
//   - stripe:  provider real con la librería oficial. Requiere `STRIPE_SECRET_KEY`
//              y `STRIPE_CONNECT_CLIENT_ID` en el entorno.

const COMMISSION_PCT = 18; // % de comisión de la plataforma

function makeMock() {
  const accounts = new Map(); // orgId -> mockAccount
  const intents = new Map();  // intentId -> mockIntent
  let counter = 1;

  return {
    provider: "mock",
    commissionPct: COMMISSION_PCT,

    async createConnectAccount({ orgId, orgName, country = "ES" }) {
      const id = `acct_mock_${orgId}_${counter++}`;
      const account = { id, orgId, country, charges_enabled: false, payouts_enabled: false, details_submitted: false };
      accounts.set(orgId, account);
      return account;
    },

    async createOnboardingLink({ accountId, returnUrl, refreshUrl }) {
      // En modo mock, devolvemos un URL ficticio que cuando se "abre" (en tests)
      // marca la cuenta como activa.
      return {
        url: `${returnUrl}?mock_onboarding=${accountId}`,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
    },

    async simulateOnboardingComplete({ accountId }) {
      for (const [orgId, acc] of accounts) {
        if (acc.id === accountId) {
          accounts.set(orgId, { ...acc, charges_enabled: true, payouts_enabled: true, details_submitted: true });
          return accounts.get(orgId);
        }
      }
      return null;
    },

    async getAccount({ orgId }) {
      return accounts.get(orgId) || null;
    },

    // Crear PaymentIntent que cobra al comprador y reparte automáticamente
    async createPaymentIntent({ amount, currency = "EUR", sellerAccountId, applicationFeeAmount, metadata = {} }) {
      const id = `pi_mock_${counter++}`;
      const intent = {
        id, amount, currency,
        application_fee_amount: applicationFeeAmount,
        transfer_data: { destination: sellerAccountId },
        status: "requires_payment_method",
        client_secret: `${id}_secret_mock`,
        metadata,
      };
      intents.set(id, intent);
      return intent;
    },

    async confirmPaymentIntent({ intentId }) {
      const intent = intents.get(intentId);
      if (!intent) throw new Error("not_found");
      intent.status = "succeeded";
      intent.charges = { data: [{ id: `ch_mock_${counter++}`, paid: true }] };
      return intent;
    },

    async getPaymentIntent({ intentId }) {
      return intents.get(intentId) || null;
    },

    // En mock, este método se llama desde el código que simula el webhook
    async handleWebhookEvent(event) {
      return { handled: true, event_type: event.type };
    },
  };
}

function makeStripe(cfg = {}) {
  // Provider real. Cargamos lazy stripe para no exigir la dependencia salvo
  // que el operador active este provider.
  let Stripe;
  try { Stripe = require("stripe"); } catch (_e) {
    throw new Error("stripe_not_installed: ejecuta `npm install stripe` para activar el provider stripe");
  }
  if (!cfg.secretKey) throw new Error("missing_STRIPE_SECRET_KEY");
  const stripe = new Stripe(cfg.secretKey, { apiVersion: "2024-06-20" });

  return {
    provider: "stripe",
    commissionPct: COMMISSION_PCT,

    async createConnectAccount({ orgId, orgName, country = "ES", email }) {
      return stripe.accounts.create({
        type: "express",
        country,
        email,
        business_profile: { name: orgName, mcc: "8299" /* educational services */ },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { orgId },
      });
    },

    async createOnboardingLink({ accountId, returnUrl, refreshUrl }) {
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });
      return { url: link.url, expiresAt: new Date(link.expires_at * 1000).toISOString() };
    },

    async getAccount({ accountId }) {
      return stripe.accounts.retrieve(accountId);
    },

    async createPaymentIntent({ amount, currency = "EUR", sellerAccountId, applicationFeeAmount, metadata = {} }) {
      return stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        application_fee_amount: Math.round(applicationFeeAmount * 100),
        transfer_data: { destination: sellerAccountId },
        metadata,
      });
    },

    async confirmPaymentIntent({ intentId, paymentMethodId }) {
      return stripe.paymentIntents.confirm(intentId, { payment_method: paymentMethodId });
    },

    async getPaymentIntent({ intentId }) {
      return stripe.paymentIntents.retrieve(intentId);
    },

    // Verifica firma del webhook con la SECRET de Stripe y devuelve el evento.
    verifyWebhookSignature({ payload, signature, webhookSecret }) {
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    },
  };
}

function fromEnv(env) {
  if (env && env.STRIPE_CONNECT === "stripe" && env.STRIPE_SECRET_KEY) {
    return makeStripe({
      secretKey: env.STRIPE_SECRET_KEY,
      connectClientId: env.STRIPE_CONNECT_CLIENT_ID,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    });
  }
  return makeMock();
}

module.exports = { fromEnv, makeMock, makeStripe, COMMISSION_PCT };
