const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const notifications = require("../services/notifications");

// ─────────────────────────────────────────────────────────────────────────────
// Correcciones con rúbrica.
//
// Estados:
//   pendiente   → preparador la ha asignado, opositor aún no entrega
//   entregado   → opositor ha subido archivo, preparador puede corregir
//   corregido   → preparador ha puntuado y dejado feedback
//   reabierto   → preparador devuelve para nueva entrega
//
// Modelo:
//   {
//     id, organizationId, preparadorId, opositorId,
//     title, instructions, dueDate,
//     rubric: [{ id, name, weight, max?, description? }],
//     status,
//     submissionFileId, submittedAt, submissionNotes,
//     scores: { rubricId: number },
//     totalScore, feedback, correctedAt,
//     createdAt
//   }
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function correctionsRoutes({ appUrl } = {}) {
  const r = express.Router();
  r.use(auth.requireAuth);

  function canSee(user, c) {
    if (user.role === "admin" || user.role === "superadmin") return c.organizationId === user.organizationId || !user.organizationId;
    return c.preparadorId === user.id || c.opositorId === user.id;
  }

  function expand(c) {
    const file = c.submissionFileId ? db.findOne("files", (f) => f.id === c.submissionFileId) : null;
    // Adjuntos a las instrucciones (mejora ~20:21: "se debería poder adjuntar
    // que no se puede ahora mismo... la posibilidad de adjuntar algún
    // documento con las instrucciones").
    const instructionFiles = (c.instructionFileIds || []).map((fid) => {
      const f = db.findOne("files", (x) => x.id === fid);
      return f ? {
        id: f.id, name: f.originalName, size: f.size, contentType: f.contentType,
        downloadUrl: `/api/files/download/${f.id}`,
      } : null;
    }).filter(Boolean);
    return {
      ...c,
      submissionFile: file
        ? { id: file.id, name: file.originalName, size: file.size, contentType: file.contentType }
        : null,
      submissionDownloadUrl: file ? `/api/files/download/${file.id}` : null,
      instructionFiles,
    };
  }

  // ── Listar ────────────────────────────────────────────────────────────────

  r.get("/corrections", (req, res) => {
    const orgId = req.user.organizationId;
    let list = db.find("corrections", (c) => c.organizationId === orgId);
    if (req.user.role === "preparador") list = list.filter((c) => c.preparadorId === req.user.id);
    if (req.user.role === "opositor") list = list.filter((c) => c.opositorId === req.user.id);
    res.json({ corrections: list.map(expand) });
  });

  r.get("/corrections/:id", (req, res) => {
    const c = db.findOne("corrections", (x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, c)) return res.status(403).json({ error: "forbidden" });
    res.json({ correction: expand(c) });
  });

  // ── Crear (preparador asigna ejercicio) ───────────────────────────────────

  r.post("/corrections", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = req.user.organizationId;
    const { opositorId, title, instructions, dueDate, rubric, instructionFileIds } = req.body || {};
    if (!opositorId || !title) return res.status(400).json({ error: "missing_fields" });

    // Validamos la rúbrica: pesos > 0, suma > 0
    const rb = (Array.isArray(rubric) ? rubric : []).map((c, i) => ({
      id: c.id || db.id("rb"),
      name: c.name || `Criterio ${i + 1}`,
      weight: Number(c.weight) || 0,
      max: Number(c.max) || 10,
      description: c.description || "",
    }));
    const totalWeight = rb.reduce((a, c) => a + c.weight, 0);
    if (totalWeight <= 0) return res.status(400).json({ error: "rubric_zero_weight" });

    const correction = db.insert("corrections", {
      id: db.id("co"),
      organizationId: orgId,
      preparadorId: req.user.role === "preparador" ? req.user.id : (req.body.preparadorId || null),
      opositorId,
      title,
      instructions: instructions || "",
      // Adjuntos en instrucciones (~20:21)
      instructionFileIds: Array.isArray(instructionFileIds) ? instructionFileIds : [],
      dueDate: dueDate || "",
      rubric: rb,
      status: "pendiente",
      submissionFileId: null,
      submittedAt: null,
      submissionNotes: "",
      scores: {},
      totalScore: null,
      feedback: "",
      correctedAt: null,
      createdAt: new Date().toISOString(),
    });

    // Aviso al opositor
    notifications
      .notifyUsers({
        orgId,
        userIds: [opositorId],
        template: "announcement",
        data: {
          title: `Nuevo ejercicio: ${title}`,
          body: `Tu preparador te ha asignado un nuevo ejercicio${dueDate ? ` con fecha límite ${dueDate}` : ""}. Puedes entregarlo desde tu panel.`,
        },
        appUrl,
      })
      .catch((e) => console.error("[notify:correction]", e));

    res.json({ correction });
  });

  // ── Editar (preparador) ───────────────────────────────────────────────────

  r.patch("/corrections/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const c = db.findOne("corrections", (x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, c)) return res.status(403).json({ error: "forbidden" });

    const allowed = ["title", "instructions", "instructionFileIds", "dueDate", "rubric"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (patch.rubric) {
      patch.rubric = patch.rubric.map((rc, i) => ({
        id: rc.id || db.id("rb"),
        name: rc.name || `Criterio ${i + 1}`,
        weight: Number(rc.weight) || 0,
        max: Number(rc.max) || 10,
        description: rc.description || "",
      }));
    }
    const updated = db.update("corrections", (x) => x.id === c.id, patch);
    res.json({ correction: expand(updated) });
  });

  // ── Reabrir (preparador devuelve para nueva entrega) ──────────────────────

  r.post("/corrections/:id/reopen", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const c = db.findOne("corrections", (x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, c)) return res.status(403).json({ error: "forbidden" });
    const updated = db.update("corrections", (x) => x.id === c.id, {
      status: "reabierto",
      feedback: req.body?.feedback || c.feedback,
      // Conservamos la entrega anterior y el scoring, pero el opositor puede subir nueva entrega
    });
    notifications.notifyUsers({
      orgId: c.organizationId,
      userIds: [c.opositorId],
      template: "announcement",
      data: {
        title: `Ejercicio reabierto: ${c.title}`,
        body: req.body?.feedback || "Tu preparador te ha devuelto el ejercicio para que lo revises y vuelvas a entregar.",
      },
      appUrl,
    }).catch(() => {});
    res.json({ correction: expand(updated) });
  });

  // ── Entregar (opositor sube archivo) ──────────────────────────────────────

  r.post("/corrections/:id/submit", auth.requireRole("opositor"), (req, res) => {
    const c = db.findOne("corrections", (x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (c.opositorId !== req.user.id) return res.status(403).json({ error: "forbidden" });
    if (c.status === "corregido") return res.status(400).json({ error: "already_corrected" });

    const { fileId, notes } = req.body || {};
    if (!fileId) return res.status(400).json({ error: "missing_fileId" });
    const f = db.findOne("files", (x) => x.id === fileId);
    if (!f) return res.status(404).json({ error: "file_not_found" });

    const updated = db.update("corrections", (x) => x.id === c.id, {
      submissionFileId: fileId,
      submissionNotes: notes || "",
      submittedAt: new Date().toISOString(),
      status: "entregado",
    });

    // Aviso al preparador
    notifications.notifyUsers({
      orgId: c.organizationId,
      userIds: [c.preparadorId],
      template: "announcement",
      data: {
        title: `Entrega recibida: ${c.title}`,
        body: `${req.user.name} ha entregado el ejercicio. Puedes corregirlo desde tu panel.`,
      },
      appUrl,
    }).catch(() => {});

    res.json({ correction: expand(updated) });
  });

  // ── Puntuar (preparador) ──────────────────────────────────────────────────

  r.post("/corrections/:id/score", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const c = db.findOne("corrections", (x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, c)) return res.status(403).json({ error: "forbidden" });
    const { scores, feedback } = req.body || {};
    if (!scores || typeof scores !== "object") return res.status(400).json({ error: "missing_scores" });

    // Calcular nota total ponderada en escala 0-10
    const rubric = c.rubric || [];
    const totalWeight = rubric.reduce((a, r) => a + r.weight, 0) || 1;
    let weighted = 0;
    for (const rc of rubric) {
      const score = Number(scores[rc.id]) || 0;
      const max = rc.max || 10;
      const normalized = (score / max) * 10; // a base 10
      weighted += (normalized * rc.weight) / totalWeight;
    }
    const totalScore = Math.round(weighted * 10) / 10;

    const updated = db.update("corrections", (x) => x.id === c.id, {
      scores,
      totalScore,
      feedback: feedback || "",
      status: "corregido",
      correctedAt: new Date().toISOString(),
    });

    // Aviso al opositor
    notifications.notifyUsers({
      orgId: c.organizationId,
      userIds: [c.opositorId],
      template: "announcement",
      data: {
        title: `Corrección recibida: ${c.title}`,
        body: `Tu preparador ha corregido el ejercicio. Nota: ${totalScore}/10. Puedes ver el detalle en tu panel.`,
      },
      appUrl,
    }).catch(() => {});

    res.json({ correction: expand(updated) });
  });

  // ── Borrar ────────────────────────────────────────────────────────────────

  r.delete("/corrections/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const c = db.findOne("corrections", (x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (!canSee(req.user, c)) return res.status(403).json({ error: "forbidden" });
    db.remove("corrections", (x) => x.id === c.id);
    res.json({ ok: true });
  });

  return r;
};
