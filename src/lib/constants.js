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
  { code: "tribunal", title: "Consulta de tribunal", description: "Conocer la composición del tribunal y posibles recusaciones.", icon: "⚖️", category: "examen", requiresFile: false },
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
  isAcceptedMime,
  npsCategory,
};
