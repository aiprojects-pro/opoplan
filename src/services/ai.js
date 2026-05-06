// ─────────────────────────────────────────────────────────────────────────────
// Servicio de IA. Por defecto Google Gemini (free tier 15 req/min, 1M tokens
// al día). Usado para:
//   - Chatbot por opositor (Fase 4)
//   - Recomendaciones automáticas en informes
//   - Recálculo inteligente de la planificación
// Diseñado para sustituirse fácilmente por Anthropic, OpenAI, etc.
// ─────────────────────────────────────────────────────────────────────────────

function makeMock() {
  return {
    provider: "mock",
    async ask({ system, prompt }) {
      return {
        text:
          "Respuesta simulada: para activar el chatbot real, configura GEMINI_API_KEY en el .env o desde Configuración → Integraciones → IA en el panel de administrador.",
        mocked: true,
      };
    },
  };
}

function makeGemini({ apiKey, model }) {
  return {
    provider: "gemini",
    async ask({ system, prompt, history = [] }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-1.5-flash"}:generateContent?key=${apiKey}`;
      const contents = [];
      for (const turn of history) {
        contents.push({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.text }] });
      }
      contents.push({ role: "user", parts: [{ text: prompt }] });
      const body = {
        contents,
        ...(system ? { systemInstruction: { role: "system", parts: [{ text: system }] } } : {}),
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[ai:gemini] error", res.status, err);
        return { text: "(Error al consultar la IA. Revisa la API key.)", error: err };
      }
      const data = await res.json();
      const text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ||
        "(Sin respuesta de la IA.)";
      return { text };
    },
  };
}

function fromEnv(env) {
  const provider = (env.AI_PROVIDER || "mock").toLowerCase();
  if (provider === "gemini" && env.GEMINI_API_KEY) {
    return makeGemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  }
  return makeMock();
}

function fromOrg(org, fallback) {
  const cfg = org && org.integrations && org.integrations.ai;
  if (!cfg || !cfg.enabled) return fallback;
  if (cfg.provider === "gemini" && cfg.apiKey) {
    return makeGemini({ apiKey: cfg.apiKey, model: cfg.model });
  }
  return fallback;
}

module.exports = { fromEnv, fromOrg, makeMock, makeGemini };
