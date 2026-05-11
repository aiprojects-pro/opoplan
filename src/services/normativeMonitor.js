const crypto = require("crypto");

// Servicio del Monitor Normativo (catálogo §A.2).
//
// Provider real: BOE Datos Abiertos (https://www.boe.es/datosabiertos/api/).
// Es público, no requiere autenticación.
//
// Estrategia conservadora:
//   1. Pedimos el sumario del BOE de hoy (o de las últimas N fechas)
//   2. Para cada disposición, miramos su título y sección
//   3. Cruzamos contra el `questionBank` de cada academia: si el título o
//      el ID de la norma aparece en `q.norm`, generamos una alerta
//   4. La alerta queda en estado `open` para que la academia decida
//
// Limitaciones:
//   - No hacemos diff de artículos (eso requeriría descargar el documento
//     consolidado completo y compararlo con la versión anterior). Lo dejamos
//     como mejora.
//   - Solo BOE; los boletines autonómicos (BOJA, DOGC, etc.) tienen formatos
//     distintos y se añadirán como providers separados cuando se priorice.

function makeMock() {
  return {
    provider: "mock",
    async runOnce({ orgId, db }) {
      return { provider: "mock", processed: 0, created: 0 };
    },
  };
}

function makeBoe(cfg = {}) {
  const baseUrl = cfg.baseUrl || "https://boe.es/datosabiertos/api/boe/sumario";
  const lookbackDays = Math.max(1, Math.min(30, Number(cfg.lookbackDays) || 7));

  async function fetchSumario(dateStr) {
    // dateStr: YYYYMMDD (formato del API del BOE)
    const url = `${baseUrl}/${dateStr}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null; // no hay BOE ese día
    if (!res.ok) throw new Error(`boe_${res.status}`);
    return res.json();
  }

  function listDisposicionesFromSumario(sumario) {
    // Estructura simplificada del JSON: data.sumario.diario[].seccion[].departamento[].epigrafe[].item[]
    // Cada item tiene: identificador, titulo, url_pdf, etc.
    const out = [];
    try {
      const diarios = sumario?.data?.sumario?.diario || [];
      for (const d of [].concat(diarios)) {
        const secs = [].concat(d.seccion || []);
        for (const sec of secs) {
          const deps = [].concat(sec.departamento || []);
          for (const dep of deps) {
            const epis = [].concat(dep.epigrafe || []);
            for (const epi of epis) {
              const items = [].concat(epi.item || []);
              for (const it of items) {
                out.push({
                  id: it.identificador || "",
                  title: it.titulo || "",
                  urlPdf: it.url_pdf?.texto || it.url_pdf || "",
                  urlHtml: it.url_html || "",
                  section: sec.codigo || "",
                });
              }
            }
          }
        }
      }
    } catch (_e) { /* swallow */ }
    return out;
  }

  // Dada una disposición y el banco de preguntas, ¿afecta?
  // Heurística: el título o ID aparece en `q.norm` (case-insensitive),
  // o coincidencia de palabras clave con el "norm" de cada pregunta.
  function findAffectedQuestions(disp, questionBank) {
    const out = [];
    const dispText = (disp.title + " " + disp.id).toLowerCase();
    for (const q of questionBank) {
      const norm = (q.norm || "").toLowerCase();
      if (!norm) continue;
      // Match si la norma de la pregunta aparece en el título de la disposición
      if (dispText.includes(norm) || norm.split(/[,;]/).some((tok) => tok.trim().length > 4 && dispText.includes(tok.trim()))) {
        out.push(q.id);
      }
    }
    return out;
  }

  function levelFor(disp) {
    const s = (disp.section || "").toString();
    // Sección I = "Disposiciones generales" → más relevante
    if (s.startsWith("1") || s === "I") return "important";
    // Sección II = "Autoridades y personal", III = "Otras" → informativo
    return "informative";
  }

  return {
    provider: "boe",
    async runOnce({ orgId, db, since } = {}) {
      const today = new Date();
      let processed = 0, created = 0;
      const questionBank = db.find("questionBank",
        (q) => q.organizationId === orgId && q.active !== false);
      if (!questionBank.length) return { provider: "boe", processed: 0, created: 0, note: "no_questions" };

      for (let d = 0; d < lookbackDays; d++) {
        const date = new Date(today.getTime() - d * 86400000);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}${mm}${dd}`;
        let sumario;
        try { sumario = await fetchSumario(dateStr); }
        catch (e) { continue; }
        if (!sumario) continue;
        const disps = listDisposicionesFromSumario(sumario);
        for (const disp of disps) {
          processed += 1;
          const affected = findAffectedQuestions(disp, questionBank);
          if (!affected.length) continue;
          // Comprobar que no la hemos creado ya (por id de disposición)
          const existing = db.findOne("normativeAlerts",
            (a) => a.organizationId === orgId && a.externalId === disp.id);
          if (existing) continue;
          db.insert("normativeAlerts", {
            id: `na_${crypto.randomBytes(4).toString("hex")}`,
            organizationId: orgId,
            externalId: disp.id,
            level: levelFor(disp),
            source: "BOE",
            sourceUrl: disp.urlHtml || disp.urlPdf || `https://www.boe.es/diario_boe/txt.php?id=${disp.id}`,
            publishedAt: `${yyyy}-${mm}-${dd}`,
            norm: disp.id,
            normIssuedAt: `${yyyy}-${mm}-${dd}`,
            title: disp.title,
            summary: disp.title,
            affectsTopicIds: [],
            affectsQuestionIds: affected,
            diff: "",
            status: "open",
            createdAt: new Date().toISOString(),
          });
          created += 1;
        }
      }
      return { provider: "boe", processed, created };
    },
  };
}

