const { rateLimit } = require("express-rate-limit");

// Rate limiters por endpoint sensible.
//
// Estrategia conservadora:
//   - Login y reset de contraseña: 5 intentos por IP cada 15 min
//   - Registro: 10 cada hora
//   - Endpoints generales: 200 req por IP cada minuto (muy holgado)
//   - Webhooks: 60 cada minuto, sin auth pero verificados por firma
//
// En tests (NODE_ENV=test) los limitadores quedan deshabilitados — si no,
// los 50 tests harían dispararse el límite y veríamos falsos rojos.
//
// Detrás de un proxy inverso, server.js debe tener `app.set("trust proxy", 1)`
// para que `req.ip` apunte a la IP real y no al proxy.

const isTest = process.env.NODE_ENV === "test";

function buildLimiter({ windowMs, max, message }) {
  if (isTest) {
    // Middleware no-op en tests
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "rate_limited", message },
    // No definimos keyGenerator: dejamos el default de express-rate-limit
    // que ya maneja correctamente IPv4/IPv6 cuando `trust proxy` está bien
    // configurado en express (lo está, en server.js para producción).
    // Desactivamos la validación informativa que sale aunque no haya bug.
    validate: { keyGeneratorIpFallback: false },
  });
}

const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Demasiados intentos de login. Espera 15 minutos.",
});

const registerLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Demasiados registros desde esta IP. Espera una hora.",
});

const passwordResetLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Demasiados intentos de recuperación. Espera 15 minutos.",
});

// General API limiter — protege contra abuso pero deja margen amplio para
// uso legítimo (dashboard hace ~5-10 req al cargar).
const apiLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 200,
  message: "Demasiadas peticiones. Reduce la frecuencia.",
});

// Webhooks — sin auth, dependen de verificación de firma. Limitamos para
// evitar amplificación de DoS si alguien descubre la URL.
const webhookLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Webhook rate limit",
});

module.exports = {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  apiLimiter,
  webhookLimiter,
};
