const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const crypto = require("crypto");

// Simulacros interacadémicos (catálogo §A.10.4).
//
// Las academias forman alianzas para intercambiar simulacros: los opositores
// de A hacen el simulacro creado por B, y viceversa. Beneficios:
//   - Mayor variedad de preguntas
//   - Percepción de examen externo, más imparcial
//   - Datos comparables entre academias
//
// Este módulo gestiona el ciclo: (1) academia A invita a academia B,
// (2) B acepta, (3) A publica un simulacro al pool de la alianza,
// (4) los opositores de B pueden hacer ese simulacro,
// (5) los resultados se devuelven anonimizados a la academia origen.
//
// Limitación: la facturación entre academias en el catálogo (§A.10.4 menciona
// "la plataforma gestiona la facturación") requeriría Stripe Connect — se
// deja como TODO. En MVP, los simulacros interacadémicos son gratuitos
// dentro de la alianza, y la plataforma puede cobrar una cuota fija a las
// academias por participar.

module.exports = function interAcademicRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }
  function isAdmin(req) { return ["admin", "superadmin"].includes(req.user.role); }

  // GET /alliances/mine — alianzas en las que participa mi academia
  r.get("/alliances/mine", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const alliances = db.find("alliances", (a) => (a.memberOrgIds || []).includes(orgOf(req)));
    const expanded = alliances.map((a) => {
      const members = (a.memberOrgIds || []).map((id) => {
        const o = db.findOne("organizations", (x) => x.id === id);
        return o ? { id: o.id, name: o.name, slug: o.slug } : null;
      }).filter(Boolean);
      return { ...a, members };
    });
    res.json({ alliances: expanded });
  });

  // POST /alliances — crear alianza (yo soy el primer miembro)
  r.post("/alliances", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: "missing_name" });
    const a = db.insert("alliances", {
      id: "all_" + crypto.randomBytes(4).toString("hex"),
      name,
      description: description || "",
      ownerOrgId: orgOf(req),
      memberOrgIds: [orgOf(req)],
      pendingInviteOrgIds: [],
      createdAt: new Date().toISOString(),
      active: true,
    });
    res.json({ alliance: a });
  });

  // POST /alliances/:id/invite — invitar a otra academia (por slug)
  r.post("/alliances/:id/invite", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const alliance = db.findOne("alliances", (a) => a.id === req.params.id);
    if (!alliance) return res.status(404).json({ error: "not_found" });
    if (alliance.ownerOrgId !== orgOf(req)) return res.status(403).json({ error: "only_owner" });
    const slug = req.body?.slug;
    if (!slug) return res.status(400).json({ error: "missing_slug" });
    const target = db.findOne("organizations", (o) => o.slug === slug);
    if (!target) return res.status(404).json({ error: "academy_not_found" });
    if (target.id === orgOf(req)) return res.status(400).json({ error: "cannot_invite_self" });
    if (alliance.memberOrgIds.includes(target.id)) return res.status(409).json({ error: "already_member" });
    if (alliance.pendingInviteOrgIds.includes(target.id)) return res.status(409).json({ error: "already_invited" });
    const updated = db.update("alliances", (a) => a.id === alliance.id, {
      pendingInviteOrgIds: [...alliance.pendingInviteOrgIds, target.id],
    });
    res.json({ alliance: updated, invited: { id: target.id, name: target.name } });
  });

  // GET /alliances/invites — invitaciones pendientes para mi academia
  r.get("/alliances/invites", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const list = db.find("alliances", (a) => (a.pendingInviteOrgIds || []).includes(orgOf(req)));
    const expanded = list.map((a) => {
      const owner = db.findOne("organizations", (o) => o.id === a.ownerOrgId);
      return { id: a.id, name: a.name, description: a.description, ownerName: owner?.name || "" };
    });
    res.json({ invites: expanded });
  });

  // POST /alliances/:id/accept — aceptar invitación
  r.post("/alliances/:id/accept", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const a = db.findOne("alliances", (x) => x.id === req.params.id);
    if (!a || !a.pendingInviteOrgIds.includes(orgOf(req))) return res.status(404).json({ error: "not_invited" });
    const updated = db.update("alliances", (x) => x.id === a.id, {
      memberOrgIds: [...a.memberOrgIds, orgOf(req)],
      pendingInviteOrgIds: a.pendingInviteOrgIds.filter((id) => id !== orgOf(req)),
    });
    res.json({ alliance: updated });
  });

  // POST /alliances/:id/leave — salirse de una alianza (no afecta a propios)
  r.post("/alliances/:id/leave", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const a = db.findOne("alliances", (x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    const updated = db.update("alliances", (x) => x.id === a.id, {
      memberOrgIds: a.memberOrgIds.filter((id) => id !== orgOf(req)),
    });
    res.json({ alliance: updated });
  });

  // POST /alliances/:id/publish-simulacro — publicar un simulacro propio al pool
  // El simulacro se basa en preguntas del banco de la academia origen.
  r.post("/alliances/:id/publish-simulacro", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const a = db.findOne("alliances", (x) => x.id === req.params.id && x.memberOrgIds.includes(orgOf(req)));
    if (!a) return res.status(404).json({ error: "not_member" });
    const { title, processId, questionIds, durationMin = 90 } = req.body || {};
    if (!title || !Array.isArray(questionIds) || !questionIds.length) {
      return res.status(400).json({ error: "missing_fields" });
    }
    // Validar que las preguntas son de la academia
    const qs = db.find("questionBank",
      (q) => q.organizationId === orgOf(req) && questionIds.includes(q.id) && q.active !== false);
    if (qs.length !== questionIds.length) {
      return res.status(400).json({ error: "some_questions_not_owned" });
    }
    const sim = db.insert("crossSimulacros", {
      id: "csim_" + crypto.randomBytes(4).toString("hex"),
      allianceId: a.id,
      sourceOrgId: orgOf(req),
      title,
      processId: processId || null,
      questionIds,
      durationMin: Number(durationMin),
      publishedAt: new Date().toISOString(),
      active: true,
    });
    res.json({ crossSimulacro: sim });
  });

  // GET /alliances/simulacros — simulacros disponibles desde mi alianza
  // Excluye los de mi propia academia (eso ya los puedes hacer normal).
  r.get("/alliances/simulacros", (req, res) => {
    const myOrgId = orgOf(req);
    const myAlliances = db.find("alliances", (a) => (a.memberOrgIds || []).includes(myOrgId));
    const allianceIds = myAlliances.map((a) => a.id);
    const sims = db.find("crossSimulacros",
      (s) => allianceIds.includes(s.allianceId) && s.sourceOrgId !== myOrgId && s.active);
    const expanded = sims.map((s) => {
      const a = myAlliances.find((x) => x.id === s.allianceId);
      const src = db.findOne("organizations", (o) => o.id === s.sourceOrgId);
      return {
        id: s.id,
        title: s.title,
        durationMin: s.durationMin,
        questionsCount: (s.questionIds || []).length,
        publishedAt: s.publishedAt,
        allianceName: a?.name || "",
        sourceAcademyName: src?.name || "",
      };
    });
    res.json({ simulacros: expanded });
  });

  return r;
};