function fromEnv(env) {
  if (env && env.NORMATIVE_PROVIDER === "boe") {
    return makeBoe({ baseUrl: env.NORMATIVE_BOE_URL, lookbackDays: env.NORMATIVE_BOE_LOOKBACK_DAYS });
  }
  return makeMock();
}

// Generador de alertas sintéticas para demos / pruebas. Útil para crear
// datos consistentes desde el panel de superadmin sin arrancar el feed real.
function generateSyntheticAlert({ orgId, level = "important" }) {
  const id = `na_${crypto.randomBytes(4).toString("hex")}`;
  const samples = [
    {
      level,
      source: "BOE",
      norm: "Ley 40/2015, art. 47",
      title: "Modificación del régimen de nulidad de pleno derecho",
      summary: "Nueva redacción del supuesto 'incompetencia manifiesta por razón de la materia' tras sentencia del Tribunal Constitucional.",
    },
    {
      level,
      source: "BOJA",
      norm: "Decreto andaluz de organización administrativa",
      title: "Reorganización de competencias entre consejerías",
      summary: "Afecta al temario de organización autonómica andaluza.",
    },
    {
      level,
      source: "DOUE",
      norm: "Reglamento (UE) sobre protección de datos",
      title: "Acto delegado sobre transferencias internacionales",
      summary: "Nuevas cláusulas tipo aplicables desde el próximo trimestre.",
    },
  ];
  const s = samples[Math.floor(Math.random() * samples.length)];
  return {
    id,
    organizationId: orgId,
    level: s.level,
    source: s.source,
    sourceUrl: "",
    publishedAt: new Date().toISOString().slice(0, 10),
    norm: s.norm,
    normIssuedAt: new Date().toISOString().slice(0, 10),
    title: s.title,
    summary: s.summary,
    affectsTopicIds: [],
    affectsQuestionIds: [],
    diff: "",
    status: "open",
    createdAt: new Date().toISOString(),
  };
}

module.exports = { fromEnv, makeMock, makeBoe, generateSyntheticAlert };
