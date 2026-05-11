const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const rag = require("../lib/rag");

// Endpoints del RAG (catálogo §A.10.5).
//
// El admin pulsa "Reindexar" cuando ha actualizado el corpus. La operación
// es idempotente (limpia todos los chunks anteriores de la organización
// antes de insertar los nuevos).

module.exports = function ragRoutes({ env } = {}) {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }
  function isAdmin(req) { return ["admin", "superadmin"].includes(req.user.role); }

  // GET /rag/status — cuántos chunks tiene la academia indexados
  r.get("/rag/status", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const chunks = db.find("ragChunks", (c) => c.organizationId === orgOf(req));
    const byKind = {};
    for (const c of chunks) {
      const k = c.source?.kind || "other";
      byKind[k] = (byKind[k] || 0) + 1;
    }
    const sample = chunks[0];
    res.json({
      indexed: chunks.length,
      byKind,
      provider: sample?.embeddingProvider || null,
      model: sample?.embeddingModel || null,
      lastIndexedAt: chunks.reduce((acc, c) =>
        (!acc || c.createdAt > acc) ? c.createdAt : acc, null),
    });
  });

  // POST /rag/reindex — admin recalcula embeddings del corpus completo
  r.post("/rag/reindex", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    try {
      const result = await rag.reindexOrg({ orgId: orgOf(req), env: env || process.env });
      res.json(result);
    } catch (e) {
      console.error("[rag:reindex]", e);
      res.status(500).json({ error: "reindex_failed", message: e.message });
    }
  });

  // POST /rag/search — búsqueda manual (debug / test desde el panel admin)
  r.post("/rag/search", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const query = (req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "missing_query" });
    try {
      const result = await rag.retrieve({
        orgId: orgOf(req), query,
        user: req.user, env: env || process.env,
        k: Number(req.body?.k) || 5,
      });
      res.json(result);
    } catch (e) {
      console.error("[rag:search]", e);
      res.status(500).json({ error: "search_failed", message: e.message });
    }
  });

  return r;
};
