const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const crypto = require("crypto");

// Certificación interna pre-oposición (catálogo §A.10.3).
//
// La academia define niveles ("Level 1, 2, 3...") con criterios objetivos
// (X simulacros con nota mínima Y). El sistema evalúa periódicamente y emite
// un certificado verificable en PDF/SVG.
//
// El certificado NO tiene valor oficial; sirve como señal de progreso para
// el opositor y como herramienta de marketing para la academia ("el 71% de
// nuestros Level 3 aprueban en primera convocatoria").

const LEVEL_DEFAULTS = [
  { id: "L1", label: "Nivel Inicial",  minSimulacros: 3,  minScore: 5.0, color: "#94a3b8" },
  { id: "L2", label: "Nivel Medio",    minSimulacros: 6,  minScore: 6.0, color: "#0ea5e9" },
  { id: "L3", label: "Nivel Avanzado", minSimulacros: 10, minScore: 7.0, color: "#0c8f6f" },
  { id: "L4", label: "Nivel Examen",   minSimulacros: 15, minScore: 7.5, color: "#7c3aed" },
];

module.exports = function certificationsRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }

  // GET /certifications/levels — niveles configurados de la academia
  r.get("/certifications/levels", (req, res) => {
    const org = db.findOne("organizations", (o) => o.id === orgOf(req));
    res.json({ levels: org?.certificationLevels || LEVEL_DEFAULTS });
  });

  // PATCH /certifications/levels — admin actualiza criterios
  r.patch("/certifications/levels", auth.requireRole("admin", "superadmin"), (req, res) => {
    const levels = Array.isArray(req.body?.levels) ? req.body.levels : null;
    if (!levels) return res.status(400).json({ error: "missing_levels" });
    db.update("organizations", (o) => o.id === orgOf(req), { certificationLevels: levels });
    res.json({ levels });
  });

  // GET /certifications/mine — niveles que el opositor ha alcanzado
  r.get("/certifications/mine", auth.requireRole("opositor"), (req, res) => {
    const org = db.findOne("organizations", (o) => o.id === orgOf(req));
    const levels = org?.certificationLevels || LEVEL_DEFAULTS;
    const sims = db.find("simulacroAttempts",
      (a) => a.opositorId === req.user.id && a.finishedAt)
      .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
    const issued = db.find("certificates", (c) => c.opositorId === req.user.id);

    const eligibility = levels.map((lv) => {
      const passing = sims.filter((s) => s.score >= lv.minScore);
      const reached = passing.length >= lv.minSimulacros;
      const reachedAt = reached ? passing[lv.minSimulacros - 1].finishedAt : null;
      const cert = issued.find((c) => c.levelId === lv.id);
      return {
        ...lv,
        eligibleNow: reached,
        progress: { current: passing.length, target: lv.minSimulacros },
        reachedAt,
        issued: !!cert,
        certificateId: cert?.id || null,
      };
    });
    res.json({ eligibility });
  });

  // POST /certifications/issue/:levelId — emite el certificado
  // Lo puede pedir el opositor (auto-emisión) o el admin (a alguien).
  r.post("/certifications/issue/:levelId", (req, res) => {
    const opositorId = req.user.role === "opositor" ? req.user.id : req.body?.opositorId;
    if (!opositorId) return res.status(400).json({ error: "missing_opositor" });
    if (req.user.role !== "opositor" && !["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const opo = db.findOne("users", (u) => u.id === opositorId && u.organizationId === orgOf(req));
    if (!opo) return res.status(404).json({ error: "opositor_not_found" });
    const org = db.findOne("organizations", (o) => o.id === orgOf(req));
    const levels = org?.certificationLevels || LEVEL_DEFAULTS;
    const lv = levels.find((x) => x.id === req.params.levelId);
    if (!lv) return res.status(404).json({ error: "level_not_found" });

    const sims = db.find("simulacroAttempts",
      (a) => a.opositorId === opositorId && a.finishedAt && a.score >= lv.minScore);
    if (sims.length < lv.minSimulacros) {
      return res.status(409).json({ error: "criteria_not_met", current: sims.length, target: lv.minSimulacros });
    }
    const existing = db.findOne("certificates", (c) => c.opositorId === opositorId && c.levelId === lv.id);
    if (existing) return res.json({ certificate: existing, alreadyIssued: true });

    const id = "cert_" + crypto.randomBytes(6).toString("hex");
    const verificationCode = crypto.randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g).join("-");
    const cert = db.insert("certificates", {
      id,
      organizationId: orgOf(req),
      opositorId,
      opositorName: opo.name,
      levelId: lv.id,
      levelLabel: lv.label,
      criteria: { minSimulacros: lv.minSimulacros, minScore: lv.minScore },
      simulacrosUsed: sims.slice(-lv.minSimulacros).map((s) => s.id),
      issuedAt: new Date().toISOString(),
      verificationCode,
      revokedAt: null,
    });
    res.json({ certificate: cert });
  });

  // GET /certifications/:id — vista del certificado (verificable)
  // Ruta pública: cualquiera con el ID + código puede comprobarlo.
  r.get("/certifications/:id", (req, res) => {
    const cert = db.findOne("certificates", (c) => c.id === req.params.id);
    if (!cert) return res.status(404).json({ error: "not_found" });
    if (cert.revokedAt) return res.json({ certificate: cert, revoked: true });
    // Si llega un código de verificación, comprobamos
    const code = req.query.code;
    const verified = code && code === cert.verificationCode;
    const org = db.findOne("organizations", (o) => o.id === cert.organizationId);
    res.json({
      certificate: cert,
      organization: { name: org?.name, branding: org?.branding },
      verified: !!verified,
    });
  });

  // GET /certifications/:id/render?code=... — SVG del certificado
  r.get("/certifications/:id/render", (req, res) => {
    const cert = db.findOne("certificates", (c) => c.id === req.params.id);
    if (!cert) return res.status(404).send("Not found");
    const org = db.findOne("organizations", (o) => o.id === cert.organizationId);
    const svg = renderCertificateSvg({ cert, org });
    res.set("Content-Type", "image/svg+xml");
    res.send(svg);
  });

  // POST /certifications/:id/revoke — admin revoca un certificado
  r.post("/certifications/:id/revoke", auth.requireRole("admin", "superadmin"), (req, res) => {
    const cert = db.findOne("certificates", (c) => c.id === req.params.id && c.organizationId === orgOf(req));
    if (!cert) return res.status(404).json({ error: "not_found" });
    const updated = db.update("certificates", (c) => c.id === cert.id, {
      revokedAt: new Date().toISOString(),
      revokedReason: req.body?.reason || "",
    });
    res.json({ certificate: updated });
  });

  return r;
};

