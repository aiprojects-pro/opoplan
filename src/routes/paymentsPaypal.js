const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const paypal = require("../services/paymentsPaypal");

// PayPal — pagos directos del opositor a su preparador particular.
//
// Flujo "link_only" (cuenta personal con PayPal.Me):
//   1. Preparador configura su `paypalMe` en /preparador/me/paypal
//   2. Preparador crea factura para un opositor: POST /paypal/invoices
//   3. Opositor ve la factura en su panel: GET /paypal/invoices/mine
//   4. Opositor pulsa "Pagar" → redirige a paypal.me/handle/AMOUNT/EUR
//   5. Cuando el preparador ve el dinero, marca la factura como cobrada:
//      POST /paypal/invoices/:id/mark-paid
//
// Flujo "business_api" (PayPal Business con REST API):
//   1. Preparador configura clientId/clientSecret en /preparador/me/paypal
//   2. Preparador crea factura: POST /paypal/invoices
//      (el sistema crea internamente una Order de PayPal)
//   3. Opositor pulsa "Pagar" → redirige al checkout de PayPal
//   4. Tras pagar, PayPal redirige a /paypal/return?invoiceId=... y captura
//   5. Webhook firmado de PayPal confirma → factura pasa a "paid"
//
// Flujo "manual": el preparador crea la factura y la marca cobrada cuando
// recibe el pago por bizum / transferencia / efectivo.

