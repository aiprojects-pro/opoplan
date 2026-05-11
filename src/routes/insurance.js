const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const crypto = require("crypto");

// Seguro de convocatoria (catálogo §A.10.1).
//
// Modelo: el opositor paga una prima del 15-25 % sobre la matrícula y a
// cambio recibe una garantía. Si no aprueba en N convocatorias completando
// las condiciones (asistencia, simulacros, presentación), se le concede:
//   - Extensión gratuita de X meses, o
//   - Devolución parcial de la matrícula
//
// Lo que esto módulo implementa:
//   - Definición de pólizas por academia (precio, condiciones, beneficios)
//   - Suscripción a una póliza por opositor
//   - Tracking automático del cumplimiento de condiciones
//   - Cálculo de elegibilidad para reclamar el seguro
//
// Lo que NO implementa (out of scope MVP):
//   - Cálculo actuarial real (porcentaje de aprobados que financian al resto)
//   - Cobro de la prima vía pasarela (queda como TODO al integrar Stripe)
//   - Alianza con aseguradora externa para externalizar el riesgo

module.exports = function insuranceRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }
  function isAdmin(req) { return ["admin", "superadmin"].includes(req.user.role); }

  // GET /insurance/policies — pólizas que ofrece mi academia
  r.get("/insurance/policies", (req, res) => {
    const policies = db.find("insurancePolicies",
      (p) => p.organizationId === orgOf(req) && p.active !== false);
    res.json({ policies });
  });

  // POST /insurance/policies — admin define una nueva póliza
  r.post("/insurance/policies", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const b = req.body || {};
    if (!b.name || !b.premiumPct || !b.benefit) return res.status(400).json({ error: "missing_fields" });
    const policy = db.insert("insurancePolicies", {
      id: "pol_" + crypto.randomBytes(4).toString("hex"),
      organizationId: orgOf(req),
      name: b.name,
      description: b.description || "",
      // Prima como % sobre la matrícula
      premiumPct: Number(b.premiumPct), // 15-25 típicamente
      // Condiciones que el opositor debe cumplir para que el seguro aplique
      conditions: {
        minProgramCompletionPct: Number(b.minProgramCompletionPct) || 80,
        minSimulacrosCompliancePct: Number(b.minSimulacrosCompliancePct) || 80,
        mustAttendConvocations: Number(b.mustAttendConvocations) || 1,
      },
      // Beneficio si no aprueba en N convocatorias cumpliendo las condiciones
      benefit: {
        type: b.benefit.type || "extension", // extension | partial_refund
        extensionMonths: Number(b.benefit.extensionMonths) || 0,
        refundPct: Number(b.benefit.refundPct) || 0, // ej: 30 = 30% devuelto
      },
      maxClaimsPerEnrollment: Number(b.maxClaimsPerEnrollment) || 1,
      active: true,
      createdAt: new Date().toISOString(),
    });
    res.json({ policy });
  });

  // PATCH/DELETE de pólizas (admin)
  r.patch("/insurance/policies/:id", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const p = db.findOne("insurancePolicies", (x) => x.id === req.params.id && x.organizationId === orgOf(req));
    if (!p) return res.status(404).json({ error: "not_found" });
    const allowed = ["name", "description", "premiumPct", "conditions", "benefit", "active"];
    const patch = {};
    for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
    res.json({ policy: db.update("insurancePolicies", (x) => x.id === p.id, patch) });
  });

  // POST /insurance/enroll — opositor se acoge a una póliza
  // En MVP marcamos el premiumStatus como "pending" hasta que se conecte
  // pasarela. La póliza queda activa de cara al tracking aunque no se haya
  // cobrado, para no bloquear la demo end-to-end.
  r.post("/insurance/enroll", auth.requireRole("opositor"), (req, res) => {
    const policyId = req.body?.policyId;
    const policy = db.findOne("insurancePolicies",
      (p) => p.id === policyId && p.organizationId === orgOf(req) && p.active);
    if (!policy) return res.status(404).json({ error: "policy_not_found" });
    const existing = db.findOne("insuranceEnrollments",
      (e) => e.opositorId === req.user.id && e.policyId === policyId && e.status !== "cancelled");
    if (existing) return res.status(409).json({ error: "already_enrolled" });
    // Buscamos la suscripción actual del opositor para calcular la prima
    const sub = db.findOne("subscriptions",
      (s) => s.userId === req.user.id && s.status === "active");
    const premium = sub ? +(sub.amount * (policy.premiumPct / 100)).toFixed(2) : null;
    const enrollment = db.insert("insuranceEnrollments", {
      id: "ie_" + crypto.randomBytes(4).toString("hex"),
      organizationId: orgOf(req),
      opositorId: req.user.id,
      policyId: policy.id,
      enrolledAt: new Date().toISOString(),
      status: "active", // active | cancelled | claim_paid
      premiumAmount: premium,
      premiumCurrency: sub?.currency || "EUR",
      premiumStatus: "pending", // TODO: pagar vía Stripe → "paid"
      convocationsAttempted: [],
      claims: [],
    });
    res.json({ enrollment });
  });

  // GET /insurance/mine — opositor ve su póliza, condiciones y cumplimiento
  r.get("/insurance/mine", auth.requireRole("opositor"), (req, res) => {
    const enrollments = db.find("insuranceEnrollments",
      (e) => e.opositorId === req.user.id && e.status === "active");
    const expanded = enrollments.map((e) => {
      const policy = db.findOne("insurancePolicies", (p) => p.id === e.policyId);
      const compliance = computeCompliance(req.user.id, policy);
      return { ...e, policy, compliance };
    });
    res.json({ enrollments: expanded });
  });

  // POST /insurance/:id/register-attempt — opositor declara haberse presentado
  r.post("/insurance/enrollments/:id/register-attempt", auth.requireRole("opositor"), (req, res) => {
    const e = db.findOne("insuranceEnrollments",
      (x) => x.id === req.params.id && x.opositorId === req.user.id);
    if (!e) return res.status(404).json({ error: "not_found" });
    const { convocationName, convocationDate, result, score } = req.body || {};
    if (!convocationName) return res.status(400).json({ error: "missing_convocation" });
    const attempt = {
      convocationName,
      convocationDate: convocationDate || new Date().toISOString().slice(0, 10),
      result: result || "not_passed", // passed | not_passed | not_attended
      score: score != null ? Number(score) : null,
      registeredAt: new Date().toISOString(),
    };
    const next = [...(e.convocationsAttempted || []), attempt];
    const updated = db.update("insuranceEnrollments", (x) => x.id === e.id, {
      convocationsAttempted: next,
    });
    res.json({ enrollment: updated, attempt });
  });

  // POST /insurance/:id/claim — opositor reclama el beneficio
  r.post("/insurance/enrollments/:id/claim", auth.requireRole("opositor"), (req, res) => {
    const e = db.findOne("insuranceEnrollments",
      (x) => x.id === req.params.id && x.opositorId === req.user.id);
    if (!e) return res.status(404).json({ error: "not_found" });
    const policy = db.findOne("insurancePolicies", (p) => p.id === e.policyId);
    if (!policy) return res.status(404).json({ error: "policy_not_found" });
    const compliance = computeCompliance(req.user.id, policy);
    if (!compliance.eligible) {
      return res.status(409).json({ error: "not_eligible", compliance });
    }
    const claimsCount = (e.claims || []).length;
    if (claimsCount >= (policy.maxClaimsPerEnrollment || 1)) {
      return res.status(409).json({ error: "max_claims_reached" });
    }
    const claim = {
      id: "clm_" + crypto.randomBytes(4).toString("hex"),
      claimedAt: new Date().toISOString(),
      benefit: policy.benefit,
      status: "pending_review", // pending_review | approved | rejected
      reviewedBy: null,
      reviewedAt: null,
    };
    const updated = db.update("insuranceEnrollments", (x) => x.id === e.id, {
      claims: [...(e.claims || []), claim],
    });
    res.json({ enrollment: updated, claim });
  });

  // PATCH admin: revisar reclamación
  r.patch("/insurance/enrollments/:id/claims/:claimId", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const e = db.findOne("insuranceEnrollments",
      (x) => x.id === req.params.id && x.organizationId === orgOf(req));
    if (!e) return res.status(404).json({ error: "not_found" });
    const claims = (e.claims || []).map((c) =>
      c.id === req.params.claimId
        ? { ...c, status: req.body.status, reviewedBy: req.user.id, reviewedAt: new Date().toISOString() }
        : c);
    const updated = db.update("insuranceEnrollments", (x) => x.id === e.id, { claims });
    res.json({ enrollment: updated });
  });

  return r;
};