function renderCertificateSvg({ cert, org }) {
  const branding = org?.branding || {};
  const primary = branding.primaryColor || "#155ea8";
  const accent = branding.accentColor || "#0c8f6f";
  const orgName = org?.name || "OpoPlan";
  const issued = new Date(cert.issuedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 877" width="1240" height="877">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${primary}"/>
      <stop offset="1" stop-color="${darken(primary, 0.35)}"/>
    </linearGradient>
  </defs>
  <rect width="1240" height="877" fill="${darken(primary, 0.55)}"/>
  <rect x="40" y="40" width="1160" height="797" fill="white" stroke="url(#bg)" stroke-width="6"/>
  <rect x="60" y="60" width="1120" height="80" fill="url(#bg)"/>
  <text x="620" y="115" font-family="Georgia, serif" font-size="38" font-weight="700" fill="white" text-anchor="middle">CERTIFICADO DE NIVEL · ${esc(cert.levelLabel.toUpperCase())}</text>
  <text x="620" y="220" font-family="Inter, Arial, sans-serif" font-size="22" fill="#444" text-anchor="middle">Se certifica que</text>
  <text x="620" y="290" font-family="Georgia, serif" font-size="56" font-weight="800" fill="${primary}" text-anchor="middle">${esc(cert.opositorName)}</text>
  <text x="620" y="360" font-family="Inter, Arial, sans-serif" font-size="20" fill="#444" text-anchor="middle">ha alcanzado el</text>
  <text x="620" y="420" font-family="Georgia, serif" font-size="42" font-weight="700" fill="${accent}" text-anchor="middle">${esc(cert.levelLabel)}</text>
  <text x="620" y="475" font-family="Inter, Arial, sans-serif" font-size="18" fill="#666" text-anchor="middle">superando ${cert.criteria.minSimulacros} simulacros con una nota mínima de ${cert.criteria.minScore}/10</text>

  <line x1="200" y1="640" x2="500" y2="640" stroke="#888" stroke-width="1"/>
  <text x="350" y="665" font-family="Inter, Arial, sans-serif" font-size="14" fill="#666" text-anchor="middle">Emitido por ${esc(orgName)}</text>
  <text x="350" y="685" font-family="Inter, Arial, sans-serif" font-size="13" fill="#999" text-anchor="middle">${esc(issued)}</text>

  <line x1="740" y1="640" x2="1040" y2="640" stroke="#888" stroke-width="1"/>
  <text x="890" y="665" font-family="Inter, Arial, sans-serif" font-size="14" fill="#666" text-anchor="middle">Verificación</text>
  <text x="890" y="685" font-family="monospace" font-size="13" fill="#444" text-anchor="middle">${esc(cert.verificationCode)}</text>

  <text x="620" y="780" font-family="Inter, Arial, sans-serif" font-size="11" fill="#aaa" text-anchor="middle">Este certificado no tiene valor oficial. Es una acreditación interna del progreso del opositor.</text>
  <text x="620" y="800" font-family="Inter, Arial, sans-serif" font-size="11" fill="#aaa" text-anchor="middle">ID: ${esc(cert.id)}</text>
</svg>`;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function darken(hex, factor) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return "#000000";
  const r = Math.round(parseInt(m[1], 16) * (1 - factor));
  const g = Math.round(parseInt(m[2], 16) * (1 - factor));
  const b = Math.round(parseInt(m[3], 16) * (1 - factor));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
