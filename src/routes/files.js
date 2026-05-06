const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const storageService = require("../services/storage");

// ─────────────────────────────────────────────────────────────────────────────
// Subida y descarga de archivos. Multer en memoria; el body lo manda al
// adapter de storage (R2/S3 o local).
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function filesRoutes({ storage, appUrl }) {
  const r = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });

  // Subir archivo. kind: "topic" | "correction" | "material" | "logo" | "photo"
  r.post("/upload", auth.requireAuth, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const orgId = req.user.organizationId || "platform";
    const kind = req.body.kind || "misc";
    const key = storageService.buildKey(orgId, kind, req.file.originalname);
    try {
      const out = await storage.put({
        key,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });
      const meta = db.insert("files", {
        id: db.id("f"),
        organizationId: orgId === "platform" ? null : orgId,
        kind,
        ownerId: req.user.id,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        key: out.key,
        url: out.url,
        provider: storage.provider,
        createdAt: new Date().toISOString(),
      });
      res.json({ file: meta });
    } catch (e) {
      console.error("[files:upload]", e);
      res.status(500).json({ error: "upload_failed", details: e.message });
    }
  });

  // Descargar archivo (genera URL firmada si está en cloud, o sirve directo)
  r.get("/download/:id", auth.requireAuth, async (req, res) => {
    const meta = db.findOne("files", (f) => f.id === req.params.id);
    if (!meta) return res.status(404).json({ error: "not_found" });
    // Aislamiento por org (excepto super-admin)
    if (req.user.role !== "superadmin" && meta.organizationId && meta.organizationId !== req.user.organizationId) {
      return res.status(403).json({ error: "forbidden" });
    }
    if (storage.provider !== "local") {
      const url = await storage.getSignedUrl(meta.key, 600);
      return res.redirect(url);
    }
    // Local: stream directo
    try {
      const out = await storage.get(meta.key);
      res.setHeader("Content-Type", meta.contentType || out.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${meta.originalName}"`);
      out.stream.pipe(res);
    } catch (e) {
      res.status(404).json({ error: "not_found" });
    }
  });

  return r;
};
