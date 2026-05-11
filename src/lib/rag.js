// RAG (Retrieval-Augmented Generation) sobre el corpus propio de cada
// academia para el tutor IA white-label (catálogo §A.10.5).
//
// Cómo funciona:
//   1. La academia indexa su corpus: temarios (`syllabi.topics`), preguntas
//      del banco (`questionBank`) y materiales con contenido textual.
//      Para cada chunk generamos un embedding usando la IA de la academia
//      o del usuario (si su provider expone embeddings).
//   2. Los vectores quedan en `ragChunks` con su payload y embedding.
//   3. Cuando el tutor recibe una pregunta, generamos el embedding de la
//      query, buscamos por cosine similarity los top-K chunks y los
//      inyectamos en el system prompt como contexto.
//
// Honestidad:
//   - Soporte de embeddings: solo Gemini y OpenAI exponen embeddings hoy.
//     Anthropic no tiene endpoint propio — si la academia usa Anthropic,
//     se cae al provider OpenAI/Gemini si está disponible, o a un mock
//     determinista basado en hashing.
//   - Vector store en memoria + persistido en la DB JSON. No escala a
//     decenas de miles de chunks; cuando crezca, migrar a SQLite con la
//     extensión sqlite-vec o a un vector store dedicado.
//   - Chunking simple por palabras (~200 tokens). En producción con corpus
//     grandes conviene chunking semántico.

const db = require("./db");
const crypto = require("node:crypto");

const CHUNK_WORDS = 200;
const CHUNK_OVERLAP = 30;
const TOP_K = 5;

// ── Embeddings ──────────────────────────────────────────────────────────────

async function makeOpenAIEmbedder({ apiKey, model = "text-embedding-3-small" }) {
  return {
    provider: "openai",
    model,
    async embed(texts) {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) throw new Error(`openai_embed_${res.status}`);
      const data = await res.json();
      return data.data.map((d) => d.embedding);
    },
  };
}

async function makeGeminiEmbedder({ apiKey, model = "text-embedding-004" }) {
  return {
    provider: "gemini",
    model,
    async embed(texts) {
      // Gemini espera 1 doc por petición → batchamos en serie
      const out = [];
      for (const t of texts) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: { parts: [{ text: t }] } }),
          },
        );
        if (!res.ok) throw new Error(`gemini_embed_${res.status}`);
        const data = await res.json();
        out.push(data.embedding.values);
      }
      return out;
    },
  };
}

// Embedder mock determinista basado en hashing de palabras → vector 64D.
// No es semántico, pero permite tests y demos sin coste.
function makeMockEmbedder() {
  return {
    provider: "mock",
    model: "hashed-bag-of-words-64",
    async embed(texts) {
      return texts.map((t) => {
        const v = new Array(64).fill(0);
        for (const w of String(t).toLowerCase().split(/\W+/)) {
          if (!w) continue;
          const h = crypto.createHash("md5").update(w).digest();
          const idx = h[0] % 64;
          v[idx] += 1;
        }
        // L2 normalization
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        return v.map((x) => x / norm);
      });
    },
  };
}

// Cadena de selección: igual que la del chat — usuario → org → env → mock.
async function embedderFor({ user, org, env }) {
  // Usuario primero
  const u = user?.ai;
  if (u?.enabled && u?.apiKey) {
    if (u.provider === "openai") return makeOpenAIEmbedder({ apiKey: u.apiKey, model: u.embeddingModel });
    if (u.provider === "gemini") return makeGeminiEmbedder({ apiKey: u.apiKey, model: u.embeddingModel });
    // Anthropic no tiene embeddings — caemos al siguiente nivel
  }
  const o = org?.integrations?.ai;
  if (o?.enabled && o?.apiKey) {
    if (o.provider === "openai") return makeOpenAIEmbedder({ apiKey: o.apiKey, model: o.embeddingModel });
    if (o.provider === "gemini") return makeGeminiEmbedder({ apiKey: o.apiKey, model: o.embeddingModel });
  }
  if (env) {
    if (env.OPENAI_API_KEY) return makeOpenAIEmbedder({ apiKey: env.OPENAI_API_KEY });
    if (env.GEMINI_API_KEY) return makeGeminiEmbedder({ apiKey: env.GEMINI_API_KEY });
  }
  return makeMockEmbedder();
}

// ── Chunking ────────────────────────────────────────────────────────────────

function chunkText(text, source) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= CHUNK_WORDS) return [{ text: words.join(" "), source }];
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS - CHUNK_OVERLAP) {
    const slice = words.slice(i, i + CHUNK_WORDS);
    if (slice.length < 30 && chunks.length > 0) break; // último chunk muy pequeño
    chunks.push({ text: slice.join(" "), source });
  }
  return chunks;
}

// ── Indexación ──────────────────────────────────────────────────────────────

