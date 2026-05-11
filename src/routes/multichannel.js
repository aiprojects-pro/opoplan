const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");

// Contenido multi-canal (catálogo §B.4).
//
// Lo que es real en este módulo:
//   - PDF de repaso del tema → entregamos texto en formato Markdown listo
//     para que el cliente lo imprima/exporte (no generamos binarios PDF en
//     el servidor para no añadir dependencias pesadas; el opositor puede
//     usar el "Imprimir como PDF" de su navegador).
//   - Tarjeta visual para Instagram/Stories → generamos SVG 1080x1080
//     server-side. Lo que la academia/opositor reciben es un asset listo
//     para descargar.
//   - "Pregunta del día" → endpoint que selecciona una al azar del banco.
//
// Lo que NO es real (requiere integración externa):
//   - Bot de Telegram → necesita token + webhook.
//   - Cuenta de Instagram → necesita Graph API.
//   - Audio TTS → puede usarse Web Speech API en el cliente.
//   - Smartwatch → app nativa.

module.exports = function multichannelRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function orgOf(req) { return req.user.organizationId; }

  // GET /multichannel/daily-question — selección pseudoaleatoria estable
  // por usuario y día (todos los opositores reciben la misma cada día).
  r.get("/multichannel/daily-question", (req, res) => {
    const orgId = orgOf(req);
    const today = new Date().toISOString().slice(0, 10);
    const pool = db.find("questionBank", (q) => q.organizationId === orgId && q.active !== false);
    if (!pool.length) return res.json({ question: null });
    // Elegir índice estable a partir del día (sin RNG, mismo para todos)
    const seed = today.split("-").reduce((s, x) => s + Number(x), 0);
    const q = pool[seed % pool.length];
    res.json({
      question: {
        qbId: q.id,
        text: q.text,
        options: q.options,
        norm: q.norm,
        date: today,
      },
    });
  });

  // GET /multichannel/study-recap?topicId=t_1
  // Devuelve un Markdown listo para imprimir desde el navegador.
  r.get("/multichannel/study-recap", (req, res) => {
    const topicId = req.query.topicId;
    if (!topicId) return res.status(400).json({ error: "missing_topic" });
    // Buscamos el tema en cualquier syllabus de la academia
    const all = db.find("syllabi", (s) => s.organizationId === orgOf(req));
    let topic = null, syllabus = null;
    for (const s of all) {
      const t = (s.topics || []).find((x) => x.id === topicId);
      if (t) { topic = t; syllabus = s; break; }
    }
    if (!topic) return res.status(404).json({ error: "topic_not_found" });

    const questions = db.find("questionBank",
      (q) => q.organizationId === orgOf(req) && q.topicId === topicId && q.active !== false);
    const md = renderRecapMarkdown({ syllabus, topic, questions });
    res.json({
      markdown: md,
      printableHtml: renderRecapHtml({ syllabus, topic, questions }),
    });
  });

  // GET /multichannel/share-card?qbId=qb_1
  // SVG 1080x1080 con la pregunta para compartir en redes.
  r.get("/multichannel/share-card", (req, res) => {
    const qbId = req.query.qbId;
    const q = qbId
      ? db.findOne("questionBank", (x) => x.id === qbId)
      : null;
    if (!q) return res.status(404).json({ error: "question_not_found" });
    const org = db.findOne("organizations", (o) => o.id === orgOf(req));
    const svg = renderShareCardSvg({ question: q, org });
    res.set("Content-Type", "image/svg+xml");
    res.send(svg);
  });

  return r;
};

function renderRecapMarkdown({ syllabus, topic, questions }) {
  const lines = [];
  lines.push(`# ${topic.number || ""} ${topic.title}`);
  lines.push(`*${syllabus.title}*`);
  lines.push("");
  if (topic.block) lines.push(`**Bloque:** ${topic.block}\n`);
  lines.push(`**Dificultad estimada:** ${topic.difficulty || "Media"} · **Prioridad:** ${topic.priority || "Media"}`);
  lines.push("");
  lines.push("## Conceptos clave");
  lines.push("*(Genera con IA un resumen del tema desde la herramienta Generadores)*\n");
  if (questions.length) {
    lines.push(`## ${questions.length} preguntas tipo test\n`);
    questions.forEach((q, i) => {
      lines.push(`**${i + 1}.** ${q.text}`);
      q.options.forEach((opt, idx) => {
        const tick = idx === q.correct ? " ✓" : "";
        lines.push(`- ${String.fromCharCode(65 + idx)}. ${opt}${tick}`);
      });
      if (q.norm) lines.push(`*Referencia normativa:* ${q.norm}`);
      if (q.explanation) lines.push(`*Por qué:* ${q.explanation}`);
      lines.push("");
    });
  }
  return lines.join("\n");
}

