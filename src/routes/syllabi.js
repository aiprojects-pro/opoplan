const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");

// ─────────────────────────────────────────────────────────────────────────────
// Temarios: el preparador organiza temas en bloques y a cada tema puede
// adjuntar PDF/audio/vídeo (se suben previamente vía /api/files/upload y se
// referencian aquí por su `fileId`).
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function syllabiRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  // GET temario completo (visible para preparador propio, admin/super, o el
  // opositor asignado a ese preparador)
  r.get("/syllabi/:id", (req, res) => {
    const s = db.findOne("syllabi", (x) => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: "not_found" });
    if (!canSeeSyllabus(req.user, s)) return res.status(403).json({ error: "forbidden" });
    // Resolvemos los adjuntos a metadata útil
    const expanded = {
      ...s,
      topics: (s.topics || []).map((t) => ({
        ...t,
        attachments: (t.attachments || []).map((a) => ({
          ...a,
          downloadUrl: `/api/files/download/${a.fileId}`,
        })),
      })),
    };
    res.json({ syllabus: expanded });
  });

  // PATCH temario (título, descripción, oposición, etc.)
  r.patch("/syllabi/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const s = db.findOne("syllabi", (x) => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: "not_found" });
    if (!canEditSyllabus(req.user, s)) return res.status(403).json({ error: "forbidden" });
    const updated = db.update("syllabi", (x) => x.id === s.id, {
      title: req.body.title ?? s.title,
      description: req.body.description ?? s.description,
      examName: req.body.examName ?? s.examName,
    });
    res.json({ syllabus: updated });
  });

  // PATCH un tema concreto
  r.patch("/syllabi/:syllabusId/topics/:topicId", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const s = db.findOne("syllabi", (x) => x.id === req.params.syllabusId);
    if (!s) return res.status(404).json({ error: "not_found" });
    if (!canEditSyllabus(req.user, s)) return res.status(403).json({ error: "forbidden" });
    const idx = (s.topics || []).findIndex((t) => t.id === req.params.topicId);
    if (idx < 0) return res.status(404).json({ error: "topic_not_found" });
    s.topics[idx] = { ...s.topics[idx], ...req.body };
    db.update("syllabi", (x) => x.id === s.id, { topics: s.topics });
    res.json({ topic: s.topics[idx] });
  });

  // DELETE un tema completo
  r.delete("/syllabi/:syllabusId/topics/:topicId", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const s = db.findOne("syllabi", (x) => x.id === req.params.syllabusId);
    if (!s) return res.status(404).json({ error: "not_found" });
    if (!canEditSyllabus(req.user, s)) return res.status(403).json({ error: "forbidden" });
    const before = (s.topics || []).length;
    s.topics = (s.topics || []).filter((t) => t.id !== req.params.topicId);
    if (s.topics.length === before) return res.status(404).json({ error: "topic_not_found" });
    db.update("syllabi", (x) => x.id === s.id, { topics: s.topics });
    res.json({ ok: true });
  });

  // POST adjuntar archivo a un tema (el archivo ya debe estar subido)
  r.post("/syllabi/:syllabusId/topics/:topicId/attachments", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const s = db.findOne("syllabi", (x) => x.id === req.params.syllabusId);
    if (!s) return res.status(404).json({ error: "not_found" });
    if (!canEditSyllabus(req.user, s)) return res.status(403).json({ error: "forbidden" });

    const { fileId, label, kind } = req.body || {};
    if (!fileId) return res.status(400).json({ error: "missing_fileId" });
    const file = db.findOne("files", (f) => f.id === fileId);
    if (!file) return res.status(404).json({ error: "file_not_found" });

    const topic = (s.topics || []).find((t) => t.id === req.params.topicId);
    if (!topic) return res.status(404).json({ error: "topic_not_found" });
    topic.attachments = topic.attachments || [];

    const attachment = {
      id: db.id("at"),
      fileId,
      label: label || file.originalName,
      kind: kind || guessKind(file.contentType),
      contentType: file.contentType,
      size: file.size,
      addedAt: new Date().toISOString(),
    };
    topic.attachments.push(attachment);
    db.update("syllabi", (x) => x.id === s.id, { topics: s.topics });
    res.json({ attachment });
  });

  // DELETE adjunto
  r.delete(
    "/syllabi/:syllabusId/topics/:topicId/attachments/:attId",
    auth.requireRole("preparador", "admin", "superadmin"),
    (req, res) => {
      const s = db.findOne("syllabi", (x) => x.id === req.params.syllabusId);
      if (!s) return res.status(404).json({ error: "not_found" });
      if (!canEditSyllabus(req.user, s)) return res.status(403).json({ error: "forbidden" });
      const topic = (s.topics || []).find((t) => t.id === req.params.topicId);
      if (!topic) return res.status(404).json({ error: "topic_not_found" });
      const before = (topic.attachments || []).length;
      topic.attachments = (topic.attachments || []).filter((a) => a.id !== req.params.attId);
      if (topic.attachments.length === before) return res.status(404).json({ error: "attachment_not_found" });
      db.update("syllabi", (x) => x.id === s.id, { topics: s.topics });
      res.json({ ok: true });
    },
  );

  return r;

  // ── helpers locales ────────────────────────────────────────────────────────

  function canSeeSyllabus(user, syllabus) {
    if (user.role === "admin" || user.role === "superadmin") {
      if (user.organizationId && syllabus.organizationId !== user.organizationId) return false;
      return true;
    }
    if (user.role === "preparador") return syllabus.preparadorId === user.id;
    if (user.role === "opositor") {
      const a = db.findOne("assignments", (x) => x.opositorId === user.id && x.active);
      return a && a.preparadorId === syllabus.preparadorId;
    }
    return false;
  }

  function canEditSyllabus(user, syllabus) {
    if (user.role === "admin" || user.role === "superadmin") return user.organizationId == null || syllabus.organizationId === user.organizationId;
    if (user.role === "preparador") return syllabus.preparadorId === user.id;
    return false;
  }

  function guessKind(contentType) {
    if (!contentType) return "documento";
    if (contentType.startsWith("application/pdf")) return "pdf";
    if (contentType.startsWith("audio/")) return "audio";
    if (contentType.startsWith("video/")) return "video";
    if (contentType.startsWith("image/")) return "imagen";
    if (contentType.startsWith("text/")) return "texto";
    return "documento";
  }
};