async function reindexOrg({ orgId, env }) {
  const org = db.findOne("organizations", (o) => o.id === orgId);
  if (!org) throw new Error("org_not_found");
  const embedder = await embedderFor({ org, env });

  // 1. Borramos todos los chunks anteriores de esta org
  db.remove("ragChunks", (c) => c.organizationId === orgId);

  // 2. Construimos chunks desde syllabi, questionBank y materiales con texto
  const all = [];

  for (const s of db.find("syllabi", (x) => x.organizationId === orgId)) {
    for (const t of (s.topics || [])) {
      const text = `Tema ${t.number || ""} — ${t.title}\n\n${t.description || t.summary || ""}`;
      for (const c of chunkText(text, { kind: "topic", syllabusId: s.id, topicId: t.id, title: t.title })) {
        all.push(c);
      }
    }
  }

  for (const q of db.find("questionBank", (x) => x.organizationId === orgId && x.active !== false)) {
    const text = `Pregunta: ${q.text}\nOpciones:\n${(q.options || []).map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}\nRespuesta correcta: ${String.fromCharCode(65 + (q.correct || 0))}\n${q.explanation ? "Explicación: " + q.explanation : ""}\n${q.norm ? "Normativa: " + q.norm : ""}`;
    all.push({ text, source: { kind: "question", qbId: q.id, norm: q.norm, topicId: q.topicId } });
  }

  for (const m of db.find("materials", (x) => x.organizationId === orgId)) {
    if (m.bodyText && m.bodyText.length > 50) {
      for (const c of chunkText(m.bodyText, { kind: "material", materialId: m.id, title: m.title })) {
        all.push(c);
      }
    }
  }

  if (all.length === 0) return { indexed: 0, provider: embedder.provider };

  // 3. Embeddings en batches de 50
  const BATCH = 50;
  let indexed = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const slice = all.slice(i, i + BATCH);
    let vecs;
    try {
      vecs = await embedder.embed(slice.map((c) => c.text));
    } catch (e) {
      console.error("[rag:embed]", e);
      throw new Error("embed_failed: " + e.message);
    }
    for (let j = 0; j < slice.length; j++) {
      db.insert("ragChunks", {
        id: db.id("rag"),
        organizationId: orgId,
        text: slice[j].text,
        source: slice[j].source,
        vector: vecs[j],
        embeddingProvider: embedder.provider,
        embeddingModel: embedder.model,
        createdAt: new Date().toISOString(),
      });
      indexed += 1;
    }
  }
  return { indexed, provider: embedder.provider, totalChunks: all.length };
}

// ── Búsqueda ────────────────────────────────────────────────────────────────

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function retrieve({ orgId, query, user, env, k = TOP_K }) {
  const chunks = db.find("ragChunks", (c) => c.organizationId === orgId);
  if (chunks.length === 0) return { hits: [], provider: null };
  const org = db.findOne("organizations", (o) => o.id === orgId);
  const embedder = await embedderFor({ user, org, env });
  // Solo podemos comparar si los chunks usan el mismo provider/model
  const sample = chunks[0];
  if (sample.embeddingProvider !== embedder.provider) {
    // Provider distinto — embeddings incompatibles. Devolvemos vacío para
    // que el chat no inyecte contexto incorrecto.
    return { hits: [], provider: embedder.provider, incompatible: true,
      message: `Index generado con ${sample.embeddingProvider} pero query usa ${embedder.provider}. Reindexa la academia para resincronizar.` };
  }
  const [qvec] = await embedder.embed([query]);
  const scored = chunks.map((c) => ({
    text: c.text, source: c.source, score: cosine(qvec, c.vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return { hits: scored.slice(0, k), provider: embedder.provider };
}

// ── Inyección en system prompt del chat ─────────────────────────────────────

function buildContextBlock(hits) {
  if (!hits.length) return "";
  const lines = ["Documentos del corpus de la academia (los más relevantes a la pregunta del estudiante):"];
  hits.forEach((h, i) => {
    const src = h.source.kind === "topic" ? `[Tema] ${h.source.title}` :
                h.source.kind === "question" ? `[Pregunta del banco] ${h.source.norm || ""}` :
                h.source.kind === "material" ? `[Material] ${h.source.title}` :
                "[Doc]";
    lines.push(`\n--- ${src} (similitud: ${h.score.toFixed(3)}) ---\n${h.text.slice(0, 600)}`);
  });
  lines.push("\n\nUsa estos documentos para responder con precisión. Si la pregunta es sobre algo que NO aparece en ellos, indícalo con honestidad.");
  return lines.join("\n");
}

module.exports = {
  reindexOrg, retrieve, buildContextBlock,
  embedderFor, makeMockEmbedder, makeOpenAIEmbedder, makeGeminiEmbedder,
  chunkText, cosine,
};
