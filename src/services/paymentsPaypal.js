// PayPal para preparadores particulares (catálogo §preparador autónomo).
//
// Tres modos según lo que el preparador tenga:
//
//   1. "link_only" — PayPal personal con PayPal.Me link. El preparador
//      configura su URL de paypal.me/usuario y el sistema:
//        - Genera la pre-factura con cantidad y concepto
//        - Construye el link de pago: paypal.me/usuario/AMOUNT/CURRENCY
//        - El opositor pulsa "Pagar" y va a PayPal
//        - PayPal NO notifica de vuelta (PayPal no permite IPN/webhooks
//          para PayPal.Me en cuenta personal)
//        - El preparador, cuando ve el dinero en su PayPal, marca la
//          factura como "cobrada" desde su panel
//      Ventaja: cero coste, cero burocracia, funciona con cuenta personal.
//      Desventaja: confirmación manual.
//
//   2. "business_api" — PayPal Business con REST API + webhooks.
//      Cobro automático, confirmación por webhook firmado.
//      Requiere: cuenta PayPal Business (gratis) + credenciales OAuth.
//      Ventaja: automatización completa.
//      Desventaja: más burocracia inicial (Business + claves API).
//
//   3. "manual" — Cobro fuera del sistema (transferencia, Bizum, efectivo)
//      donde el preparador simplemente registra que cobró tal cantidad
//      tal día. Útil para preparadores que ya tienen su flujo y solo
//      quieren que OpoPlan refleje el estado.
//
// Lo que NO se puede hacer técnicamente (y lo decimos claro):
//   - Cobrar automáticamente con cuenta PayPal personal estricta. PayPal
//     no expone IPN/webhooks ni REST API para esa categoría de cuenta.
//   - Si el preparador insiste en "PayPal personal", la única vía honesta
//     es link_only con confirmación manual.

const crypto = require("node:crypto");

function makeLinkOnly() {
  return {
    provider: "link_only",
    requiresWebhook: false,
    requiresApiKeys: false,

    // Genera el URL de PayPal.Me con cantidad y referencia
    buildPaymentUrl({ paypalMeHandle, amount, currency = "EUR", reference }) {
      // PayPal.Me acepta /amount/currency. La referencia no se transmite
      // por URL (limitación de PayPal.Me), así que la incluimos en la
      // descripción de la factura interna y pedimos al opositor que la
      // ponga en "Nota" al pagar.
      const handle = String(paypalMeHandle || "").replace(/^https?:\/\/(www\.)?paypal\.me\//i, "").replace(/^\/+/, "");
      if (!handle) throw new Error("invalid_paypal_me_handle");
      const amt = Number(amount).toFixed(2);
      return `https://www.paypal.me/${encodeURIComponent(handle)}/${amt}${currency ? "/" + currency : ""}`;
    },
  };
}

function makeBusinessApi(cfg = {}) {
  // Provider real con PayPal REST API. Sandbox: api-m.sandbox.paypal.com
  // Live: api-m.paypal.com
  if (!cfg.clientId || !cfg.clientSecret) throw new Error("missing_paypal_business_credentials");
  const baseUrl = cfg.sandbox === false
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

  let cachedToken = null;
  let tokenExpiresAt = 0;

  async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
    const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`paypal_oauth_${res.status}`);
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return cachedToken;
  }

  return {
    provider: "business_api",
    requiresWebhook: true,
    requiresApiKeys: true,

    async createOrder({ amount, currency = "EUR", reference, returnUrl, cancelUrl }) {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: reference,
            amount: { currency_code: currency, value: Number(amount).toFixed(2) },
          }],
          application_context: {
            return_url: returnUrl,
            cancel_url: cancelUrl,
            user_action: "PAY_NOW",
          },
        }),
      });
      if (!res.ok) throw new Error(`paypal_order_${res.status}`);
      return res.json();
    },

    async captureOrder({ orderId }) {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`paypal_capture_${res.status}`);
      return res.json();
    },

    async getOrder({ orderId }) {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`paypal_get_order_${res.status}`);
      return res.json();
    },

    // Verifica firma del webhook con la WEBHOOK_ID y los headers de PayPal.
    async verifyWebhookSignature({ webhookId, headers, body }) {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_algo: headers["paypal-auth-algo"],
          cert_url: headers["paypal-cert-url"],
          transmission_id: headers["paypal-transmission-id"],
          transmission_sig: headers["paypal-transmission-sig"],
          transmission_time: headers["paypal-transmission-time"],
          webhook_id: webhookId,
          webhook_event: body,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.verification_status === "SUCCESS";
    },
  };
}

function fromConfig({ mode, paypalMeHandle, clientId, clientSecret, sandbox } = {}) {
  if (mode === "business_api" && clientId && clientSecret) {
    return makeBusinessApi({ clientId, clientSecret, sandbox });
  }
  if (mode === "manual") {
    return { provider: "manual", requiresWebhook: false, requiresApiKeys: false };
  }
  // Default: link_only (válido para cuenta personal con PayPal.Me)
  return makeLinkOnly();
}

// Genera referencia única para conciliar pagos: "OPOPLAN-INV-<id>"
function buildReference(invoiceId) {
  return `OPOPLAN-INV-${invoiceId}`;
}

// Genera invoiceId interno
function generateInvoiceId() {
  return `inv_${crypto.randomBytes(4).toString("hex")}`;
}

module.exports = {
  fromConfig,
  makeLinkOnly,
  makeBusinessApi,
  buildReference,
  generateInvoiceId,
};
