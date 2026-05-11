// ─────────────────────────────────────────────────────────────────────────────
// OpoPlan v2 — entrypoint
// Plataforma multi-tenant de preparación de oposiciones.
// Roles:
//   - superadmin: gestiona la plataforma y todas las academias.
//   - admin: dueño/a de UNA academia, personaliza branding, integra Stripe,
//     email, IA, almacenamiento y gestiona usuarios.
//   - preparador: profesor de la academia, gestiona alumnos asignados.
//   - opositor: alumno, consume su plan personalizado.
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

const db = require("./src/lib/db");
const auth = require("./src/middleware/auth");
const storageService = require("./src/services/storage");
const emailService = require("./src/services/email");
const aiService = require("./src/services/ai");
const paymentsService = require("./src/services/payments");
const videoconferenceService = require("./src/services/videoconference");
const notifications = require("./src/services/notifications");

const env = process.env;
const port = Number(env.PORT || 3000);
const appUrl = env.APP_URL || `http://localhost:${port}`;
const sessionSecret = env.SESSION_SECRET || "opoplan-dev-secret-change-me";
const isProd = env.NODE_ENV === "production";

// En producción, no podemos arrancar con secrets por defecto.
// Si ese caso ocurre, salimos con error claro en lugar de empezar a servir
// con una sesión que es trivial de falsificar.
if (isProd && sessionSecret === "opoplan-dev-secret-change-me") {
  console.error("[FATAL] NODE_ENV=production sin SESSION_SECRET en .env. Aborting.");
  process.exit(1);
}
if (isProd && sessionSecret.length < 32) {
  console.error("[FATAL] SESSION_SECRET demasiado corto (<32 chars) para producción. Aborting.");
  process.exit(1);
}

// Inicializa DB y servicios
db.load();
const storage = storageService.fromEnv(env, appUrl);
const email = emailService.fromEnv(env);
const ai = aiService.fromEnv(env);
const payments = paymentsService.fromEnv(env);
const videoconference = videoconferenceService.fromEnv(env);
notifications.setGlobalEmail(email);

console.log(`[storage]        provider=${storage.provider}`);
console.log(`[email]          provider=${email.provider}`);
console.log(`[ai]             provider=${ai.provider}`);
console.log(`[payments]       provider=${payments.provider}`);
console.log(`[videoconference] provider=${videoconference.provider}`);
if (isProd) console.log(`[mode]           production · cookies Secure activadas`);

const app = express();

// Trust proxy: cuando OpoPlan corre detrás de nginx/Caddy/Cloudflare, hace
// falta esto para que `req.protocol`, `req.ip`, `Secure` cookie y
// rate-limiter por IP funcionen correctamente. El valor "1" significa
// "confía en el primer salto de proxy". Si tienes varios proxies
// encadenados, ajústalo.
if (isProd) app.set("trust proxy", 1);

// El webhook de Stripe necesita raw body — lo registramos antes del json parser
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => {
  try {
    if (payments.provider !== "stripe") return res.json({ ok: true, mocked: true });
    const event = payments.verifyWebhook(req.body, req.headers["stripe-signature"]);
    console.log("[stripe:webhook]", event.type);
    // TODO Fase 4: actualizar suscripciones, enviar emails, etc.
    res.json({ received: true });
  } catch (e) {
    console.error("[stripe:webhook] error", e.message);
    res.status(400).send(`Webhook Error: ${e.message}`);
  }
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting general para todos los endpoints /api/*. Los endpoints
// más sensibles (login, register) tienen su propio limiter más estricto
// aplicado dentro de sus routes.
const { apiLimiter } = require("./src/middleware/rateLimits");
app.use("/api/", apiLimiter);

app.use(auth.attachUser(sessionSecret));

// Estáticos del frontend
app.use(express.static(path.join(__dirname, "public")));

// Estáticos para el storage local (fallback cuando STORAGE_PROVIDER=local)
if (storage.provider === "local") {
  app.use("/files", express.static(path.join(__dirname, "uploads")));
}

// ─── Rutas API ──────────────────────────────────────────────────────────────

// Endpoint de salud (antes de los routers que protegen /api con requireAuth)
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    services: {
      storage: storage.provider,
      email: email.provider,
      ai: ai.provider,
      payments: payments.provider,
    },
  });
});

app.use("/api/auth", require("./src/routes/auth")({ sessionSecret }));
app.use("/api/superadmin", require("./src/routes/superadmin")());
app.use("/api/admin", require("./src/routes/admin")({ appUrl }));
app.use("/api/files", require("./src/routes/files")({ storage, appUrl }));
app.use("/api", require("./src/routes/common")({ appUrl, videoconference }));
app.use("/api", require("./src/routes/roles")());
app.use("/api", require("./src/routes/syllabi")());
app.use("/api", require("./src/routes/materials")());
app.use("/api", require("./src/routes/corrections")({ appUrl }));
app.use("/api", require("./src/routes/assessments")());
app.use("/api", require("./src/routes/procedures")());
app.use("/api", require("./src/routes/chat")({ env: process.env }));
app.use("/api", require("./src/routes/processes")());
app.use("/api", require("./src/routes/aiTools")({ env: process.env }));
app.use("/api", require("./src/routes/nps")());
app.use("/api", require("./src/routes/challenges")());
app.use("/api", require("./src/routes/billing")({ env: process.env, appUrl }));
app.use("/api", require("./src/routes/reports")({ env: process.env }));
// ─── FASE 6: catálogo extendido ─────────────────────────────────────────────
app.use("/api", require("./src/routes/analytics")());
app.use("/api", require("./src/routes/predictor")());
app.use("/api", require("./src/routes/normative")());
app.use("/api", require("./src/routes/marketplace")({ env }));
app.use("/api", require("./src/routes/wellbeing")());
app.use("/api", require("./src/routes/simulacros")());
app.use("/api", require("./src/routes/multichannel")());
// ─── FASE 6 ampliada (resto del catálogo) ──────────────────────────────────
app.use("/api", require("./src/routes/certifications")());
app.use("/api", require("./src/routes/interAcademic")());
app.use("/api", require("./src/routes/insurance")());
app.use("/api", require("./src/routes/crm")());
app.use("/api", require("./src/routes/audits")());
app.use("/api", require("./src/routes/community")());
app.use("/api", require("./src/routes/paymentsConnect")({ env, appUrl }));
app.use("/api", require("./src/routes/rag")({ env }));
app.use("/api", require("./src/routes/telegram")({ env }));
app.use("/api", require("./src/routes/webpush")({ env }));
app.use("/api", require("./src/routes/paymentsPaypal")({ env, appUrl }));

// Catch-all para SPA: devuelve index.html para rutas que no son API
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Manejador de errores
app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(err.status || 500).json({ error: err.message || "server_error" });
});

// Solo arrancamos el listen si nos ejecutan como entrypoint principal
// (no cuando los tests hacen require("./server")).
if (require.main === module) {
  const server = app.listen(port, () => {
    console.log(`\n🎓 OpoPlan corriendo en ${appUrl}\n`);

    // Scheduler de recordatorios automáticos (24h y 1h antes de cada evento)
    require("./src/lib/scheduler").start({ appUrl });
  });
  // Realtime via WebSocket en el mismo puerto, path /ws
  require("./src/services/realtime").attach(server, { sessionSecret });
  console.log("[realtime]      WebSocket en /ws");
}

// Exporta para tests / scripts
module.exports = { app, services: { storage, email, ai, payments, videoconference } };
