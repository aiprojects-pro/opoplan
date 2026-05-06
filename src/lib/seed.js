const crypto = require("crypto");

function hash(password) {
  return crypto.createHash("sha256").update(`opoplan:${password}`).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos semilla. Modelo multi-tenant: el super-administrador (rol "superadmin")
// es propio de la plataforma y no pertenece a ninguna organización; el resto
// de usuarios (admin, preparador, opositor) viven dentro de una organización
// y solo ven los datos de su organización.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function seed() {
  const ORG_DEMO = "org_demo";

  return {
    // Configuración global de la plataforma (solo super-admin)
    platform: {
      name: "OpoPlan",
      tagline: "Plataforma multi-academia para preparación de oposiciones",
      supportEmail: "soporte@opoplan.es",
    },

    // Catálogo global de planes de suscripción. Cada academia puede crear los
    // suyos propios además de estos.
    subscriptionPlans: [
      {
        id: "plan_free",
        scope: "global",
        organizationId: null,
        name: "Free",
        target: "opositor",
        price: 0,
        currency: "EUR",
        period: "monthly",
        trialDays: 0,
        features: ["Plan semanal básico", "Agenda personal", "1 simulacro al mes"],
        active: true,
      },
      {
        id: "plan_premium",
        scope: "global",
        organizationId: null,
        name: "Premium",
        target: "opositor",
        price: 29,
        currency: "EUR",
        period: "monthly",
        trialDays: 14,
        features: ["Plan recalculable", "Materiales completos", "Pruebas ilimitadas"],
        active: true,
      },
      {
        id: "plan_premium_tut",
        scope: "global",
        organizationId: null,
        name: "Premium + tutorías",
        target: "opositor",
        price: 79,
        currency: "EUR",
        period: "monthly",
        trialDays: 14,
        features: ["Todo Premium", "Tutorías semanales", "Correcciones personalizadas"],
        active: true,
      },
      {
        id: "plan_prep_solo",
        scope: "global",
        organizationId: null,
        name: "Preparador independiente",
        target: "preparador",
        price: 39,
        currency: "EUR",
        period: "monthly",
        trialDays: 30,
        features: ["Hasta 20 opositores", "Biblioteca propia", "Marca personal"],
        active: true,
      },
    ],

    // Organizaciones (academias)
    organizations: [
      {
        id: ORG_DEMO,
        name: "Academia Demo",
        slug: "demo",
        status: "active",
        createdAt: "2026-01-15",
        // Branding personalizable
        branding: {
          tagline: "Preparación inteligente para oposiciones",
          initials: "AD",
          primaryColor: "#155ea8",
          secondaryColor: "#08264a",
          accentColor: "#0c8f6f",
          logo: "",
          favicon: "",
        },
        // Datos fiscales y de contacto
        contact: {
          email: "info@academiademo.es",
          phone: "+34 900 000 000",
          website: "https://academiademo.es",
          address: "Calle Mayor 1, 28001 Madrid",
        },
        billing: {
          legalName: "Academia Demo S.L.",
          taxId: "B12345678",
          address: "Calle Mayor 1, 28001 Madrid",
          country: "ES",
          iban: "",
        },
        // Integraciones por academia (sobreescriben las globales)
        integrations: {
          stripe: { enabled: false, publishableKey: "", secretKey: "", webhookSecret: "" },
          email: { enabled: false, provider: "resend", apiKey: "", from: "" },
          storage: { enabled: false, provider: "r2", bucket: "", endpoint: "", accessKeyId: "", secretAccessKey: "" },
          ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
          moodle: { enabled: false, baseUrl: "", clientId: "", clientSecret: "" },
          redsys: { enabled: false, merchantCode: "", terminal: "1", secretKey: "", environment: "sandbox" },
          legal: { privacyUrl: "", termsUrl: "", dataController: "", supportEmail: "" },
        },
      },
    ],

    // Usuarios. Cada uno con organizationId (excepto el superadmin).
    users: [
      {
        id: "u_superadmin",
        organizationId: null,
        role: "superadmin",
        name: "Super Administrador",
        email: "super@opoplan.local",
        phone: "",
        photo: "",
        passwordHash: "4e28d45549c49eeb0aac6bca97cd296fa7c78095210ffb21acc1bc7f7d726361",
        status: "active",
      },
      {
        id: "u_admin_demo",
        organizationId: ORG_DEMO,
        role: "admin",
        name: "Administradora Demo",
        email: "admin@opoplan.local",
        phone: "600000001",
        photo: "",
        passwordHash: "458414fa5618236da84e8b18fb4ec02a1a5516e46222bbe4de5317bd9f6d693c",
        status: "active",
      },
      {
        id: "u_prep_1",
        organizationId: ORG_DEMO,
        role: "preparador",
        name: "Preparador Demo",
        email: "preparador@opoplan.local",
        phone: "600000002",
        photo: "",
        passwordHash: "f8c4b948b63dda8fb218f88e4ee1641d03db80e490233b66b36ce9f2ab8123c8",
        status: "active",
        specialty: "Administración General",
      },
      {
        id: "u_opo_1",
        organizationId: ORG_DEMO,
        role: "opositor",
        name: "Lucía Martín",
        email: "lucia@opoplan.local",
        phone: "600000003",
        photo: "",
        passwordHash: "da1fa5e48bb2892f457f4fc0f65081459a3ac373be119e09f4f3c512775c6397",
        status: "active",
        subscriptionPlanId: "plan_premium_tut",
        // Compromiso del opositor (Fase 1)
        commitment: {
          examName: "Auxiliar Administrativo del Estado",
          examDate: "2026-09-18",
          weeklyHours: 21,
          dailyHours: 3,
          activeDays: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
          restDays: ["Domingo"],
          vacationRanges: [],
        },
      },
      {
        id: "u_opo_2",
        organizationId: ORG_DEMO,
        role: "opositor",
        name: "Álvaro Ruiz",
        email: "alvaro@opoplan.local",
        phone: "600000004",
        photo: "",
        passwordHash: "da1fa5e48bb2892f457f4fc0f65081459a3ac373be119e09f4f3c512775c6397",
        status: "active",
        subscriptionPlanId: "plan_premium",
        commitment: {
          examName: "Administrativo C1",
          examDate: "2026-10-10",
          weeklyHours: 12,
          dailyHours: 2,
          activeDays: ["Martes", "Jueves", "Sábado"],
          restDays: ["Domingo"],
          vacationRanges: [],
        },
      },
    ],

    // Asignaciones preparador ↔ opositor con histórico
    assignments: [
      { id: "a_1", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_1", since: "2026-01-20", active: true },
      { id: "a_2", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_2", since: "2026-01-25", active: true },
    ],
    assignmentHistory: [],

    // Resto de colecciones (mantenemos lo que ya había, marcadas con orgId)
    syllabi: [
      {
        id: "s_1",
        organizationId: ORG_DEMO,
        preparadorId: "u_prep_1",
        title: "Administrativo C1",
        description: "Temario base personalizado",
        topics: [
          { id: "t_1", block: "Constitucional", number: "Tema 1", title: "Constitución Española", difficulty: "Alta", priority: "Muy alta", attachments: [] },
          { id: "t_2", block: "Procedimiento", number: "Tema 2", title: "Ley 39/2015", difficulty: "Alta", priority: "Muy alta", attachments: [] },
          { id: "t_3", block: "Función pública", number: "Tema 3", title: "EBEP", difficulty: "Media", priority: "Alta", attachments: [] },
        ],
      },
    ],
    progress: [
      { id: "p_1", organizationId: ORG_DEMO, opositorId: "u_opo_1", topicId: "t_1", status: "En repaso", mastery: 70, studiedCount: 2, lastReview: "2026-04-25", nextReview: "2026-05-02" },
      { id: "p_2", organizationId: ORG_DEMO, opositorId: "u_opo_1", topicId: "t_2", status: "Crítico", mastery: 45, studiedCount: 1, lastReview: "2026-04-20", nextReview: "2026-05-01" },
      { id: "p_3", organizationId: ORG_DEMO, opositorId: "u_opo_2", topicId: "t_1", status: "No cumplido", mastery: 32, studiedCount: 1, lastReview: "2026-04-18", nextReview: "2026-05-03" },
    ],
    plans: [
      {
        id: "pl_1",
        organizationId: ORG_DEMO,
        opositorId: "u_opo_1",
        scenario: "realista",
        weeklyHours: 21,
        recommendation: "Dedicación adecuada.",
        tasks: [
          { id: "task_1", day: "Lunes", type: "Estudio", title: "Tema 2 Ley 39/2015", minutes: 90, done: false, notes: "" },
          { id: "task_2", day: "Miércoles", type: "Repaso", title: "Tema 1 Constitución", minutes: 60, done: false, notes: "" },
          { id: "task_3", day: "Sábado", type: "Simulacro", title: "Test bloque constitucional", minutes: 120, done: false, notes: "" },
        ],
      },
    ],
    events: [
      { id: "e_1", organizationId: ORG_DEMO, ownerType: "opositor", ownerId: "u_opo_1", preparadorId: "u_prep_1", recipients: ["u_opo_1", "u_prep_1"], title: "Tutoría Lucía", type: "videoconferencia", date: "2026-05-03", time: "18:00", recurrence: "none" },
      { id: "e_2", organizationId: ORG_DEMO, ownerType: "preparador", ownerId: "u_prep_1", recipients: ["u_prep_1", "u_opo_2"], title: "Llamada de seguimiento Álvaro", type: "llamada", date: "2026-05-04", time: "17:30", recurrence: "none" },
      // Tarea recurrente automática "Revisar BOE" para los opositores: viernes 13:00 (1h)
      { id: "e_boe_1", organizationId: ORG_DEMO, ownerType: "opositor", ownerId: "u_opo_1", opositorId: "u_opo_1", recipients: ["u_opo_1"], title: "📰 Revisar BOE", type: "tarea", date: "2026-05-08", time: "13:00", durationMin: 60, recurrence: "weekly", recurrenceUntil: "", recurrenceExceptions: [], description: "Revisar el Boletín Oficial del Estado para detectar nuevas convocatorias, modificaciones normativas y publicaciones relevantes." },
      { id: "e_boe_2", organizationId: ORG_DEMO, ownerType: "opositor", ownerId: "u_opo_2", opositorId: "u_opo_2", recipients: ["u_opo_2"], title: "📰 Revisar BOE", type: "tarea", date: "2026-05-08", time: "13:00", durationMin: 60, recurrence: "weekly", recurrenceUntil: "", recurrenceExceptions: [], description: "Revisar el Boletín Oficial del Estado para detectar nuevas convocatorias, modificaciones normativas y publicaciones relevantes." },
    ],
    interactions: [
      { id: "c_1", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_1", type: "mensaje", subject: "Repaso semanal", notes: "Se recomienda reforzar Ley 39/2015.", date: "2026-04-29", durationMin: 0 },
      { id: "c_2", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_2", type: "llamada", subject: "Riesgo de retraso", notes: "Aumentar disponibilidad o mover fecha objetivo.", date: "2026-04-30", durationMin: 25 },
    ],
    subscriptions: [
      { id: "sub_1", organizationId: ORG_DEMO, userId: "u_opo_1", planId: "plan_premium_tut", status: "active", amount: 79, renewalDate: "2026-05-30", provider: "stripe", stripeSubscriptionId: "" },
      { id: "sub_2", organizationId: ORG_DEMO, userId: "u_opo_2", planId: "plan_premium", status: "active", amount: 29, renewalDate: "2026-05-18", provider: "stripe", stripeSubscriptionId: "" },
    ],
    procedures: [
      { id: "tr_1", organizationId: ORG_DEMO, opositorId: "u_opo_1", title: "Inscripción convocatoria", deadline: "2026-05-12", status: "pendiente", notes: "Revisar justificante de tasas." },
      { id: "tr_2", organizationId: ORG_DEMO, opositorId: "u_opo_1", title: "Pago de tasas", deadline: "2026-05-10", status: "en curso", notes: "Guardar PDF del pago." },
      { id: "tr_3", organizationId: ORG_DEMO, opositorId: "u_opo_2", title: "Subsanación documentación", deadline: "2026-05-07", status: "urgente", notes: "Falta certificado académico." },
    ],
    assessments: [
      { id: "as_1", organizationId: ORG_DEMO, opositorId: "u_opo_1", type: "test", title: "Simulacro constitucional", score: 7.3, date: "2026-04-27", topic: "Constitucional", notes: "Errores en artículos 14 y 23." },
      { id: "as_2", organizationId: ORG_DEMO, opositorId: "u_opo_1", type: "supuesto", title: "Procedimiento administrativo", score: 6.8, date: "2026-04-28", topic: "Ley 39/2015", notes: "Mejorar motivación y plazos." },
      { id: "as_3", organizationId: ORG_DEMO, opositorId: "u_opo_2", type: "test", title: "Bloque inicial", score: 4.9, date: "2026-04-26", topic: "Constitucional", notes: "Repetir preguntas falladas." },
    ],
    habits: [
      { id: "h_1", organizationId: ORG_DEMO, opositorId: "u_opo_1", date: "2026-04-30", hours: 3.5, energy: "media", mood: "estable", focus: 80, planCompliance: "full", notes: "Buena sesión de tarde." },
      { id: "h_2", organizationId: ORG_DEMO, opositorId: "u_opo_2", date: "2026-04-30", hours: 1.2, energy: "baja", mood: "cansado", focus: 45, planCompliance: "partial", notes: "Necesita bloques más cortos." },
    ],
    materials: [
      { id: "m_1", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_1", category: "temario_oficial", title: "Esquema Constitución", type: "PDF", topic: "Tema 1", url: "", fileKey: "", updatedAt: "2026-04-20", status: "actualizado" },
      { id: "m_2", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "", category: "plantilla", title: "Plantilla supuesto práctico", type: "Plantilla", topic: "Procedimiento", url: "", fileKey: "", updatedAt: "2026-04-22", status: "compartido" },
    ],
    corrections: [
      { id: "co_1", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_1", title: "Supuesto Ley 39/2015", status: "pendiente", rubric: [{ name: "Contenido", weight: 50 }, { name: "Estructura", weight: 25 }, { name: "Precisión normativa", weight: 25 }], submissionFileKey: "", scores: {}, totalScore: null, feedback: "", dueDate: "2026-05-02" },
      { id: "co_2", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_2", title: "Tema oral Constitución", status: "corregido", rubric: [{ name: "Fluidez", weight: 40 }, { name: "Seguridad", weight: 30 }, { name: "Tiempo", weight: 30 }], submissionFileKey: "", scores: { Fluidez: 6, Seguridad: 6, Tiempo: 6.5 }, totalScore: 6.1, feedback: "Mejorar la cadencia.", dueDate: "2026-04-29" },
    ],
    announcements: [
      { id: "an_1", organizationId: ORG_DEMO, audience: "todos", title: "Nueva actualización normativa", body: "Revisad los temas de procedimiento antes del viernes.", date: "2026-04-30", authorId: "u_admin_demo" },
    ],
    availability: [],
    bookings: [],
    chatThreads: [],
    files: [], // metadatos de archivos subidos (a R2/local)
    notifications: [],
  };
};
