// ─────────────────────────────────────────────────────────────────────────────
// Servicio de IA. Soporta tres proveedores (Gemini, OpenAI, Anthropic).
// El opositor o el preparador pueden aportar su propia API key (transcripción
// ~20:53). El coste lo asume el usuario, no la academia.
//
// Estrategia de selección (de mayor a menor prioridad):
//   1. Si el USUARIO tiene su propia integración activa → usa su clave.
//   2. Si la ACADEMIA tiene integración activa → usa la suya.
//   3. Si hay variables de entorno globales → fallback de plataforma.
//   4. Mock con aviso.
// ─────────────────────────────────────────────────────────────────────────────

function makeMock(reason = "no_provider") {
  return {
    provider: "mock",
    reason,
    async ask({ prompt }) {
      return {
        text:
          "Respuesta simulada. Para activar una IA real puedes (a) configurarla en tu perfil personal con tu propia clave, o (b) pedirle a tu academia que la configure.",
        mocked: true,
      };
    },
  };
}

function makeGemini({ apiKey, model }) {
  return {
    provider: "gemini",
    model: model || "gemini-1.5-flash",
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
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[ai:gemini] error", res.status, err);
        return { text: "(Error al consultar Gemini. Revisa la API key.)", error: err };
      }
      const data = await res.json();
      const text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ||
        "(Sin respuesta de Gemini.)";
      return { text };
    },
  };
}

function makeOpenAI({ apiKey, model }) {
  const m = model || "gpt-4o-mini";
  return {
    provider: "openai",
    model: m,
    async ask({ system, prompt, history = [] }) {
      const url = "https://api.openai.com/v1/chat/completions";
      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      for (const turn of history) {
        messages.push({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.text });
      }
      messages.push({ role: "user", content: prompt });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: m, messages, temperature: 0.4, max_tokens: 2048 }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[ai:openai] error", res.status, err);
        return { text: "(Error al consultar OpenAI. Revisa la API key.)", error: err };
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "(Sin respuesta de OpenAI.)";
      return { text };
    },
  };
}

function makeAnthropic({ apiKey, model }) {
  const m = model || "claude-3-5-sonnet-latest";
  return {
    provider: "anthropic",
    model: m,
    async ask({ system, prompt, history = [] }) {
      const url = "https://api.anthropic.com/v1/messages";
      const messages = [];
      for (const turn of history) {
        messages.push({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.text });
      }
      messages.push({ role: "user", content: prompt });
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: m,
          max_tokens: 2048,
          ...(system ? { system } : {}),
          messages,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[ai:anthropic] error", res.status, err);
        return { text: "(Error al consultar Claude. Revisa la API key.)", error: err };
      }
      const data = await res.json();
      const text = data.content?.[0]?.text || "(Sin respuesta de Claude.)";
      return { text };
    },
  };
}

function makeProvider(cfg) {
  if (!cfg || !cfg.apiKey) return null;
  const provider = (cfg.provider || "gemini").toLowerCase();
  if (provider === "openai") return makeOpenAI({ apiKey: cfg.apiKey, model: cfg.model });
  if (provider === "anthropic") return makeAnthropic({ apiKey: cfg.apiKey, model: cfg.model });
  return makeGemini({ apiKey: cfg.apiKey, model: cfg.model });
}

function fromEnv(env) {
  const provider = (env.AI_PROVIDER || "mock").toLowerCase();
  if (provider === "gemini" && env.GEMINI_API_KEY) {
    return makeGemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  }
  if (provider === "openai" && env.OPENAI_API_KEY) {
    return makeOpenAI({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL });
  }
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) {
    return makeAnthropic({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
  }
  return makeMock("no_env");
}

function fromOrg(org, fallback) {
  const cfg = org && org.integrations && org.integrations.ai;
  if (!cfg || !cfg.enabled) return fallback;
  const p = makeProvider(cfg);
  return p || fallback;
}

// IA personal del usuario (transcripción ~20:53). Si el opositor o preparador
// han activado su integración, la usamos. Si no, caemos al fallback (academia).
function fromUser(user, fallback) {
  const cfg = user && user.ai;
  if (!cfg || !cfg.enabled) return fallback;
  const p = makeProvider(cfg);
  return p || fallback;
}

module.exports = { fromEnv, fromOrg, fromUser, makeMock, makeGemini, makeOpenAI, makeAnthropic, makeProvider };
