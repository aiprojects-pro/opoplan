// ─────────────────────────────────────────────────────────────────────────────
// Constantes compartidas entre backend y semilla. Si quieres añadir tipos
// nuevos en el futuro, hazlo aquí y se actualizan todos los selects del UI.
// ─────────────────────────────────────────────────────────────────────────────

// Tipos de pruebas que un opositor puede hacer / un preparador puede registrar.
const ASSESSMENT_TYPES = [
  { id: "test", label: "Test (tipo test)" },
  { id: "supuesto", label: "Supuesto práctico" },
  { id: "oral", label: "Oral / exposición" },
  { id: "desarrollo", label: "Desarrollo escrito" },
  { id: "psicotecnico", label: "Psicotécnico" },
  { id: "mecanografia", label: "Mecanografía" },
  { id: "fisica", label: "Prueba física" },
  { id: "idioma", label: "Idioma" },
  { id: "otro", label: "Otra" },
];

// Categorías de la biblioteca de materiales.
const MATERIAL_CATEGORIES = [
  { id: "temario_oficial", label: "Temario oficial", icon: "📘" },
  { id: "complementario", label: "Material complementario", icon: "📙" },
  { id: "examen", label: "Exámenes y simulacros", icon: "📝" },
  { id: "planificacion", label: "Planificación", icon: "📅" },
  { id: "plantilla", label: "Plantillas", icon: "📄" },
];

// Líneas de planes (transcripción ~19:57: oposiciones, universidad, EBAU,
// preparadores independientes). Etiquetadas con color y filtros en el UI.
const PLAN_LINES = [
  { id: "oposiciones", label: "Oposiciones", icon: "⚖️", color: "#155ea8" },
  { id: "universidad", label: "Universidad", icon: "🎓", color: "#7c3aed" },
  { id: "ebau", label: "Bachillerato / EBAU", icon: "📚", color: "#0c8f6f" },
  { id: "preparador_independiente", label: "Preparador independiente", icon: "👨‍🏫", color: "#d97706" },
  { id: "academia", label: "Academia", icon: "🏛️", color: "#0ea5e9" },
];

// Targets de planes: a quién se vende
const PLAN_TARGETS = [
  { id: "opositor", label: "Opositor / alumno individual" },
  { id: "preparador", label: "Preparador independiente" },
  { id: "academia", label: "Academia" },
];

