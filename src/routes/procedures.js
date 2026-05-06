const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const { PROCEDURE_CATALOG } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// Trámites administrativos del opositor.
// El opositor parte del catálogo predefinido y "instala" los que necesita.
// Cada trámite se edita después: estado, fecha límite, notas y archivo.
//
// Estados: pendiente | en curso | completado | urgente
// ─────────────────────────────────────────────────────────────────────────────

const VALID_STATES = ["pendiente", "en curso", "completado", "urgente"];

module.exports = function proceduresRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  // Catálogo (todos lo ven; el opositor lo usa para instalar)
  r.get("/procedures/catalog", (req, res) => {
    res.json({ catalog: PROCEDURE_CATALOG });
  });

  // Lista de trámites: opositor ve los suyos, preparador ve los de sus opositores
  r.get("/procedures", (req, res) => {
    const orgId = req.user.organizationId;
    let list = db.find("procedures", (p) => p.organizationId === orgId);
    if (req.user.role === "opositor") {
      list = list.filter((p) => p.opositorId === req.user.id);
    } else if (req.user.role === "preparador") {
      const myOpos = db
        .find("assignments", (x) => x.preparadorId === req.user.id && x.active)
        .map((x) => x.opositorId);
      list = list.filter((p) => myOpos.includes(p.opositorId));
    }
    if (req.query.opositorId) list = list.filter((p) => p.opositorId === req.query.opositorId);

    // Enriquecer con archivo si existe
    const enriched = list.map((p) => {
      const f = p.fileId ? db.findOne("files", (x) => x.id === p.fileId) : null;
      return { ...p, downloadUrl: f ? `/api/files/download/${f.id}` : null, fileName: f?.originalName };
    });

    res.json({ procedures: enriched });
  });

  // Instalar un trámite del catálogo
  r.post("/procedures/install", auth.requireRole("opositor", "preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const { code, opositorId, deadline, notes } = req.body || {};
    const tpl = PROCEDURE_CATALOG.find((t) => t.code === code);
    if (!tpl) return res.status(400).json({ error: "code_not_in_catalog" });

    const targetOpo = req.user.role === "opositor" ? req.user.id : opositorId;
    if (!targetOpo) return res.status(400).json({ error: "missing_opositor" });

    const proc = db.insert("procedures", {
      id: db.id("tr"),
      organizationId: orgId,
      opositorId: targetOpo,
      code: tpl.code,
      title: tpl.title,
      description: tpl.description,
      icon: tpl.icon,
      category: tpl.category,
      requiresFile: tpl.requiresFile,
      deadline: deadline || "",
      status: "pendiente",
      notes: notes || "",
      fileId: null,
      createdAt: new Date().toISOString(),
    });
    res.json({ procedure: proc });
  });

  // Crear trámite manual (sin catálogo)
  r.post("/procedures", (req, res) => {
    const orgId = req.user.organizationId;
    const { title, description, deadline, notes, opositorId, category } = req.body || {};
    if (!title) return res.status(400).json({ error: "missing_title" });
    const targetOpo = req.user.role === "opositor" ? req.user.id : opositorId;
    if (!targetOpo) return res.status(400).json({ error: "missing_opositor" });
    const proc = db.insert("procedures", {
      id: db.id("tr"),
      organizationId: orgId,
      opositorId: targetOpo,
      code: null,
      title,
      description: description || "",
      icon: "📌",
      category: category || "personalizado",
      requiresFile: false,
      deadline: deadline || "",
      status: "pendiente",
      notes: notes || "",
      fileId: null,
      createdAt: new Date().toISOString(),
    });
    res.json({ procedure: proc });
  });

  r.patch("/procedures/:id", (req, res) => {
    const p = db.findOne("procedures", (x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, p)) return res.status(403).json({ error: "forbidden" });

    const allowed = ["title", "description", "deadline", "status", "notes", "fileId", "category"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (patch.status && !VALID_STATES.includes(patch.status)) return res.status(400).json({ error: "invalid_status" });
    const updated = db.update("procedures", (x) => x.id === p.id, patch);
    res.json({ procedure: updated });
  });

  r.delete("/procedures/:id", (req, res) => {
    const p = db.findOne("procedures", (x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, p)) return res.status(403).json({ error: "forbidden" });
    db.remove("procedures", (x) => x.id === p.id);
    res.json({ ok: true });
  });

  return r;

  function canSee(user, p) {
    if (user.role === "admin" || user.role === "superadmin") return p.organizationId === user.organizationId || !user.organizationId;
    if (user.role === "opositor") return p.opositorId === user.id;
    if (user.role === "preparador") {
      const a = db.findOne("assignments", (x) => x.opositorId === p.opositorId && x.active);
      return a && a.preparadorId === user.id;
    }
    return false;
  }
};