// Calcula si el opositor cumple las condiciones para reclamar.
function computeCompliance(opositorId, policy) {
  if (!policy) return { eligible: false };
  const conds = policy.conditions || {};

  // Cumplimiento del programa: usamos el plan generado (% de tareas hechas)
  const plan = db.findOne("plans", (p) => p.opositorId === opositorId);
  const programPct = plan
    ? Math.round(((plan.doneTasks || 0) / Math.max(1, plan.totalTasks || 0)) * 100)
    : 0;

  // Cumplimiento de simulacros: % de simulacros completados sobre los marcados
  const sims = db.find("simulacroAttempts", (a) => a.opositorId === opositorId);
  const simsAssigned = sims.length; // proxy razonable
  const simsCompleted = sims.filter((a) => a.finishedAt).length;
  const simsPct = simsAssigned ? Math.round((simsCompleted / simsAssigned) * 100) : 0;

  // Convocatorias presentadas
  const enrollments = db.find("insuranceEnrollments",
    (e) => e.opositorId === opositorId && e.policyId === policy.id);
  const attemptedCount = enrollments.reduce(
    (s, e) => s + (e.convocationsAttempted || []).filter((a) => a.result !== "not_attended").length, 0);

  const programOk = programPct >= (conds.minProgramCompletionPct || 80);
  const simsOk = simsPct >= (conds.minSimulacrosCompliancePct || 80);
  const attendedOk = attemptedCount >= (conds.mustAttendConvocations || 1);
  // Para que el seguro aplique, el opositor NO debe haber aprobado en ninguna de las convocatorias presentadas
  const passedAny = enrollments.some(
    (e) => (e.convocationsAttempted || []).some((a) => a.result === "passed"));

  return {
    programCompletionPct: programPct,
    simsCompliancePct: simsPct,
    convocationsAttempted: attemptedCount,
    programOk,
    simsOk,
    attendedOk,
    passedAny,
    eligible: programOk && simsOk && attendedOk && !passedAny,
  };
}
