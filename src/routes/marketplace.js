const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const { MARKETPLACE_COMMISSION } = require("../lib/constants");
const paymentsConnect = require("../services/paymentsConnect");

// Marketplace B2B de bancos de preguntas (catálogo §A.8).
//
// Cuando el provider de Stripe Connect está activo, la compra crea un
// PaymentIntent real que cobra al comprador y deposita el neto a la academia
// vendedora, descontando la comisión de la plataforma.
// Si el provider es mock o el vendedor no se ha onboardeado, la compra
// queda en `paymentStatus: "pending_transfer"` (igual que antes).

module.exports = function marketplaceRoutes({ env } = {}) {
  const r = express.Router();
  r.use(auth.requireAuth);
  const connect = paymentsConnect.fromEnv(env || process.env);

  function orgOf(req) { return req.user.organizationId; }
  function isAdmin(req) { return ["admin", "superadmin"].includes(req.user.role); }

  // GET /marketplace/packs — listado público para academias logadas.
  r.get("/marketplace/packs", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const { category, oposicion, certified, q } = req.query;
    let packs = db.find("marketplacePacks", (p) => p.active);
    if (category) packs = packs.filter((p) => p.category === category);
    if (oposicion) packs = packs.filter((p) => (p.oposicion || "").toLowerCase().includes(String(oposicion).toLowerCase()));
    if (certified === "true") packs = packs.filter((p) => p.certified);
    if (q) {
      const Q = String(q).toLowerCase();
      packs = packs.filter((p) => (p.title + " " + p.description).toLowerCase().includes(Q));
    }
    // Las academias compradoras ven todos menos los suyos propios
    packs = packs.filter((p) => p.sellerOrgId !== orgOf(req));
    packs.sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));
    res.json({ packs });
  });

  // GET /marketplace/my-listings — packs que vende mi academia.
  r.get("/marketplace/my-listings", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const packs = db.find("marketplacePacks", (p) => p.sellerOrgId === orgOf(req));
    const sales = db.find("marketplacePurchases", (p) => p.sellerOrgId === orgOf(req));
    const totalGross = sales.reduce((s, p) => s + (p.amount || 0), 0);
    const totalNet = sales.reduce((s, p) => s + (p.netToSeller || 0), 0);
    res.json({ packs, salesCount: sales.length, totalGross, totalNet });
  });

  // GET /marketplace/my-purchases — packs que mi academia ha comprado.
  r.get("/marketplace/my-purchases", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const purchases = db.find("marketplacePurchases", (p) => p.buyerOrgId === orgOf(req));
    const expanded = purchases.map((p) => {
      const pack = db.findOne("marketplacePacks", (x) => x.id === p.packId);
      return { ...p, pack };
    });
    res.json({ purchases: expanded });
  });

  // POST /marketplace/listings — la academia vende un pack propio
  r.post("/marketplace/listings", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const org = db.findOne("organizations", (o) => o.id === orgOf(req));
    const b = req.body || {};
    if (!b.title || !b.priceLicense) return res.status(400).json({ error: "missing_fields" });
    const pack = db.insert("marketplacePacks", {
      id: db.id("mkt"),
      sellerOrgId: orgOf(req),
      sellerName: org?.name || "",
      category: b.category || "test_bank",
      title: b.title,
      description: b.description || "",
      oposicion: b.oposicion || "",
      scope: b.scope || "",
      questionsCount: Number(b.questionsCount) || 0,
      topicsCovered: Number(b.topicsCovered) || 0,
      coveragePct: Number(b.coveragePct) || 0,
      avgAccuracyPct: Number(b.avgAccuracyPct) || 0,
      lastUpdatedAt: new Date().toISOString().slice(0, 10),
      certified: false,
      priceLicense: Number(b.priceLicense),
      priceOneOff: Number(b.priceOneOff) || 0,
      currency: b.currency || "EUR",
      ratingAvg: 0,
      ratingCount: 0,
      questionIds: Array.isArray(b.questionIds) ? b.questionIds : [],
      active: true,
      createdAt: new Date().toISOString(),
    });
    res.json({ pack });
  });

  // PATCH/DELETE de packs propios
  r.patch("/marketplace/listings/:id", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const p = db.findOne("marketplacePacks", (x) => x.id === req.params.id && x.sellerOrgId === orgOf(req));
    if (!p) return res.status(404).json({ error: "not_found" });
    const allowed = ["title", "description", "category", "priceLicense", "priceOneOff", "active", "oposicion", "scope"];
    const patch = {};
    for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
    const u = db.update("marketplacePacks", (x) => x.id === p.id, patch);
    res.json({ pack: u });
  });

  r.delete("/marketplace/listings/:id", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const p = db.findOne("marketplacePacks", (x) => x.id === req.params.id && x.sellerOrgId === orgOf(req));
    if (!p) return res.status(404).json({ error: "not_found" });
    db.update("marketplacePacks", (x) => x.id === p.id, { active: false });
    res.json({ ok: true });
  });

  // POST /marketplace/buy/:id — compra de un pack.
  // Si el vendedor tiene Stripe Connect onboardeado, creamos un PaymentIntent
  // real que cobrará al comprador y repartirá automáticamente. En caso
  // contrario, marcamos paymentStatus="pending_transfer" para resolución manual.
  r.post("/marketplace/buy/:id", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const pack = db.findOne("marketplacePacks", (p) => p.id === req.params.id && p.active);
    if (!pack) return res.status(404).json({ error: "not_found" });
    if (pack.sellerOrgId === orgOf(req)) return res.status(400).json({ error: "cannot_buy_own_pack" });
    const licenseType = req.body?.licenseType === "oneOff" ? "oneOff" : "license";
    const amount = licenseType === "oneOff" ? pack.priceOneOff : pack.priceLicense;
    if (!amount) return res.status(400).json({ error: "price_unavailable_for_type" });
    const platformFee = +(amount * MARKETPLACE_COMMISSION).toFixed(2);
    const netToSeller = +(amount - platformFee).toFixed(2);
    const expiresAt = licenseType === "license"
      ? new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
      : null;

    // Verificamos si el vendedor está onboardeado
    const sellerOrg = db.findOne("organizations", (o) => o.id === pack.sellerOrgId);
    const sellerAccountId = sellerOrg?.payments?.connectAccountId;
    const sellerActive = sellerOrg?.payments?.connectStatus === "active";

    let paymentStatus = "pending_transfer";
    let paymentIntentId = null;
    let clientSecret = null;
    if (sellerAccountId && sellerActive) {
      try {
        const intent = await connect.createPaymentIntent({
          amount,
          currency: pack.currency || "EUR",
          sellerAccountId,
          applicationFeeAmount: platformFee,
          metadata: { purchaseType: "marketplace_pack", packId: pack.id, buyerOrgId: orgOf(req) },
        });
        paymentIntentId = intent.id;
        clientSecret = intent.client_secret;
        paymentStatus = "pending_payment";
      } catch (e) {
        console.error("[marketplace:buy:intent]", e);
        // Caemos al modo pending_transfer manual
      }
    }

    const purchase = db.insert("marketplacePurchases", {
      id: db.id("pur"),
      packId: pack.id,
      buyerOrgId: orgOf(req),
      sellerOrgId: pack.sellerOrgId,
      licenseType,
      amount,
      platformFee,
      netToSeller,
      currency: pack.currency || "EUR",
      paymentStatus,
      paymentIntentId,
      clientSecret,
      expiresAt,
      purchasedAt: new Date().toISOString(),
    });

    // Si tenemos PaymentIntent, añadimos el ID en metadata para que el
    // webhook pueda actualizar al recibir payment_intent.succeeded
    if (paymentIntentId) {
      // En modo mock, simulamos confirmación inmediata (el comprador "paga")
      if (connect.provider === "mock") {
        try {
          await connect.confirmPaymentIntent({ intentId: paymentIntentId });
          db.update("marketplacePurchases", (p) => p.id === purchase.id, {
            paymentStatus: "settled",
            settledAt: new Date().toISOString(),
          });
          purchase.paymentStatus = "settled";
        } catch (e) { /* keep pending */ }
      }
    }

    // Copiar preguntas del pack a la academia compradora (si están en el pack)
    let copied = 0;
    for (const qid of (pack.questionIds || [])) {
      const q = db.findOne("questionBank", (x) => x.id === qid);
      if (!q) continue;
      db.insert("questionBank", {
        ...q,
        id: db.id("qb"),
        organizationId: orgOf(req),
        sourcePackId: pack.id,
        active: true,
      });
      copied += 1;
    }
    res.json({ purchase, copiedQuestions: copied, clientSecret });
  });

  return r;
};