module.exports = function paypalRoutes({ env, appUrl } = {}) {
  const r = express.Router();

  function isPrep(req) { return req.user?.role === "preparador" || req.user?.role === "admin"; }
  function isOpo(req) { return req.user?.role === "opositor"; }

  // Resolver provider para un preparador concreto a partir de su config
  function providerFor(preparador) {
    const cfg = preparador?.paypal || {};
    return paypal.fromConfig({
      mode: cfg.mode || "link_only",
      paypalMeHandle: cfg.paypalMeHandle,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      sandbox: cfg.sandbox !== false,
    });
  }

  // ── Configuración del preparador ──────────────────────────────────────────

  r.get("/preparador/me/paypal", auth.requireAuth, (req, res) => {
    if (!isPrep(req)) return res.status(403).json({ error: "forbidden" });
    const cfg = req.user.paypal || {};
    // Nunca devolvemos clientSecret al cliente
    res.json({
      mode: cfg.mode || "link_only",
      paypalMeHandle: cfg.paypalMeHandle || "",
      clientId: cfg.clientId || "",
      hasClientSecret: !!cfg.clientSecret,
      sandbox: cfg.sandbox !== false,
      defaultCurrency: cfg.defaultCurrency || "EUR",
    });
  });

  r.patch("/preparador/me/paypal", auth.requireAuth, (req, res) => {
    if (!isPrep(req)) return res.status(403).json({ error: "forbidden" });
    const b = req.body || {};
    const allowedModes = ["link_only", "business_api", "manual"];
    const mode = allowedModes.includes(b.mode) ? b.mode : "link_only";
    if (mode === "link_only" && !b.paypalMeHandle) {
      return res.status(400).json({ error: "missing_paypal_me_handle" });
    }
    if (mode === "business_api" && (!b.clientId || (!b.clientSecret && !req.user.paypal?.clientSecret))) {
      return res.status(400).json({ error: "missing_business_credentials" });
    }
    const next = {
      mode,
      paypalMeHandle: b.paypalMeHandle || "",
      clientId: b.clientId || "",
      // Si llega clientSecret nuevo lo guardamos; si no, mantenemos el anterior
      clientSecret: b.clientSecret || req.user.paypal?.clientSecret || "",
      sandbox: b.sandbox !== false,
      defaultCurrency: b.defaultCurrency || "EUR",
      webhookId: b.webhookId || req.user.paypal?.webhookId || "",
    };
    db.update("users", (u) => u.id === req.user.id, { paypal: next });
    res.json({ ok: true, mode: next.mode });
  });

  // ── Facturas ──────────────────────────────────────────────────────────────

  // El preparador crea una factura para un opositor concreto.
  r.post("/paypal/invoices", auth.requireAuth, async (req, res) => {
    if (!isPrep(req)) return res.status(403).json({ error: "forbidden" });
    const { opositorId, amount, currency = "EUR", concept, dueDate } = req.body || {};
    if (!opositorId || !amount || !concept) return res.status(400).json({ error: "missing_fields" });
    const opo = db.findOne("users", (u) => u.id === opositorId && u.role === "opositor");
    if (!opo) return res.status(404).json({ error: "opositor_not_found" });
    // Verificar que el preparador tiene asignación con este opositor
    if (req.user.role === "preparador") {
      const a = db.findOne("assignments", (x) => x.opositorId === opositorId && x.preparadorId === req.user.id && x.active);
      if (!a) return res.status(403).json({ error: "not_assigned_to_opositor" });
    }

    const cfg = req.user.paypal || {};
    const provider = providerFor(req.user);
    const id = paypal.generateInvoiceId();
    const reference = paypal.buildReference(id);

    let paymentUrl = null;
    let paypalOrderId = null;

    if (provider.provider === "link_only") {
      try {
        paymentUrl = provider.buildPaymentUrl({
          paypalMeHandle: cfg.paypalMeHandle, amount, currency,
        });
      } catch (e) {
        return res.status(400).json({ error: "invalid_paypal_me", message: e.message });
      }
    } else if (provider.provider === "business_api") {
      try {
        const order = await provider.createOrder({
          amount, currency, reference,
          returnUrl: `${appUrl || env?.APP_URL || ""}/?paypal_return=${id}`,
          cancelUrl: `${appUrl || env?.APP_URL || ""}/?paypal_cancel=${id}`,
        });
        paypalOrderId = order.id;
        paymentUrl = (order.links || []).find((l) => l.rel === "approve")?.href;
      } catch (e) {
        return res.status(500).json({ error: "paypal_order_failed", message: e.message });
      }
    }
    // mode === "manual" → no payment URL, solo seguimiento

    const invoice = db.insert("paypalInvoices", {
      id,
      reference,
      preparadorId: req.user.id,
      opositorId,
      amount: Number(amount),
      currency,
      concept,
      dueDate: dueDate || null,
      mode: provider.provider,
      paypalMeHandle: cfg.paypalMeHandle || null,
      paypalOrderId,
      paymentUrl,
      status: "pending", // pending | paid | cancelled
      paidAt: null,
      paidVia: null,
      createdAt: new Date().toISOString(),
    });
    res.json({ invoice });
  });

  // El preparador ve sus facturas emitidas
  r.get("/paypal/invoices/issued", auth.requireAuth, (req, res) => {
    if (!isPrep(req)) return res.status(403).json({ error: "forbidden" });
    const list = db.find("paypalInvoices", (x) => x.preparadorId === req.user.id);
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    // Expandir nombre del opositor
    const expanded = list.map((inv) => {
      const opo = db.findOne("users", (u) => u.id === inv.opositorId);
      return { ...inv, opositorName: opo?.name || "?" };
    });
    res.json({ invoices: expanded });
  });

  // El opositor ve sus facturas pendientes
  r.get("/paypal/invoices/mine", auth.requireAuth, (req, res) => {
    if (!isOpo(req)) return res.status(403).json({ error: "forbidden" });
    const list = db.find("paypalInvoices", (x) => x.opositorId === req.user.id);
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const expanded = list.map((inv) => {
      const prep = db.findOne("users", (u) => u.id === inv.preparadorId);
      return { ...inv, preparadorName: prep?.name || "?" };
    });
    res.json({ invoices: expanded });
  });

  // El preparador marca una factura como cobrada (modo link_only / manual)
  r.post("/paypal/invoices/:id/mark-paid", auth.requireAuth, (req, res) => {
    if (!isPrep(req)) return res.status(403).json({ error: "forbidden" });
    const inv = db.findOne("paypalInvoices", (x) => x.id === req.params.id);
    if (!inv) return res.status(404).json({ error: "not_found" });
    if (inv.preparadorId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }
    if (inv.status === "paid") return res.json({ invoice: inv, alreadyPaid: true });
    const updated = db.update("paypalInvoices", (x) => x.id === inv.id, {
      status: "paid",
      paidAt: new Date().toISOString(),
      paidVia: req.body?.via || "manual_confirmation",
      notes: req.body?.notes || "",
    });
    res.json({ invoice: updated });
  });

  // El preparador cancela una factura no cobrada
  r.post("/paypal/invoices/:id/cancel", auth.requireAuth, (req, res) => {
    if (!isPrep(req)) return res.status(403).json({ error: "forbidden" });
    const inv = db.findOne("paypalInvoices", (x) => x.id === req.params.id);
    if (!inv) return res.status(404).json({ error: "not_found" });
    if (inv.preparadorId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }
    if (inv.status === "paid") return res.status(409).json({ error: "already_paid" });
    res.json({
      invoice: db.update("paypalInvoices", (x) => x.id === inv.id, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      }),
    });
  });

  // Captura del pago tras vuelta de PayPal Business (modo business_api)
  r.get("/paypal/return", async (req, res) => {
    const invoiceId = req.query.invoiceId;
    if (!invoiceId) return res.status(400).json({ error: "missing_invoice" });
    const inv = db.findOne("paypalInvoices", (x) => x.id === invoiceId);
    if (!inv) return res.status(404).json({ error: "not_found" });
    if (inv.mode !== "business_api") return res.status(400).json({ error: "not_business_mode" });
    const prep = db.findOne("users", (u) => u.id === inv.preparadorId);
    const provider = providerFor(prep);
    try {
      const captured = await provider.captureOrder({ orderId: inv.paypalOrderId });
      const status = captured.status === "COMPLETED" ? "paid" : "pending";
      const updated = db.update("paypalInvoices", (x) => x.id === inv.id, {
        status,
        paidAt: status === "paid" ? new Date().toISOString() : null,
        paidVia: "paypal_business_api",
        capturedAt: new Date().toISOString(),
      });
      res.json({ invoice: updated, capture: captured });
    } catch (e) {
      console.error("[paypal:return]", e);
      res.status(500).json({ error: "capture_failed", message: e.message });
    }
  });

  // Webhook PayPal Business — firma verificada con el WEBHOOK_ID
  r.post("/paypal/webhook/:preparadorId", express.json(), async (req, res) => {
    const prep = db.findOne("users", (u) => u.id === req.params.preparadorId);
    if (!prep) return res.status(404).json({ error: "preparador_not_found" });
    if (prep.paypal?.mode !== "business_api") return res.status(400).json({ error: "not_business_mode" });
    const provider = providerFor(prep);
    const verified = await provider.verifyWebhookSignature({
      webhookId: prep.paypal.webhookId,
      headers: req.headers,
      body: req.body,
    });
    if (!verified) return res.status(401).json({ error: "invalid_signature" });
    const ev = req.body;
    if (ev.event_type === "PAYMENT.CAPTURE.COMPLETED" || ev.event_type === "CHECKOUT.ORDER.APPROVED") {
      const ref = ev.resource?.purchase_units?.[0]?.reference_id || ev.resource?.invoice_id;
      if (ref) {
        const inv = db.findOne("paypalInvoices", (x) => x.reference === ref);
        if (inv && inv.status !== "paid") {
          db.update("paypalInvoices", (x) => x.id === inv.id, {
            status: "paid",
            paidAt: new Date().toISOString(),
            paidVia: "paypal_webhook",
          });
        }
      }
    }
    res.json({ received: true });
  });

  return r;
};
