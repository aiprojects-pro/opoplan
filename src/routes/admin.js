const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const passwords = require("../lib/passwords");
const notifications = require("../services/notifications");
const { NPS_TEMPLATES } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// API del administrador de academia. Cada admin solo ve y modifica datos de
// su propia organización (req.user.organizationId).
//
// Mejoras incorporadas de la conversación de revisión:
//   - Carga masiva CSV de opositores (~20:06).
//   - Activar/desactivar planes globales por academia (~20:03).
//   - Conteo de suscriptores por plan + protección de borrado (~20:05).
//   - Configuración de cuestionario NPS (~21:00).
//   - Defaults de recordatorio de inactividad y compromiso roto (~20:30).
//   - Dashboard arregla bug: cuenta admin como suscripción activa.
// ─────────────────────────────────────────────────────────────────────────────

function orgIdOf(req) {
  if (req.user.role === "superadmin") return req.query.orgId || null;
  return req.user.organizationId;
}

// Parser CSV simple (sin libs externas). Soporta comillas dobles para campos
// con comas. La primera fila es la cabecera. Devuelve array de objetos.
function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((c) => c && c.trim())).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || "").trim(); });
    return obj;
  });
}

module.exports = function adminRoutes({ appUrl } = {}) {
  const r = express.Router();

  r.use(auth.requireRole("admin", "superadmin"));

  // ── Mi organización ────────────────────────────────────────────────────────

  r.get("/organization", (req, res) => {
    const orgId = orgIdOf(req);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    if (!org) return res.status(404).json({ error: "not_found" });
    res.json({ organization: org });
  });

  // Branding, contacto, facturación, integraciones, NPS, defaults — todo en un
  // único PATCH. Acepta secciones parciales: { branding: {...}, ... }
  r.patch("/organization", (req, res) => {
    const orgId = orgIdOf(req);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    if (!org) return res.status(404).json({ error: "not_found" });

    const patch = {};
    const sections = ["name", "type", "branding", "contact", "billing", "integrations", "nps", "defaults", "globalPlanOverrides"];
    for (const key of sections) {
      if (req.body[key] === undefined) continue;
      if (key === "name" || key === "type") {
        patch[key] = req.body[key];
        continue;
      }
      patch[key] = typeof org[key] === "object" && !Array.isArray(org[key])
        ? { ...org[key], ...req.body[key] }
        : req.body[key];
      if (key === "integrations" && req.body.integrations) {
        patch.integrations = { ...org.integrations };
        for (const sub of Object.keys(req.body.integrations)) {
          patch.integrations[sub] = { ...(org.integrations?.[sub] || {}), ...req.body.integrations[sub] };
        }
      }
    }

    const updated = db.update("organizations", (o) => o.id === orgId, patch);
    res.json({ organization: updated });
  });

  // ── Dashboard de la academia ───────────────────────────────────────────────
  // Bug arreglado de la transcripción ~20:08: el admin se cuenta como activo
  // y se devuelven todos los conteos coherentes con planes y suscripciones.

  r.get("/dashboard", (req, res) => {
    const orgId = orgIdOf(req);
    const users = db.find("users", (u) => u.organizationId === orgId);
    const opositores = users.filter((u) => u.role === "opositor");
    const preparadores = users.filter((u) => u.role === "preparador");
    const admins = users.filter((u) => u.role === "admin");
    const assignments = db.find("assignments", (a) => a.organizationId === orgId && a.active);
    const subs = db.find("subscriptions", (s) => s.organizationId === orgId && s.status === "active");
    const interactions = db.find("interactions", (i) => i.organizationId === orgId);
    const corrections = db.find("corrections", (c) => c.organizationId === orgId);
    const procedures = db.find("procedures", (p) => p.organizationId === orgId);
    const npsResponses = db.find("npsResponses", (n) => n.organizationId === orgId);

    const loadByPreparador = preparadores.map((p) => {
      const myOpos = assignments.filter((a) => a.preparadorId === p.id);
      const myInteractions = interactions.filter((i) => i.preparadorId === p.id);
      const myCorrections = corrections.filter((c) => c.preparadorId === p.id);
      return {
        id: p.id,
        name: p.name,
        opositoresAssigned: myOpos.length,
        interactionsThisMonth: myInteractions.length,
        pendingCorrections: myCorrections.filter((c) => c.status === "pendiente").length,
      };
    });

    // NPS score (% promotores - % detractores)
    let npsScore = null;
    if (npsResponses.length > 0) {
      const promoters = npsResponses.filter((r) => Number(r.score) >= 9).length;
      const detractors = npsResponses.filter((r) => Number(r.score) <= 6).length;
      npsScore = Math.round(((promoters - detractors) / npsResponses.length) * 100);
    }

    res.json({
      totals: {
        users: users.length,
        opositores: opositores.length,
        preparadores: preparadores.length,
        admins: admins.length,
        // (~20:08): cuenta admin + suscripciones reales
        activeAccounts: subs.length + admins.length,
        activeSubscriptions: subs.length,
        monthlyRevenue: subs.reduce((a, s) => a + (Number(s.amount) || 0), 0),
        pendingCorrections: corrections.filter((c) => c.status === "pendiente").length,
        urgentProcedures: procedures.filter((p) => p.status === "urgente").length,
        announcementsToday: 0,
        npsResponseCount: npsResponses.length,
        npsScore,
      },
      loadByPreparador,
    });
  });

  // ── Usuarios y roles ───────────────────────────────────────────────────────

  r.get("/users", (req, res) => {
    const orgId = orgIdOf(req);
    const users = db.find("users", (u) => u.organizationId === orgId);
    const assignments = db.find("assignments", (a) => a.organizationId === orgId && a.active);

    const enriched = users.map((u) => {
      const safe = { ...u };
      delete safe.passwordHash;
      // Nunca filtramos la API key personal hacia otros usuarios; sólo el
      // propio usuario ve su clave (en /roles/me).
      if (safe.ai && (req.user.id !== u.id) && (req.user.role !== "superadmin")) {
        safe.ai = { enabled: !!safe.ai.enabled, provider: safe.ai.provider, model: safe.ai.model, apiKey: safe.ai.apiKey ? "***" : "" };
      }
      if (u.role === "preparador") {
        safe.opositoresAssigned = assignments.filter((a) => a.preparadorId === u.id).length;
      }
      if (u.role === "opositor") {
        const a = assignments.find((x) => x.opositorId === u.id);
        safe.preparadorId = a ? a.preparadorId : null;
        safe.preparadorName = a ? users.find((x) => x.id === a.preparadorId)?.name || null : null;
      }
      return safe;
    });

    res.json({ users: enriched });
  });

  r.post("/users", (req, res) => {
    const orgId = orgIdOf(req);
    const { name, email, password, role, phone, whatsapp, whatsappOptIn, specialty, subscriptionPlanId } = req.body || {};
    if (!name || !email || !password || !role) return res.status(400).json({ error: "missing_fields" });
    if (!["admin", "preparador", "opositor"].includes(role)) return res.status(400).json({ error: "invalid_role" });
    if (db.findOne("users", (u) => u.email.toLowerCase() === String(email).toLowerCase())) {
      return res.status(409).json({ error: "email_in_use" });
    }
    const newUser = db.insert("users", {
      id: db.id("u"),
      organizationId: orgId,
      role,
      name,
      email,
      phone: phone || "",
      whatsapp: whatsapp || "",
      whatsappOptIn: !!whatsappOptIn,
      photo: "",
      passwordHash: passwords.hash(password),
      status: "active",
      ...(role === "preparador" ? {
        specialty: specialty || "",
        chatbotMode: "supervised",
        inactivitySettings: { preset: "normal", days: 7, enabled: true },
        ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
      } : {}),
      ...(role === "opositor" ? {
        subscriptionPlanId: subscriptionPlanId || "plan_free",
        chatbotEnabled: false,
        commitment: { examName: "", examDate: "", weeklyHours: 0, dailyHours: 0, activeDays: [], restDays: [], vacationRanges: [] },
        ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
        rankingOptIn: false,
      } : {}),
    });
    const out = { ...newUser };
    delete out.passwordHash;

    // Tarea recurrente "Revisar BOE" para opositores nuevos
    if (role === "opositor") {
      const today = new Date();
      const friday = new Date(today);
      const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
      friday.setDate(today.getDate() + daysUntilFriday);
      db.insert("events", {
        id: db.id("e"),
        organizationId: orgId,
        ownerType: "opositor",
        ownerId: newUser.id,
        opositorId: newUser.id,
        recipients: [newUser.id],
        title: "📰 Revisar BOE",
        type: "tarea",
        date: friday.toISOString().slice(0, 10),
        time: "13:00",
        durationMin: 60,
        recurrence: "weekly",
        recurrenceUntil: "",
        recurrenceExceptions: [],
        description: "Revisar el Boletín Oficial del Estado.",
        createdAt: new Date().toISOString(),
      });
    }

    notifications
      .notify({ orgId, to: newUser.email, template: "welcome", data: { name: newUser.name, role: newUser.role }, appUrl })
      .catch((e) => console.error("[notify:welcome]", e));

    res.json({ user: out });
  });

  // Carga masiva de opositores via CSV (transcripción ~20:06).
  // Formato esperado: headers "name,email,password,phone,whatsapp,subscriptionPlanId"
  // POST /api/admin/users/bulk con body { csv: "..." } o { rows: [...] }
  r.post("/users/bulk", (req, res) => {
    const orgId = orgIdOf(req);
    const role = req.body.role === "preparador" ? "preparador" : "opositor";
    let rows = [];
    if (typeof req.body.csv === "string") {
      try { rows = parseCsv(req.body.csv); } catch { return res.status(400).json({ error: "invalid_csv" }); }
    } else if (Array.isArray(req.body.rows)) {
      rows = req.body.rows;
    } else {
      return res.status(400).json({ error: "missing_csv_or_rows" });
    }

    const created = [];
    const skipped = [];
    // Acumulamos las contraseñas generadas para enviarlas por email tras crear
    // todos los usuarios (no bloqueante). NUNCA volvemos a guardar la contraseña
    // en claro: el hash bcrypt se persiste, la contraseña en claro vive solo en
    // memoria el tiempo necesario para el envío.
    const credentials = [];
    for (const row of rows) {
      const name = (row.name || row.nombre || "").trim();
      const email = (row.email || row.correo || "").trim();
      const providedPassword = (row.password || row.contrase || row.contrasena || row.pass || "").trim();
      const tempPassword = providedPassword || passwords.generateTempPassword();
      const wasGenerated = !providedPassword;
      if (!name || !email) { skipped.push({ row, reason: "missing_name_or_email" }); continue; }
      if (db.findOne("users", (u) => u.email && u.email.toLowerCase() === email.toLowerCase())) {
        skipped.push({ row, reason: "email_in_use" }); continue;
      }
      const phone = (row.phone || row.telefono || "").trim();
      const whatsapp = (row.whatsapp || row.wa || "").trim();
      const planId = (row.plan || row.subscriptionplanid || "").trim() || "plan_free";

      const u = db.insert("users", {
        id: db.id("u"),
        organizationId: orgId,
        role,
        name,
        email,
        phone,
        whatsapp,
        whatsappOptIn: !!whatsapp,
        photo: "",
        passwordHash: passwords.hash(tempPassword),
        status: "active",
        // Si la contraseña la generamos nosotros, marcamos al usuario para
        // forzar cambio en el primer login. Si vino en el CSV asumimos que
        // el admin ya la tiene controlada.
        mustChangePassword: wasGenerated,
        ...(role === "preparador" ? {
          specialty: (row.specialty || row.especialidad || "").trim(),
          chatbotMode: "supervised",
          inactivitySettings: { preset: "normal", days: 7, enabled: true },
          ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
        } : {
          subscriptionPlanId: planId,
          chatbotEnabled: false,
          commitment: { examName: "", examDate: "", weeklyHours: 0, dailyHours: 0, activeDays: [], restDays: [], vacationRanges: [] },
          ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
          rankingOptIn: false,
        }),
      });
      created.push({ id: u.id, email: u.email, name: u.name, mustChangePassword: wasGenerated });
      credentials.push({ user: u, tempPassword, wasGenerated });
    }

    // Welcome con credenciales (transcripción ~20:06): el opositor recibe
    // email con su contraseña temporal y aviso de que debe cambiarla.
    // No bloqueante — fallos en email no rompen la importación.
    for (const c of credentials) {
      notifications.notify({
        orgId,
        to: c.user.email,
        template: "welcomeWithCredentials",
        data: {
          name: c.user.name,
          role,
          email: c.user.email,
          tempPassword: c.tempPassword,
          generated: c.wasGenerated,
        },
        appUrl,
      }).catch((e) => console.error("[bulk:notify]", e));
    }

    res.json({ created, skipped, createdCount: created.length, skippedCount: skipped.length });
  });

  r.patch("/users/:id/status", (req, res) => {
    const orgId = orgIdOf(req);
    const { status } = req.body || {};
    if (!["active", "inactive"].includes(status)) return res.status(400).json({ error: "invalid_status" });
    const user = db.findOne("users", (u) => u.id === req.params.id && u.organizationId === orgId);
    if (!user) return res.status(404).json({ error: "not_found" });
    const updated = db.update("users", (u) => u.id === user.id, { status });
    const out = { ...updated };
    delete out.passwordHash;
    res.json({ user: out });
  });

  r.patch("/users/:id", (req, res) => {
    const orgId = orgIdOf(req);
    const user = db.findOne("users", (u) => u.id === req.params.id && u.organizationId === orgId);
    if (!user) return res.status(404).json({ error: "not_found" });
    const patch = { ...req.body };
    if (patch.password) {
      patch.passwordHash = passwords.hash(patch.password);
      patch.mustChangePassword = false;
      delete patch.password;
    }
    delete patch.id;
    delete patch.role;
    delete patch.organizationId;
    const updated = db.update("users", (u) => u.id === user.id, patch);
    const out = { ...updated };
    delete out.passwordHash;
    res.json({ user: out });
  });

  r.delete("/users/:id", (req, res) => {
    const orgId = orgIdOf(req);
    const user = db.findOne("users", (u) => u.id === req.params.id && u.organizationId === orgId);
    if (!user) return res.status(404).json({ error: "not_found" });
    if (user.id === req.user.id) return res.status(400).json({ error: "cannot_delete_self" });
    db.update("users", (u) => u.id === user.id, { status: "inactive" });
    res.json({ ok: true });
  });

  // ── Asignaciones preparador ↔ opositor con histórico ───────────────────────

  r.get("/assignments", (req, res) => {
    const orgId = orgIdOf(req);
    res.json({
      assignments: db.find("assignments", (a) => a.organizationId === orgId),
      history: db.find("assignmentHistory", (h) => h.organizationId === orgId),
    });
  });

  r.post("/assignments", (req, res) => {
    const orgId = orgIdOf(req);
    const { preparadorId, opositorId, reason } = req.body || {};
    if (!preparadorId || !opositorId) return res.status(400).json({ error: "missing_fields" });

    const previous = db.find("assignments", (a) => a.organizationId === orgId && a.opositorId === opositorId && a.active);
    for (const prev of previous) {
      db.update("assignments", (a) => a.id === prev.id, { active: false, until: new Date().toISOString().slice(0, 10) });
      db.insert("assignmentHistory", {
        id: db.id("ah"),
        organizationId: orgId,
        opositorId,
        previousPreparadorId: prev.preparadorId,
        newPreparadorId: preparadorId,
        changedAt: new Date().toISOString(),
        changedBy: req.user.id,
        reason: reason || "",
      });
    }

    const a = db.insert("assignments", {
      id: db.id("a"),
      organizationId: orgId,
      preparadorId,
      opositorId,
      since: new Date().toISOString().slice(0, 10),
      active: true,
    });

    const opositor = db.findOne("users", (u) => u.id === opositorId);
    const preparador = db.findOne("users", (u) => u.id === preparadorId);
    if (opositor && preparador) {
      const data = { opositorName: opositor.name, preparadorName: preparador.name, reason: reason || "" };
      notifications.notifyUsers({ orgId, userIds: [preparadorId, opositorId], template: "assignment", data, appUrl })
        .catch((e) => console.error("[notify:assignment]", e));
    }

    res.json({ assignment: a });
  });

  // ── Planes propios + control de planes globales por academia ──────────────

  r.get("/plans", (req, res) => {
    const orgId = orgIdOf(req);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    const overrides = org?.globalPlanOverrides || {};
    const subs = db.find("subscriptions", (s) => s.organizationId === orgId && s.status === "active");

    const allGlobal = db.find("subscriptionPlans", (p) => p.scope === "global" && p.active !== false);
    const global = allGlobal.map((p) => ({
      ...p,
      // estado de visibilidad de este plan global para esta academia
      enabledForOrg: overrides[p.id]?.active !== false,
      activeSubscribers: subs.filter((s) => s.planId === p.id).length,
    }));

    const own = db.find("subscriptionPlans", (p) => p.scope === "org" && p.organizationId === orgId).map((p) => ({
      ...p,
      activeSubscribers: subs.filter((s) => s.planId === p.id).length,
      deletable: subs.filter((s) => s.planId === p.id).length === 0,
    }));

    res.json({ global, own });
  });

  // Activar/desactivar un plan global para esta academia (~20:03)
  r.post("/plans/global/:id/toggle", (req, res) => {
    const orgId = orgIdOf(req);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    if (!org) return res.status(404).json({ error: "not_found" });
    const enabled = req.body?.enabled !== false;
    const overrides = { ...(org.globalPlanOverrides || {}) };
    overrides[req.params.id] = { active: enabled };
    db.update("organizations", (o) => o.id === orgId, { globalPlanOverrides: overrides });
    res.json({ ok: true, planId: req.params.id, enabled });
  });

  r.post("/plans", (req, res) => {
    const orgId = orgIdOf(req);
    const { name, line, target, price, currency, period, trialDays, features, active, quota } = req.body || {};
    if (!name || price == null) return res.status(400).json({ error: "missing_fields" });
    const plan = db.insert("subscriptionPlans", {
      id: db.id("plan"),
      scope: "org",
      organizationId: orgId,
      line: line || "oposiciones",
      name,
      target: target || "opositor",
      price: Number(price),
      currency: currency || "EUR",
      period: period || "monthly",
      trialDays: Number(trialDays) || 0,
      features: Array.isArray(features) ? features : [],
      active: active !== false,
      quota: quota || null,
    });
    res.json({ plan });
  });

  r.patch("/plans/:id", (req, res) => {
    const orgId = orgIdOf(req);
    const updated = db.update(
      "subscriptionPlans",
      (p) => p.id === req.params.id && p.organizationId === orgId,
      req.body || {},
    );
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ plan: updated });
  });

  r.delete("/plans/:id", (req, res) => {
    const orgId = orgIdOf(req);
    const plan = db.findOne("subscriptionPlans", (p) => p.id === req.params.id && p.organizationId === orgId);
    if (!plan) return res.status(404).json({ error: "not_found" });
    const activeSubs = db.find("subscriptions", (s) => s.status === "active" && s.planId === plan.id);
    if (req.query.force !== "true" && activeSubs.length > 0) {
      return res.status(409).json({
        error: "has_active_subscribers",
        activeSubscribers: activeSubs.length,
        message: `Este plan tiene ${activeSubs.length} suscriptores activos. Desactívalo en lugar de borrarlo.`,
      });
    }
    const updated = db.update("subscriptionPlans", (p) => p.id === plan.id, { active: false });
    res.json({ ok: true, plan: updated });
  });

  // ── Suscripciones de la academia ──────────────────────────────────────────

  r.get("/subscriptions", (req, res) => {
    const orgId = orgIdOf(req);
    const subs = db.find("subscriptions", (s) => s.organizationId === orgId);
    const users = db.find("users", (u) => u.organizationId === orgId);
    const plans = db.find("subscriptionPlans", () => true);
    res.json({
      subscriptions: subs.map((s) => ({
        ...s,
        userName: users.find((u) => u.id === s.userId)?.name || "(usuario eliminado)",
        userEmail: users.find((u) => u.id === s.userId)?.email || "",
        planName: plans.find((p) => p.id === s.planId)?.name || s.planId,
      })),
    });
  });

  r.post("/subscriptions", (req, res) => {
    const orgId = orgIdOf(req);
    const { userId, planId } = req.body || {};
    const plan = db.findOne("subscriptionPlans", (p) => p.id === planId);
    if (!plan) return res.status(400).json({ error: "invalid_plan" });
    const sub = db.insert("subscriptions", {
      id: db.id("sub"),
      organizationId: orgId,
      userId,
      planId,
      status: "active",
      amount: plan.price,
      renewalDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      provider: "internal",
      stripeSubscriptionId: "",
    });
    db.update("users", (u) => u.id === userId && u.organizationId === orgId, { subscriptionPlanId: planId });
    res.json({ subscription: sub });
  });

  // ── NPS (encuestas) ───────────────────────────────────────────────────────

  // Plantillas disponibles (~21:00)
  r.get("/nps/templates", (req, res) => {
    res.json({ templates: NPS_TEMPLATES });
  });

  // Listar respuestas de la academia
  r.get("/nps/responses", (req, res) => {
    const orgId = orgIdOf(req);
    const list = db.find("npsResponses", (n) => n.organizationId === orgId);
    res.json({ responses: list });
  });

  // Disparar manualmente envío de encuesta a usuarios
  r.post("/nps/send", async (req, res) => {
    const orgId = orgIdOf(req);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    if (!org) return res.status(404).json({ error: "not_found" });
    const audience = (req.body?.audience || "opositores");
    let users = db.find("users", (u) => u.organizationId === orgId && u.status === "active" && u.email);
    if (audience === "opositores") users = users.filter((u) => u.role === "opositor");
    if (audience === "preparadores") users = users.filter((u) => u.role === "preparador");

    const tpl = NPS_TEMPLATES.find((t) => t.id === (org.nps?.template || "nps_classic")) || NPS_TEMPLATES[0];
    const subject = `Tu opinión sobre ${org.name}`;
    const body = (tpl.questions[0]?.text || "¿Qué te parece la plataforma?") +
      `\n\nResponde con un número del 0 al 10 contestando este email, o desde tu panel.`;

    const sent = await notifications.notifyUsers({
      orgId, userIds: users.map((u) => u.id),
      template: "announcement",
      data: { title: subject, body }, appUrl,
    });
    res.json({ ok: true, sentCount: sent.filter((r) => r.ok).length });
  });

  return r;
};
