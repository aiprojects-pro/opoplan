const crypto = require("crypto");
const db = require("../lib/db");

// ─────────────────────────────────────────────────────────────────────────────
// Sesiones: cookie firmada con HMAC. Sencillo, suficiente para MVP.
// Sustituible por JWT o express-session sin tocar las rutas.
// ─────────────────────────────────────────────────────────────────────────────

const COOKIE = "op_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verify(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function setSession(res, secret, userId) {
  const token = sign({ userId, exp: Date.now() + TTL_MS }, secret);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: TTL_MS });
}

function clearSession(res) {
  res.clearCookie(COOKIE);
}

// Middleware: lee la cookie, carga el usuario y su organización.
// También registra la última actividad (rate-limited a 1/hora) para el
// scheduler de inactividad. Solo registra para opositores (que es para
// quienes se usan los avisos de inactividad).
function attachUser(secret) {
  const lastSeen = new Map(); // userId -> timestamp ms
  const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000; // 1h

  return (req, res, next) => {
    const token = req.cookies[COOKIE];
    const payload = verify(token, secret);
    if (payload) {
      const user = db.findOne("users", (u) => u.id === payload.userId && u.status === "active");
      if (user) {
        req.user = user;
        req.org = user.organizationId
          ? db.findOne("organizations", (o) => o.id === user.organizationId)
          : null;

        // Registrar actividad para opositores (no en /api/health ni archivos)
        if (user.role === "opositor" && req.path && req.path.startsWith("/api/") && !req.path.startsWith("/api/files/download")) {
          const now = Date.now();
          const last = lastSeen.get(user.id) || 0;
          if (now - last > ACTIVITY_THROTTLE_MS) {
            lastSeen.set(user.id, now);
            try {
              db.insert("activityLog", {
                id: db.id("al"),
                userId: user.id,
                organizationId: user.organizationId,
                at: new Date().toISOString(),
                path: req.path,
              });
            } catch (e) { /* silencioso */ }
          }
        }
      }
    }
    next();
  };
}

// Exige sesión activa
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "auth_required" });
  next();
}

// Exige uno de los roles permitidos
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "auth_required" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

// Aísla por organización: añade un filtro `req.scope` que las rutas usan para
// pedir solo datos de su tenant. El superadmin puede pasar `?orgId=...` para
// inspeccionar cualquier academia.
function tenantScope(req, res, next) {
  if (!req.user) {
    req.scope = { orgId: null };
    return next();
  }
  if (req.user.role === "superadmin") {
    req.scope = { orgId: req.query.orgId || null, isSuper: true };
  } else {
    req.scope = { orgId: req.user.organizationId };
  }
  next();
}

module.exports = {
  COOKIE,
  setSession,
  clearSession,
  attachUser,
  requireAuth,
  requireRole,
  tenantScope,
  sign,
  verify,
};
