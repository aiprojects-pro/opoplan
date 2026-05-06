const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const { MATERIAL_CATEGORIES } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// Biblioteca clasificada de materiales.
//
// Modelo:
//   materials = {
//     id, organizationId, preparadorId,
//     category: "temario_oficial" | "complementario" | "examen" | "planificacion" | "plantilla",
//     title, topic, description,
//     fileId,                               // archivo en /api/files
//     visibility: "all" | "specific",       // all = todos los opositores
//     audienceIds: ["u_opo_1", ...]         // si visibility="specific"
//     status: "actualizado" | "compartido" | "borrador",
//     downloads: number, viewedBy: [opositorId, ...]
//     createdAt, updatedAt
//   }
//
// El opositor solo ve materiales de SU preparador asignado, donde
// visibility="all" o audienceIds contiene su id.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = MATERIAL_CATEGORIES.map((c) => c.id);

module.exports = function materialsRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  // ── Listado ────────────────────────────────────────────────────────────────

  r.get("/materials", (req, res) => {
    const orgId = req.user.organizationId;
    let list = db.find("materials", (m) => m.organizationId === orgId);

    if (req.user.role === "preparador") {
      list = list.filter((m) => m.preparadorId === req.user.id);
    } else if (req.user.role === "opositor") {
      // Solo materiales del preparador asignado y dirigidos al opositor
      const a = db.findOne("assignments", (x) => x.opositorId === req.user.id && x.active);
      if (!a) return res.json({ materials: [], categories: MATERIAL_CATEGORIES });
      list = list.filter((m) =>
        m.preparadorId === a.preparadorId &&
        m.status !== "borrador" &&
        (m.visibility === "all" || (m.audienceIds || []).includes(req.user.id)),
      );
    }

    // Enriquece con datos del archivo y URL de descarga
    const enriched = list.map((m) => {
      const f = m.fileId ? db.findOne("files", (x) => x.id === m.fileId) : null;
      return {
        ...m,
        file: f ? { id: f.id, originalName: f.originalName, contentType: f.contentType, size: f.size } : null,
        downloadUrl: f ? `/api/files/download/${f.id}` : null,
      };
    });

    res.json({ materials: enriched, categories: MATERIAL_CATEGORIES });
  });

  // ── Crear ──────────────────────────────────────────────────────────────────

  r.post("/materials", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const { category, title, topic, description, fileId, visibility, audienceIds, status } = req.body || {};
    if (!title || !category) return res.status(400).json({ error: "missing_fields" });
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: "invalid_category" });

    let file = null;
    if (fileId) {
      file = db.findOne("files", (f) => f.id === fileId);
      if (!file) return res.status(404).json({ error: "file_not_found" });
    }

    const material = db.insert("materials", {
      id: db.id("m"),
      organizationId: orgId,
      preparadorId: req.user.role === "preparador" ? req.user.id : (req.body.preparadorId || null),
      category,
      title,
      topic: topic || "",
      description: description || "",
      fileId: fileId || null,
      visibility: visibility === "specific" ? "specific" : "all",
      audienceIds: visibility === "specific" ? (audienceIds || []) : [],
      status: status || "compartido",
      type: file ? guessType(file.contentType) : (req.body.type || "Recurso"),
      downloads: 0,
      viewedBy: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    res.json({ material });
  });

  // ── Editar ─────────────────────────────────────────────────────────────────

  r.patch("/materials/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const m = db.findOne("materials", (x) => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: "not_found" });
    if (!canEditMaterial(req.user, m)) return res.status(403).json({ error: "forbidden" });

    const allowed = ["category", "title", "topic", "description", "fileId", "visibility", "audienceIds", "status", "type"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    patch.updatedAt = new Date().toISOString().slice(0, 10);
    if (patch.category && !VALID_CATEGORIES.includes(patch.category)) return res.status(400).json({ error: "invalid_category" });
    if (patch.visibility !== undefined && patch.visibility !== "specific") patch.audienceIds = [];
    const updated = db.update("materials", (x) => x.id === m.id, patch);
    res.json({ material: updated });
  });

  // ── Borrar ─────────────────────────────────────────────────────────────────

  r.delete("/materials/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const m = db.findOne("materials", (x) => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: "not_found" });
    if (!canEditMaterial(req.user, m)) return res.status(403).json({ error: "forbidden" });
    db.remove("materials", (x) => x.id === m.id);
    res.json({ ok: true });
  });

  // ── Tracking de descarga (lo registra el opositor al pulsar) ──────────────

  r.post("/materials/:id/track-download", auth.requireRole("opositor"), (req, res) => {
    const m = db.findOne("materials", (x) => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: "not_found" });
    // Comprueba visibilidad
    if (m.organizationId !== req.user.organizationId) return res.status(403).json({ error: "forbidden" });
    const viewedBy = Array.from(new Set([...(m.viewedBy || []), req.user.id]));
    db.update("materials", (x) => x.id === m.id, {
      downloads: (m.downloads || 0) + 1,
      viewedBy,
    });
    res.json({ ok: true });
  });

  return r;

  function canEditMaterial(user, material) {
    if (user.role === "admin" || user.role === "superadmin") return material.organizationId === user.organizationId || !user.organizationId;
    if (user.role === "preparador") return material.preparadorId === user.id;
    return false;
  }

  function guessType(ct) {
    if (!ct) return "Recurso";
    if (ct.startsWith("application/pdf")) return "PDF";
    if (ct.startsWith("audio/")) return "Audio";
    if (ct.startsWith("video/")) return "Vídeo";
    if (ct.startsWith("image/")) return "Imagen";
    if (ct.includes("word")) return "Documento";
    if (ct.includes("excel") || ct.includes("sheet")) return "Hoja";
    return "Recurso";
  }
};
