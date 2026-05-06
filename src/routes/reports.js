const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const aiService = require("../services/ai");

// ─────────────────────────────────────────────────────────────────────────────
// Informes con recomendaciones generadas por IA.
// El preparador pulsa "Generar informe" sobre un opositor y recibe un texto
// con análisis + sugerencias. Si no hay IA configurada, se devuelve un
// informe heurístico generado localmente (sin LLM).
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function reportsRoutes({ env }) {
  const r = express.Router();
  r.use(auth.requireAuth);

  function getAi(orgId) {
    const fallback = aiService.fromEnv(env || process.env);
    const org = db.findOne("organizations", (o) => o.id === orgId);
    return aiService.fromOrg(org, fallback);
  }

  // Genera informe del opositor (preparador o admin)
  r.post(
    "/reports/opositor/:opositorId",
    auth.requireRole("preparador", "admin", "superadmin"),
    async (req, res) => {
      const opo = db.findOne("users", (u) => u.id === req.params.opositorId && u.role === "opositor");
      if (!opo) return res.status(404).json({ error: "not_found" });

      // Verificar acceso si es preparador
      if (req.user.role === "preparador") {
        const a = db.findOne("assignments", (x) => x.opositorId === opo.id && x.active);
        if (!a || a.preparadorId !== req.user.id) return res.status(403).json({ error: "forbidden" });
      }

      const data = collectOpositorData(opo);
      const heuristic = heuristicReport(data);

      const ai = getAi(req.user.organizationId);
      const system = "Eres un preparador de oposiciones experimentado. Genera un informe claro y útil para el preparador, con análisis del progreso y recomendaciones concretas. Sé específico (cita temas, semanas, notas). No inventes datos. Estructura: 1) Resumen, 2) Fortalezas, 3) Áreas de mejora, 4) Recomendaciones concretas (3-5 acciones).";
      const prompt = `Datos del opositor:\n${formatDataForPrompt(data)}\n\nGenera el informe en castellano, máximo 400 palabras, en formato markdown con cabeceras ##.`;

      let aiText;
      try {
        const r = await ai.ask({ system, prompt });
        aiText = r.text;
      } catch (e) {
        console.error("[reports:ai]", e);
        aiText = null;
      }

      res.json({
        opositor: { id: opo.id, name: opo.name, email: opo.email },
        data,
        heuristic,
        aiReport: aiText,
        generatedAt: new Date().toISOString(),
        provider: ai.provider,
      });
    },
  );

  return r;

  function collectOpositorData(opo) {
    const assessments = db.find("assessments", (a) => a.opositorId === opo.id);
    const corrections = db.find("corrections", (c) => c.opositorId === opo.id);
    const habits = db.find("habits", (h) => h.opositorId === opo.id);
    const plans = db.find("plans", (p) => p.opositorId === opo.id);
    const progress = db.find("progress", (p) => p.opositorId === opo.id);
    return {
      commitment: opo.commitment || {},
      assessments: assessments.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
      corrections,
      habits: habits.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
      plan: plans[0] || null,
      progress,
    };
  }

  function formatDataForPrompt(d) {
    const lines = [];
    if (d.commitment.examName) lines.push(`Oposición: ${d.commitment.examName}`);
    if (d.commitment.examDate) lines.push(`Fecha objetivo: ${d.commitment.examDate}`);
    if (d.commitment.weeklyHours) lines.push(`Compromiso: ${d.commitment.weeklyHours}h/semana`);

    if (d.assessments.length) {
      lines.push("\nÚltimas pruebas:");
      d.assessments.slice(0, 6).forEach((a) =>
        lines.push(`  - [${a.date}] ${a.type}: ${a.title} → ${a.score ?? "?"}/${a.maxScore || 10} (${a.topic || "—"})`),
      );
    }
    if (d.corrections.length) {
      lines.push("\nCorrecciones:");
      d.corrections.slice(0, 5).forEach((c) =>
        lines.push(`  - ${c.title}: status=${c.status}${c.totalScore != null ? `, nota ${c.totalScore}/10` : ""}`),
      );
    }
    if (d.progress.length) {
      lines.push("\nProgreso por tema:");
      d.progress.forEach((p) =>
        lines.push(`  - ${p.topicId}: dominio ${p.mastery}%, status ${p.status}`),
      );
    }
    return lines.join("\n");
  }

  function heuristicReport(d) {
    const s = { strengths: [], weaknesses: [], recommendations: [] };
    if (d.assessments.length) {
      const avg = d.assessments.reduce((acc, a) => acc + ((a.score || 0) / (a.maxScore || 10)) * 10, 0) / d.assessments.length;
      const fail = d.assessments.filter((a) => ((a.score || 0) / (a.maxScore || 10)) < 0.5);
      const ok = d.assessments.filter((a) => ((a.score || 0) / (a.maxScore || 10)) >= 0.7);
      if (ok.length) s.strengths.push(`Buen rendimiento en ${ok.length} prueba(s) recientes (≥7/10)`);
      if (fail.length) s.weaknesses.push(`${fail.length} prueba(s) por debajo de 5/10 — atención prioritaria`);
      s.recommendations.push(`Nota media reciente: ${avg.toFixed(1)}/10 — ${avg >= 7 ? "mantener ritmo" : avg >= 5 ? "reforzar áreas débiles" : "replantear estrategia"}.`);
    }
    if (d.progress.length) {
      const critical = d.progress.filter((p) => p.mastery < 50);
      if (critical.length) s.weaknesses.push(`${critical.length} tema(s) con dominio < 50%`);
    }
    if (d.habits.length) {
      const partial = d.habits.filter((h) => h.planCompliance === "partial").length;
      const none = d.habits.filter((h) => h.planCompliance === "none").length;
      if (none > 0) s.weaknesses.push(`${none} sesión(es) sin cumplir el plan en el histórico`);
      if (partial > 0) s.recommendations.push(`Hay ${partial} sesión(es) parciales: revisar bloques demasiado largos.`);
    }
    return s;
  }
};