function renderRecapHtml({ syllabus, topic, questions }) {
  // HTML mínimo "imprimible" — el cliente abre y usa Imprimir → PDF
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qHtml = questions.map((q, i) => `
    <div class="q">
      <p><strong>${i + 1}.</strong> ${esc(q.text)}</p>
      <ol type="A">
        ${q.options.map((opt, idx) => `<li${idx === q.correct ? ' class="correct"' : ""}>${esc(opt)}${idx === q.correct ? " ✓" : ""}</li>`).join("")}
      </ol>
      ${q.norm ? `<p class="meta">Referencia: ${esc(q.norm)}</p>` : ""}
      ${q.explanation ? `<p class="meta">Por qué: ${esc(q.explanation)}</p>` : ""}
    </div>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(topic.number)} ${esc(topic.title)}</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 0 auto; color: #111; line-height: 1.5; }
h1 { font-size: 22pt; border-bottom: 2px solid #08264a; padding-bottom: 6px; }
h2 { font-size: 14pt; color: #08264a; margin-top: 22px; }
.q { margin: 18px 0; padding: 12px; border-left: 3px solid #155ea8; page-break-inside: avoid; }
.q ol { margin: 6px 0 6px 20px; }
.q li.correct { font-weight: 700; }
.meta { font-size: 9pt; color: #555; margin: 4px 0 0; }
</style></head><body>
<h1>${esc(topic.number)} ${esc(topic.title)}</h1>
<p><em>${esc(syllabus.title)}</em></p>
<h2>${questions.length} preguntas para repasar</h2>
${qHtml}
</body></html>`;
}

function renderShareCardSvg({ question, org }) {
  const branding = org?.branding || {};
  const primary = branding.primaryColor || "#155ea8";
  const accent = branding.accentColor || "#0c8f6f";
  const orgName = org?.name || "OpoPlan";
  // Truncamos por caracteres aproximados — para dar un layout previsible
  const text = String(question.text || "").slice(0, 220) + (question.text.length > 220 ? "…" : "");
  // SVG 1080x1080 con texto envuelto en líneas de ~38 chars
  const lines = wrap(text, 38);
  const startY = 360 - (lines.length * 32) / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${primary}"/>
      <stop offset="1" stop-color="${darken(primary, 0.4)}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <text x="60" y="120" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff" opacity="0.85">${escSvg(orgName)}</text>
  <text x="60" y="170" font-family="Inter, Arial, sans-serif" font-size="20" fill="#ffffff" opacity="0.6">Pregunta del día</text>
  <g font-family="Georgia, serif" fill="#ffffff" font-size="38" font-weight="600">
    ${lines.map((ln, i) => `<text x="60" y="${280 + i * 56}">${escSvg(ln)}</text>`).join("\n    ")}
  </g>
  ${question.options.slice(0, 4).map((o, idx) => `
    <g transform="translate(60, ${720 + idx * 70})">
      <rect x="0" y="0" width="960" height="58" rx="10" fill="rgba(255,255,255,0.12)"/>
      <text x="20" y="38" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="${accent}">${String.fromCharCode(65 + idx)}</text>
      <text x="60" y="38" font-family="Inter, Arial, sans-serif" font-size="22" fill="#ffffff">${escSvg(String(o).slice(0, 70))}</text>
    </g>`).join("")}
  <text x="60" y="1030" font-family="Inter, Arial, sans-serif" font-size="18" fill="#ffffff" opacity="0.55">${escSvg(question.norm || "")}</text>
</svg>`;
}

function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const out = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars) {
      if (current) out.push(current);
      current = w;
    } else {
      current = current ? `${current} ${w}` : w;
    }
  }
  if (current) out.push(current);
  return out.slice(0, 7);
}

function escSvg(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function darken(hex, factor) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return "#000000";
  const r = Math.round(parseInt(m[1], 16) * (1 - factor));
  const g = Math.round(parseInt(m[2], 16) * (1 - factor));
  const b = Math.round(parseInt(m[3], 16) * (1 - factor));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
