// Parser de subida masiva de temas. Acepta varios formatos comunes que un
// preparador podría tener a mano: el texto literal del BOE de la
// convocatoria, una lista numerada, un CSV, etc.
//
// Formatos detectados automáticamente:
//
//   1. Línea numerada simple:
//        "1. La Constitución española de 1978"
//        "2.- El Estado social y democrático de Derecho"
//        "Tema 3: Los derechos fundamentales"
//        "Tema 4 - El Tribunal Constitucional"
//
//   2. Listado con bloques:
//        BLOQUE I — Derecho constitucional
//        1. Tema uno
//        2. Tema dos
//        BLOQUE II — Derecho administrativo
//        3. Tema tres
//
//   3. CSV con cabecera (cualquier orden de columnas):
//        number,title,block,difficulty,priority
//        1,La Constitución,I,Media,Alta
//        2,Tit. Preliminar,I,Baja,Alta
//
//   4. Markdown con encabezados:
//        ## Bloque I
//        - Tema 1: La Constitución
//        - Tema 2: Tit. Preliminar

const VALID_DIFFICULTY = ["Baja", "Media", "Alta"];
const VALID_PRIORITY = ["Baja", "Media", "Alta", "Muy alta"];

// Detección automática del formato
function detectFormat(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "empty";
  // CSV: primera línea con comas + cabecera reconocible
  const firstLine = trimmed.split("\n")[0].toLowerCase();
  if (firstLine.includes(",") && (firstLine.includes("title") || firstLine.includes("titulo") || firstLine.includes("número") || firstLine.includes("number"))) {
    return "csv";
  }
  return "text"; // todos los demás formatos los maneja el parser de texto
}

function parseCsv(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { topics: [], errors: ["csv_too_short"] };
  const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase().trim());
  const colNumber = findCol(headers, ["number", "número", "numero", "n", "tema", "#"]);
  const colTitle = findCol(headers, ["title", "titulo", "título", "nombre"]);
  const colBlock = findCol(headers, ["block", "bloque", "parte"]);
  const colDifficulty = findCol(headers, ["difficulty", "dificultad"]);
  const colPriority = findCol(headers, ["priority", "prioridad"]);
  const topics = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const title = colTitle != null ? cols[colTitle] : null;
    if (!title) { errors.push(`L${i + 1}: sin título`); continue; }
    topics.push({
      number: colNumber != null ? cols[colNumber] : `${i}`,
      title: title.trim(),
      block: colBlock != null ? (cols[colBlock] || "").trim() : "",
      difficulty: normalizeDifficulty(colDifficulty != null ? cols[colDifficulty] : null),
      priority: normalizePriority(colPriority != null ? cols[colPriority] : null),
    });
  }
  return { topics, errors };
}

function parseCsvRow(row) {
  // Parser CSV simple con soporte para comillas dobles
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"' && !inQ) { inQ = true; continue; }
    if (c === '"' && inQ) {
      if (row[i + 1] === '"') { cur += '"'; i++; continue; }
      inQ = false; continue;
    }
    if (c === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function findCol(headers, names) {
  for (const n of names) {
    const idx = headers.indexOf(n);
    if (idx >= 0) return idx;
  }
  return null;
}

function normalizeDifficulty(d) {
  if (!d) return "Media";
  const s = String(d).trim().toLowerCase();
  if (["alta", "high", "difícil", "dificil", "h"].includes(s)) return "Alta";
  if (["baja", "low", "fácil", "facil", "l"].includes(s)) return "Baja";
  return "Media";
}

function normalizePriority(p) {
  if (!p) return "Alta";
  const s = String(p).trim().toLowerCase();
  if (["muy alta", "very high", "vh"].includes(s)) return "Muy alta";
  if (["alta", "high", "h"].includes(s)) return "Alta";
  if (["baja", "low", "l"].includes(s)) return "Baja";
  if (["media", "medium", "m"].includes(s)) return "Media";
  return "Alta";
}

// Parser de texto libre. Detecta líneas tipo "1. Título", "Tema 1: X",
// "Tema 1.- X", bloques "BLOQUE I —" y agrupa.
function parseText(text) {
  const lines = String(text).split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
  const topics = [];
  const errors = [];
  let currentBlock = "";
  let counter = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();

    // ¿Es un encabezado de bloque?
    // - "BLOQUE I — ..." / "BLOQUE 1 - ..." / "PARTE II ..."
    // - "## Bloque I" (markdown)
    const blockMatch = raw.match(/^(?:#{1,3}\s*)?(?:BLOQUE|PARTE|MÓDULO|MODULO)\s+(?:[IVX]+|\d+)(?:\s*[-—:]\s*(.+))?$/i);
    if (blockMatch) {
      currentBlock = (blockMatch[1] || raw.replace(/^#+\s*/, "")).trim();
      continue;
    }
    // Encabezado markdown alternativo "## Algo" — lo tratamos como bloque si no matchea como tema
    if (raw.startsWith("##") && !/\d/.test(raw)) {
      currentBlock = raw.replace(/^#+\s*/, "").trim();
      continue;
    }

    // ¿Es una línea de tema?
    // Patrones aceptados:
    //   "1. Título"          → number=1, title=Título
    //   "1.- Título"         → number=1, title=Título
    //   "1) Título"          → number=1
    //   "Tema 1: Título"     → number=1
    //   "Tema 1 - Título"    → number=1
    //   "Tema 1.- Título"    → number=1
    //   "- Tema 1: Título"   → markdown list
    //   "* Título"           → solo título, autoasigna número
    let m;
    const cleaned = raw.replace(/^[-*•·]\s*/, ""); // quitar bullets de listas

    m = cleaned.match(/^Tema\s+(\d+|[IVX]+)\s*[:.\-—)]+\s*(.+)$/i);
    if (m) {
      counter++;
      topics.push({
        number: `Tema ${m[1]}`,
        title: cleanTitle(m[2]),
        block: currentBlock,
        difficulty: "Media",
        priority: "Alta",
      });
      continue;
    }
    m = cleaned.match(/^(\d+)\s*[:.\-—)]+\s*(.+)$/);
    if (m) {
      counter++;
      topics.push({
        number: m[1],
        title: cleanTitle(m[2]),
        block: currentBlock,
        difficulty: "Media",
        priority: "Alta",
      });
      continue;
    }
    // Línea sin numerar pero con contenido — autoasignamos número
    if (cleaned.length > 3 && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(cleaned)) {
      counter++;
      topics.push({
        number: `${counter}`,
        title: cleanTitle(cleaned),
        block: currentBlock,
        difficulty: "Media",
        priority: "Alta",
      });
      continue;
    }
    errors.push(`L${i + 1}: línea no reconocida — "${raw.slice(0, 60)}"`);
  }

  return { topics, errors };
}

function cleanTitle(s) {
  return String(s || "").trim().replace(/\.\s*$/, "");
}

// Punto de entrada principal
function parse(text, format) {
  const fmt = format || detectFormat(text);
  if (fmt === "empty") return { topics: [], errors: ["empty_input"], format: fmt };
  if (fmt === "csv") return { ...parseCsv(text), format: "csv" };
  return { ...parseText(text), format: "text" };
}

module.exports = { parse, parseCsv, parseText, detectFormat, normalizeDifficulty, normalizePriority };
