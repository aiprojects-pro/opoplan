const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");

// Web Push (catálogo §B.4 — sustituto honesto de smartwatch).
//
// Generamos VAPID keys una vez por arranque y las cacheamos en memoria.
// En producción, conviene cargarlas de env vars (VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY) para que sobrevivan reinicios — si cambiamos la
// privada se invalidan TODAS las suscripciones existentes.

let webpush = null;
let vapidKeys = null;

function getWebpush(env) {
  if (webpush) return webpush;
  try {
    webpush = require("web-push");
  } catch (_e) {
    return null; // no instalada
  }
  const isProd = (env?.NODE_ENV || process.env.NODE_ENV) === "production";
  if (env?.VAPID_PUBLIC_KEY && env?.VAPID_PRIVATE_KEY) {
    vapidKeys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  } else if (isProd) {
    // En producción, sin VAPID keys persistentes, regenerar invalidaría
    // todas las suscripciones existentes en cada reinicio. Mejor parar.
    console.error("[FATAL] NODE_ENV=production sin VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.");
    console.error("        Genera un par con: `npm run gen-vapid` y guárdalo en .env");
    process.exit(1);
  } else {
    // Persistimos en data/.vapid.json para que sobreviva al reinicio en dev
    // y los devs no pierdan sus suscripciones.
    const fs = require("node:fs");
    const path = require("node:path");
    const vapidFile = path.join(__dirname, "..", "..", "data", ".vapid.json");
    try {
      if (fs.existsSync(vapidFile)) {
        vapidKeys = JSON.parse(fs.readFileSync(vapidFile, "utf8"));
        console.log("[webpush] VAPID keys cargadas de data/.vapid.json");
      } else {
        vapidKeys = webpush.generateVAPIDKeys();
        fs.mkdirSync(path.dirname(vapidFile), { recursive: true });
        fs.writeFileSync(vapidFile, JSON.stringify(vapidKeys, null, 2));
        console.warn("[webpush] Generadas VAPID keys nuevas en data/.vapid.json");
        console.warn("          Para producción: ejecuta `npm run gen-vapid` y guárdalas en .env");
      }
    } catch (e) {
      console.warn("[webpush] No se pudo persistir VAPID keys (" + e.message + "), usando efímeras");
      vapidKeys = webpush.generateVAPIDKeys();
    }
  }
  webpush.setVapidDetails(
    env?.VAPID_SUBJECT || "mailto:admin@opoplan.local",
    vapidKeys.publicKey,
    vapidKeys.privateKey,
  );
  return webpush;
}

module.exports = function webpushRoutes({ env } = {}) {
  const r = express.Router();
  const wp = getWebpush(env || process.env);

  // Clave pública para que el cliente registre la suscripción
  r.get("/webpush/public-key", (_req, res) => {
    if (!wp) return res.status(503).json({ error: "webpush_not_available" });
    res.json({ publicKey: vapidKeys.publicKey });
  });

  r.post("/webpush/subscribe", auth.requireAuth, (req, res) => {
    const sub = req.body?.subscription;
    if (!sub?.endpoint) return res.status(400).json({ error: "invalid_subscription" });
    const existing = db.findOne("pushSubscriptions",
      (p) => p.userId === req.user.id && p.endpoint === sub.endpoint);
    if (existing) {
      // Refrescar keys por si rotó
      db.update("pushSubscriptions", (p) => p.id === existing.id, {
        keys: sub.keys, updatedAt: new Date().toISOString(),
      });
      return res.json({ ok: true, subscriptionId: existing.id });
    }
    const created = db.insert("pushSubscriptions", {
      id: db.id("ps"),
      userId: req.user.id,
      organizationId: req.user.organizationId,
      endpoint: sub.endpoint,
      keys: sub.keys,
      userAgent: req.headers["user-agent"] || "",
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true, subscriptionId: created.id });
  });

  r.post("/webpush/unsubscribe", auth.requireAuth, (req, res) => {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: "missing_endpoint" });
    db.remove("pushSubscriptions",
      (p) => p.userId === req.user.id && p.endpoint === endpoint);
    res.json({ ok: true });
  });

  // Test: el opositor pulsa "enviar prueba" y recibe una push
  r.post("/webpush/test", auth.requireAuth, async (req, res) => {
    if (!wp) return res.status(503).json({ error: "webpush_not_available" });
    const subs = db.find("pushSubscriptions", (p) => p.userId === req.user.id);
    if (!subs.length) return res.status(404).json({ error: "no_subscription" });
    const payload = JSON.stringify({
      title: "OpoPlan",
      body: "Notificación de prueba ✅",
      url: "/",
    });
    const results = [];
    for (const s of subs) {
      try {
        await wp.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
        results.push({ id: s.id, ok: true });
      } catch (e) {
        results.push({ id: s.id, ok: false, error: e.statusCode || e.message });
        // Si la suscripción es 404/410, está caducada → eliminamos
        if (e.statusCode === 404 || e.statusCode === 410) {
          db.remove("pushSubscriptions", (p) => p.id === s.id);
        }
      }
    }
    res.json({ sent: results });
  });

  return r;
};

// Helper exportado para que el scheduler envíe push cuando dispare un evento.
module.exports.sendToUser = async function sendToUser({ userId, payload, env }) {
  const wp = getWebpush(env || process.env);
  if (!wp) return { sent: 0 };
  const subs = db.find("pushSubscriptions", (p) => p.userId === userId);
  let ok = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
      ok += 1;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.remove("pushSubscriptions", (p) => p.id === s.id);
      }
    }
  }
  return { sent: ok };
};