// Proveedores de IA soportados para integración personal del opositor o
// del preparador. Idea (transcripción ~20:53): cada usuario aporta su propia
// API key y el coste corre de su cuenta.
const AI_PROVIDERS = [
  { id: "gemini", label: "Google Gemini", model: "gemini-1.5-flash", urlHelp: "https://aistudio.google.com/apikey" },
  { id: "openai", label: "OpenAI (ChatGPT)", model: "gpt-4o-mini", urlHelp: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Anthropic (Claude)", model: "claude-3-5-sonnet-latest", urlHelp: "https://console.anthropic.com/settings/keys" },
];

// Modos del chatbot (preparador decide cómo responde la IA con sus opositores).
const CHATBOT_MODES = [
  { id: "supervised", label: "Supervisado (las dudas las contesto yo)", description: "El opositor deja la duda. Yo contesto cuando puedo." },
  { id: "auto_general", label: "Automático para dudas generales", description: "La IA contesta dudas generales (planificación, técnicas). Las específicas las contesto yo." },
  { id: "auto_full", label: "Automático completo", description: "La IA contesta todas las dudas inmediatamente." },
  { id: "off", label: "Desactivado", description: "No hay chat." },
];

// Tipos MIME aceptados en uploads de temario / biblioteca / correcciones.
const ACCEPTED_MIME_PREFIXES = [
  "application/pdf",
  "image/",
  "audio/",
  "video/",
  "application/msword",
  "application/vnd.openxmlformats",
  "application/vnd.ms-excel",
  "text/",
];

function isAcceptedMime(mime) {
  if (!mime) return false;
  return ACCEPTED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

// Catálogo predefinido de trámites administrativos para opositores.
const PROCEDURE_CATALOG = [
  { code: "instancia", title: "Solicitud / instancia oficial", description: "Cumplimentar y registrar la instancia de admisión a la convocatoria.", icon: "📋", category: "inscripcion", requiresFile: true },
  { code: "tasas", title: "Pago de tasas", description: "Abonar tasas de examen y conservar justificante.", icon: "💶", category: "inscripcion", requiresFile: true },
  { code: "subsanacion", title: "Subsanación de documentación", description: "Aportar documentos requeridos tras revisión de la lista provisional.", icon: "📎", category: "inscripcion", requiresFile: true },
  { code: "certificado_medico", title: "Certificado médico", description: "Obtener certificado médico oficial (válido para pruebas físicas).", icon: "🩺", category: "documentacion", requiresFile: true },
  { code: "antecedentes", title: "Certificado de antecedentes penales", description: "Solicitar certificado en sede del Ministerio de Justicia.", icon: "📜", category: "documentacion", requiresFile: true },
  { code: "titulacion", title: "Compulsa de titulación", description: "Compulsar el título académico exigido por las bases.", icon: "🎓", category: "documentacion", requiresFile: true },
  { code: "declaracion_responsable", title: "Declaración responsable", description: "Firmar declaración de cumplimiento de requisitos.", icon: "✍️", category: "documentacion", requiresFile: true },
  { code: "presentacion_examen", title: "Presentación al examen", description: "Confirmar lugar, fecha y hora del examen oficial.", icon: "📅", category: "examen", requiresFile: false },
  { code: "dia_examen", title: "Día del examen — checklist", description: "DNI, convocatoria, bolígrafos, agua, snack, ruta hasta la sede. Llegar con 30 minutos de margen.", icon: "🎯", category: "examen", requiresFile: false },
  { code: "tribunal", title: "Consulta de tribunal", description: "Conocer la composición del tribunal y posibles recusaciones.", icon: "⚖️", category: "examen", requiresFile: false },
  { code: "reclamacion", title: "Reclamación / recurso", description: "Presentar reclamación contra calificación o lista provisional dentro del plazo.", icon: "✉️", category: "examen", requiresFile: true },
];

// Plantillas NPS (Net Promoter Score). El admin puede activar el cuestionario
// configurable (transcripción ~21:00).
const NPS_TEMPLATES = [
  {
    id: "nps_classic",
    title: "NPS clásico (1 pregunta)",
    questions: [
      { id: "nps", type: "nps", text: "En una escala de 0 a 10, ¿qué probabilidad hay de que recomiendes esta plataforma a un compañero opositor?" },
    ],
  },
  {
    id: "nps_extended",
    title: "NPS extendido (con feedback)",
    questions: [
      { id: "nps", type: "nps", text: "En una escala de 0 a 10, ¿qué probabilidad hay de que recomiendes esta plataforma a un compañero opositor?" },
      { id: "reason", type: "text", text: "¿Cuál es la razón principal de tu puntuación?" },
      { id: "improve", type: "text", text: "¿Qué deberíamos mejorar para que nos recomendaras?" },
    ],
  },
];

function npsCategory(score) {
  const n = Number(score);
  if (n <= 6) return "detractor";
  if (n <= 8) return "pasivo";
  return "promotor";
}

// Presets de recordatorio de inactividad (transcripción ~20:30). Si la fecha
// de examen está cerca, recordar más frecuentemente.
const INACTIVITY_PRESETS = [
  { id: "intensive", label: "Intensivo (examen <30 días)", days: 2 },
  { id: "normal", label: "Normal (examen <90 días)", days: 7 },
  { id: "calm", label: "Tranquilo (sin fecha cercana)", days: 15 },
  { id: "off", label: "Desactivado", days: 0 },
];

// Cancelación de tutorías (transcripción ~20:35).
const BOOKING_CANCEL_HOURS = 48;

// Procesos selectivos abiertos por preparador (transcripción ~20:22).
const PROCESS_STATUSES = [
  { id: "planning", label: "En planificación" },
  { id: "active", label: "Activo" },
  { id: "paused", label: "Pausado" },
  { id: "closed", label: "Cerrado" },
];

// ─── FASE 6: catálogo de servicios extendido ──────────────────────────────────

// Niveles de urgencia en el monitor normativo (catálogo §A.2).
const NORMATIVE_LEVELS = [
  { id: "critical", label: "Crítico", color: "#dc2626", description: "Cambio que afecta a una convocatoria próxima" },
  { id: "important", label: "Importante", color: "#d97706", description: "Cambio relevante para el temario" },
  { id: "informative", label: "Informativo", color: "#2563eb", description: "Cambio menor o de contexto" },
];

// Cuestionario corto de estrés semanal (catálogo §B.7). Escala 1-5.
// Calibrado contra ítems del DASS-21 abreviado, simplificado para opositor.
const STRESS_QUESTIONS = [
  { id: "overwhelm", text: "Esta semana me he sentido sobrepasado/a por el estudio.", inverted: false },
  { id: "sleep",     text: "He dormido bien y descansado lo suficiente.", inverted: true },
  { id: "focus",     text: "Me ha costado concentrarme en sesiones largas.", inverted: false },
  { id: "doubt",     text: "He dudado de si voy a llegar a tiempo a la convocatoria.", inverted: false },
  { id: "joy",       text: "He disfrutado de momentos sin pensar en la oposición.", inverted: true },
];

function stressScore(answers) {
  // Cada respuesta 1-5; invertimos los items 'positivos'. Suma 5..25.
  let total = 0;
  for (const q of STRESS_QUESTIONS) {
    const v = Math.max(1, Math.min(5, Number(answers[q.id]) || 3));
    total += q.inverted ? (6 - v) : v;
  }
  return total; // 5 = óptimo, 25 = crítico
}

function stressLabel(total) {
  if (total <= 9) return { id: "low", label: "Estrés bajo", color: "#0c8f6f" };
  if (total <= 14) return { id: "moderate", label: "Moderado", color: "#2563eb" };
  if (total <= 19) return { id: "high", label: "Alto", color: "#d97706" };
  return { id: "burnout", label: "Riesgo de agotamiento", color: "#dc2626" };
}

// Biblioteca mínima de micro-recursos de bienestar (catálogo §B.7).
// Texto en MD para que el opositor pueda leerlos sin audio. Cuando se
// integre TTS o se grabe locución, se rellena `audioUrl` por recurso.
const WELLBEING_RESOURCES = [
  {
    id: "wb_breath_478",
    kind: "breathing",
    durationSec: 240,
    title: "Respiración 4-7-8",
    description: "Cuatro segundos inspiración, siete reteniendo, ocho espirando. Cuatro ciclos.",
    body: "## Respiración 4-7-8\n\n1. Sentado, espalda recta. Apoya la lengua detrás de los incisivos superiores.\n2. Espira por la boca con un sonido suave (\"shhh\").\n3. Cierra la boca, **inhala por la nariz contando 4**.\n4. **Aguanta el aire 7 segundos**.\n5. **Espira por la boca 8 segundos**.\n6. Repite el ciclo 3 veces más.\n\nLa primera semana se hace 2 veces al día. A partir de ahí, antes de cada bloque de estudio largo o antes del examen.",
    audioUrl: "",
  },
  {
    id: "wb_pomodoro",
    kind: "technique",
    durationSec: 0,
    title: "Pomodoro adaptado a oposiciones",
    description: "50 / 10 en lugar del clásico 25 / 5: bloques más largos para temas densos.",
    body: "## Pomodoro adaptado\n\nPara temas largos y densos, los 25 minutos del Pomodoro original se quedan cortos: justo cuando entras en flow, suena la alarma. Esto funciona mejor:\n\n- **50 min de estudio activo** (lectura → preguntas → resumen del epígrafe).\n- **10 min de pausa real** (lejos del móvil; idealmente camina o estira).\n- Tras cuatro ciclos, **pausa larga de 30 min**.\n\nNo más de 4-5 ciclos por día. Si llegas al quinto ciclo y notas que la calidad cae, **para**: estudiar mal cansa igual que estudiar bien.",
    audioUrl: "",
  },
  {
    id: "wb_pre_exam",
    kind: "routine",
    durationSec: 600,
    title: "Rutina de los 7 días previos al examen",
    description: "Plan corto para llegar al examen sin sobrecargar la víspera.",
    body: "## Los 7 días antes del examen\n\n**Días -7 a -4: consolidación, no aprendizaje nuevo.** Repaso solo de los temas con peor tasa de acierto en tus simulacros recientes. No abras temarios nuevos por mucho que te tiente.\n\n**Días -3 y -2: simulacros completos en condiciones reales.** Misma hora del examen real, sin pausas, con cronómetro. La nota da igual; lo que practicas es la resistencia mental.\n\n**Día -1: descarga.** Repaso ligero por la mañana de tus fichas de \"datos secos\" (fechas, artículos clave, números). Tarde libre. Cena suave. Acostarse pronto aunque no entre el sueño.\n\n**Día 0: solo lo logístico.** Documentación, ruta al examen, agua, snack. **Nada de estudiar el mismo día**: lo que no sepas ya, no lo aprenderás en dos horas.",
    audioUrl: "",
  },
  {
    id: "wb_block_question",
    kind: "technique",
    durationSec: 0,
    title: "Qué hacer si te bloqueas en una pregunta del examen",
    description: "Protocolo de 30 segundos para no perder el simulacro entero por una pregunta.",
    body: "## Bloqueo en pregunta del examen\n\nTu cerebro nota la pregunta-trampa y se queda en bucle. Cada segundo extra que pasas ahí te resta del resto del examen.\n\n**Protocolo:**\n\n1. **Primera lectura** → si en 20 segundos no tienes una opción claramente preferida, **márcala con el círculo en el cuadernillo y pasa**.\n2. **Sigue el examen** sin volver mentalmente a esa pregunta. Tu cerebro la procesa en background.\n3. **Vuelves al final** con el tiempo que tengas. Sorprendentemente, muchas veces la respuesta aparece sola tras haber visto otras preguntas relacionadas.\n4. **Si sigues sin saberlo y el sistema penaliza errores**, déjala en blanco salvo que puedas eliminar al menos dos opciones.",
    audioUrl: "",
  },
  {
    id: "wb_visualization",
    kind: "mental",
    durationSec: 300,
    title: "Visualización del examen",
    description: "Ejercicio breve para reducir la ansiedad anticipatoria.",
    body: "## Visualización del día del examen\n\nEsto no es magia ni autoengaño: tu cerebro procesa lo imaginado de forma similar a lo vivido y, si lo imaginas con calma, llega más calmado al evento real.\n\n1. Cierra los ojos 5 minutos.\n2. Imagínate **levantándote tranquilo** el día del examen, llegando con tiempo, encontrando tu mesa.\n3. **Visualiza la primera pregunta, fácil**, la respondes y pasas.\n4. Ves una difícil: la marcas y sigues. Sin pánico.\n5. Terminas el tiempo con holgura, sales sintiéndote en paz con lo hecho.\n\nLa primera vez te parecerá raro. Repítelo cada noche en la última semana antes del examen.",
    audioUrl: "",
  },
];

// Confianza declarada por pregunta en simulacros con análisis cognitivo
// (catálogo §A.6 / §B.X). Permite calcular calibración después.
const CONFIDENCE_LEVELS = [
  { id: "sure", label: "Seguro/a", weight: 1.0 },
  { id: "doubt", label: "Dudoso/a", weight: 0.5 },
  { id: "guess", label: "Adivinanza", weight: 0.0 },
];

// Categorías del marketplace B2B de bancos de preguntas (catálogo §A.8).
const MARKETPLACE_CATEGORIES = [
  { id: "test_bank", label: "Banco de preguntas tipo test" },
  { id: "concept_maps", label: "Mapas conceptuales" },
  { id: "summaries", label: "Resúmenes" },
  { id: "case_studies", label: "Supuestos prácticos" },
];

const MARKETPLACE_COMMISSION = 0.18; // 18% para la plataforma sobre cada venta

module.exports = {
  ASSESSMENT_TYPES,
  MATERIAL_CATEGORIES,
  PLAN_LINES,
  PLAN_TARGETS,
  AI_PROVIDERS,
  CHATBOT_MODES,
  ACCEPTED_MIME_PREFIXES,
  PROCEDURE_CATALOG,
  NPS_TEMPLATES,
  INACTIVITY_PRESETS,
  BOOKING_CANCEL_HOURS,
  PROCESS_STATUSES,
  NORMATIVE_LEVELS,
  STRESS_QUESTIONS,
  WELLBEING_RESOURCES,
  CONFIDENCE_LEVELS,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_COMMISSION,
  isAcceptedMime,
  npsCategory,
  stressScore,
  stressLabel,
};
