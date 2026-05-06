// ─────────────────────────────────────────────────────────────────────────────
// Constantes compartidas entre backend y semilla. Si quieres añadir tipos
// nuevos en el futuro, hazlo aquí y se actualizan todos los selects del UI.
// ─────────────────────────────────────────────────────────────────────────────

// Tipos de pruebas que un opositor puede hacer / un preparador puede registrar.
// Fase 3 amplía con `fisica` e `idioma`.
const ASSESSMENT_TYPES = [
  { id: "test", label: "Test (tipo test)" },
  { id: "supuesto", label: "Supuesto práctico" },
  { id: "oral", label: "Oral / exposición" },
  { id: "desarrollo", label: "Desarrollo escrito" },
  { id: "psicotecnico", label: "Psicotécnico" },
  { id: "mecanografia", label: "Mecanografía" },
  { id: "fisica", label: "Prueba física" },
  { id: "idioma", label: "Idioma" },
];

// Categorías de la biblioteca de materiales.
const MATERIAL_CATEGORIES = [
  { id: "temario_oficial", label: "Temario oficial", icon: "📘" },
  { id: "complementario", label: "Material complementario", icon: "📙" },
  { id: "examen", label: "Exámenes y simulacros", icon: "📝" },
  { id: "planificacion", label: "Planificación", icon: "📅" },
  { id: "plantilla", label: "Plantillas", icon: "📄" },
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
// Cada uno se "instala" (POST /procedures/install) y luego se edita estado,
// fecha límite, notas y archivos asociados.
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

module.exports = {
  ASSESSMENT_TYPES,
  MATERIAL_CATEGORIES,
  ACCEPTED_MIME_PREFIXES,
  PROCEDURE_CATALOG,
  isAcceptedMime,
};
