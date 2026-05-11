const passwords = require("./passwords");

const PW = {
  super: "4e28d45549c49eeb0aac6bca97cd296fa7c78095210ffb21acc1bc7f7d726361",
  admin: "458414fa5618236da84e8b18fb4ec02a1a5516e46222bbe4de5317bd9f6d693c",
  prep: "f8c4b948b63dda8fb218f88e4ee1641d03db80e490233b66b36ce9f2ab8123c8",
  opo: "da1fa5e48bb2892f457f4fc0f65081459a3ac373be119e09f4f3c512775c6397",
};

// ─────────────────────────────────────────────────────────────────────────────
// Datos semilla. Modelo multi-tenant ampliado con:
//   - Líneas de planes (oposiciones / universidad / EBAU / preparador independiente)
//   - Procesos selectivos múltiples por preparador (transcripción ~20:22)
//   - Temario propio del opositor además del de la academia (~20:43)
//   - Integración de IA personal por usuario (~20:53)
//   - Registro de trámites con adjuntos y fecha (~20:34)
//   - Configuración de chatbot por modo (~20:18)
//   - Configuración de recordatorios de inactividad y cuestionarios NPS (~20:30, 21:00)
//   - Adjuntos en instrucciones de ejercicios (~20:21)
//   - Rankings y retos entre opositores (~20:26)
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
    // suyos propios además de estos. Cada plan tiene una `line` que clasifica
    // su oferta (oposiciones, universidad, EBAU, preparador independiente).
    subscriptionPlans: [
      {
        id: "plan_free",
        scope: "global",
        organizationId: null,
        line: "oposiciones",
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
        line: "oposiciones",
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
        line: "oposiciones",
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
        line: "preparador_independiente",
        name: "Preparador independiente",
        target: "preparador",
        price: 39,
        currency: "EUR",
        period: "monthly",
        trialDays: 30,
        features: ["Hasta 20 opositores", "Hasta 3 procesos selectivos", "Biblioteca propia", "Marca personal"],
        active: true,
        // Cuotas del plan (transcripción ~20:22): cuántos procesos puede abrir
        quota: { maxOpositores: 20, maxProcesses: 3 },
      },
      {
        id: "plan_prep_team",
        scope: "global",
        organizationId: null,
        line: "preparador_independiente",
        name: "Preparador equipo",
        target: "preparador",
        price: 79,
        currency: "EUR",
        period: "monthly",
        trialDays: 14,
        features: ["Hasta 50 opositores", "Procesos ilimitados", "Biblioteca propia", "Marca personal"],
        active: true,
        quota: { maxOpositores: 50, maxProcesses: 999 },
      },
      // Línea EBAU / Universidad (transcripción ~19:57)
      {
        id: "plan_ebau",
        scope: "global",
        organizationId: null,
        line: "ebau",
        name: "Plan EBAU",
        target: "opositor",
        price: 19,
        currency: "EUR",
        period: "monthly",
        trialDays: 14,
        features: ["Asignaturas por comunidad autónoma", "Plan personalizado", "Técnicas de estudio"],
        active: true,
      },
      {
        id: "plan_uni",
        scope: "global",
        organizationId: null,
        line: "universidad",
        name: "Plan Universitario",
        target: "opositor",
        price: 19,
        currency: "EUR",
        period: "monthly",
        trialDays: 14,
        features: ["Plan por asignaturas", "Recursos por carrera", "Técnicas de estudio"],
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
        type: "academia", // academia | preparador_independiente
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
          videoconference: { enabled: false, provider: "zoom", account: "", baseUrl: "" }, // transcripción ~20:11
          redsys: { enabled: false, merchantCode: "", terminal: "1", secretKey: "", environment: "sandbox" },
          legal: { privacyUrl: "", termsUrl: "", dataController: "", supportEmail: "" },
        },
        // Activación/desactivación de planes globales por academia (~20:03)
        // Si globalPlanOverrides[planId].active === false, la academia no muestra ese plan.
        globalPlanOverrides: {},
        // Configuración del cuestionario NPS (~21:00)
        nps: {
          enabled: false,
          template: "nps_classic",
          frequency: "monthly", // monthly | onCancel | manual
          customQuestions: [],
        },
        // Defecto de recordatorio de inactividad (~20:30) y compromiso roto (~20:38)
        defaults: {
          inactivityReminder: { preset: "normal", days: 7 },
          brokenCommitmentEmail: { enabled: true, daysInARow: 3 },
          unconsumedTutoringEmail: { enabled: true },
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
        passwordHash: PW.super,
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
        passwordHash: PW.admin,
        status: "active",
      },
      {
        id: "u_prep_1",
        organizationId: ORG_DEMO,
        role: "preparador",
        name: "Preparador Demo",
        email: "preparador@opoplan.local",
        phone: "600000002",
        whatsapp: "", // (~20:29)
        photo: "",
        passwordHash: PW.prep,
        status: "active",
        specialty: "Administración General",
        // Configuración del chatbot que aplica el preparador (~20:18)
        chatbotMode: "auto_general",
        // Recordatorio de inactividad personalizado por preparador (~20:30)
        inactivitySettings: { preset: "normal", days: 7, enabled: true },
        // IA personal del preparador (~20:53). Cuando aporta su clave la usamos
        // en lugar de la de la academia.
        ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
      },
      {
        id: "u_opo_1",
        organizationId: ORG_DEMO,
        role: "opositor",
        name: "Lucía Martín",
        email: "lucia@opoplan.local",
        phone: "600000003",
        whatsapp: "600000003",
        whatsappOptIn: true,
        photo: "",
        passwordHash: PW.opo,
        status: "active",
        subscriptionPlanId: "plan_premium_tut",
        chatbotEnabled: true,
        // Compromiso del opositor (Fase 1 + visible para preparador en ~20:38)
        commitment: {
          examName: "Auxiliar Administrativo del Estado",
          examDate: "2026-09-18",
          weeklyHours: 21,
          dailyHours: 3,
          activeDays: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
          restDays: ["Domingo"],
          vacationRanges: [],
        },
        // IA personal (~20:53)
        ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
        // Si el opositor decide aparecer en rankings públicos (~20:27)
        rankingOptIn: true,
      },
      {
        id: "u_opo_2",
        organizationId: ORG_DEMO,
        role: "opositor",
        name: "Álvaro Ruiz",
        email: "alvaro@opoplan.local",
        phone: "600000004",
        whatsapp: "",
        whatsappOptIn: false,
        photo: "",
        passwordHash: PW.opo,
        status: "active",
        subscriptionPlanId: "plan_premium",
        chatbotEnabled: false,
        commitment: {
          examName: "Administrativo C1",
          examDate: "2026-10-10",
          weeklyHours: 12,
          dailyHours: 2,
          activeDays: ["Martes", "Jueves", "Sábado"],
          restDays: ["Domingo"],
          vacationRanges: [],
        },
        ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
        rankingOptIn: false,
      },
    ],

    // Asignaciones preparador ↔ opositor con histórico. Vinculadas a un proceso (~20:22).
    assignments: [
      { id: "a_1", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_1", processId: "proc_1", since: "2026-01-20", active: true },
      { id: "a_2", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_2", processId: "proc_1", since: "2026-01-25", active: true },
    ],
    assignmentHistory: [],

    // Procesos selectivos del preparador (transcripción ~20:22).
    // Cada preparador puede tener varios procesos abiertos a la vez.
    processes: [
      {
        id: "proc_1",
        organizationId: ORG_DEMO,
        preparadorId: "u_prep_1",
        name: "Administrativo C1 — Junta de Andalucía",
        examName: "Administrativo C1",
        examDate: "2026-10-10",
        organism: "Junta de Andalucía",
        level: "C1",
        status: "active",
        description: "Proceso principal del preparador. 70 temas oficiales.",
        syllabusId: "s_1",
        createdAt: "2026-01-20T00:00:00.000Z",
      },
    ],

    // Temarios de academia/preparador. El opositor también tiene su propio
    // temario en `personalSyllabi` (transcripción ~20:43).
    syllabi: [
      {
        id: "s_1",
        organizationId: ORG_DEMO,
        processId: "proc_1",
        preparadorId: "u_prep_1",
        title: "Administrativo C1",
        description: "Temario base personalizado",
        topics: [
          { id: "t_1", block: "Constitucional", number: "Tema 1", title: "Constitución Española", difficulty: "Alta", priority: "Muy alta", attachments: [], links: [] },
          { id: "t_2", block: "Procedimiento", number: "Tema 2", title: "Ley 39/2015", difficulty: "Alta", priority: "Muy alta", attachments: [], links: [] },
          { id: "t_3", block: "Función pública", number: "Tema 3", title: "EBEP", difficulty: "Media", priority: "Alta", attachments: [], links: [] },
        ],
      },
    ],

    // Temario propio del opositor (~20:43-44). Distinto al de la academia.
    personalSyllabi: [
      // Vacío por defecto. Cuando el opositor sube material lo metemos aquí.
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
      { id: "tr_1", organizationId: ORG_DEMO, opositorId: "u_opo_1", title: "Inscripción convocatoria", deadline: "2026-05-12", status: "pendiente", notes: "Revisar justificante de tasas.", registry: [] },
      { id: "tr_2", organizationId: ORG_DEMO, opositorId: "u_opo_1", title: "Pago de tasas", deadline: "2026-05-10", status: "en curso", notes: "Guardar PDF del pago.", registry: [] },
      { id: "tr_3", organizationId: ORG_DEMO, opositorId: "u_opo_2", title: "Subsanación documentación", deadline: "2026-05-07", status: "urgente", notes: "Falta certificado académico.", registry: [] },
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
      // `instructionFileIds[]` añadido en la mejora ~20:21
      { id: "co_1", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_1", title: "Supuesto Ley 39/2015", instructions: "", instructionFileIds: [], status: "pendiente", rubric: [{ name: "Contenido", weight: 50 }, { name: "Estructura", weight: 25 }, { name: "Precisión normativa", weight: 25 }], submissionFileKey: "", scores: {}, totalScore: null, feedback: "", dueDate: "2026-05-02" },
      { id: "co_2", organizationId: ORG_DEMO, preparadorId: "u_prep_1", opositorId: "u_opo_2", title: "Tema oral Constitución", instructions: "", instructionFileIds: [], status: "corregido", rubric: [{ name: "Fluidez", weight: 40 }, { name: "Seguridad", weight: 30 }, { name: "Tiempo", weight: 30 }], submissionFileKey: "", scores: { Fluidez: 6, Seguridad: 6, Tiempo: 6.5 }, totalScore: 6.1, feedback: "Mejorar la cadencia.", dueDate: "2026-04-29" },
    ],
    announcements: [
      { id: "an_1", organizationId: ORG_DEMO, audience: "todos", title: "Nueva actualización normativa", body: "Revisad los temas de procedimiento antes del viernes.", date: "2026-04-30", authorId: "u_admin_demo" },
    ],
    availability: [],
    bookings: [],
    chatThreads: [],
    files: [],
    notifications: [],
    // Retos / rankings entre opositores (~20:26)
    challenges: [],
    challengeAttempts: [],
    // Respuestas NPS de opositores (~21:00)
    npsResponses: [],
    // Resumenes/test/mapas que el opositor genera con su IA personal (~20:43)
    aiArtifacts: [],
    // Actividad de usuarios para detectar inactividad (~20:30)
    activityLog: [],
  };
};
