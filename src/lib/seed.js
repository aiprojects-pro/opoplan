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
      // ─────────────────────────────────────────────────────────────────────
      // OPOSITOR INDIVIDUAL (B2C) — line: oposiciones, target: opositor
      // Diseño: free para captación, Pro para autodidacta serio, Plus con
      // tutorías humanas. Los costes de IA los asume el opositor cuando
      // conecta su API personal (transcripción ~20:53, catálogo §B.1/§B.2).
      // ─────────────────────────────────────────────────────────────────────
      {
        id: "plan_opo_free",
        scope: "global", organizationId: null,
        line: "oposiciones", target: "opositor",
        name: "Free",
        price: 0, currency: "EUR", period: "monthly",
        trialDays: 0,
        tagline: "Para probar la plataforma",
        features: [
          "Plan personalizado básico",
          "Agenda y compromiso de estudio",
          "1 simulacro al mes",
          "Hasta 5 temas en temario propio",
          "Comunidad y retos abiertos",
          "IA opcional con tu propia API key (mock por defecto)",
        ],
        limits: { simulacrosPerMonth: 1, personalTopics: 5, hasTutoring: false, hasAdaptivePlan: false },
        active: true,
      },
      {
        id: "plan_opo_pro",
        scope: "global", organizationId: null,
        line: "oposiciones", target: "opositor",
        name: "Pro",
        price: 14.99, currency: "EUR", period: "monthly",
        trialDays: 14,
        tagline: "Para opositor autodidacta",
        features: [
          "Todo lo de Free",
          "Plan adaptativo (recálculo según resultados)",
          "Simulacros y pruebas ilimitadas",
          "Generación con IA: tests, resúmenes y mapas (con tu API key)",
          "Asistente IA conversacional 24/7 (con tu API key)",
          "Trámites con registro de presentación",
          "Predictor «¿estoy listo?» según notas",
          "Retos y rankings (opt-in)",
        ],
        limits: { simulacrosPerMonth: 999, personalTopics: 999, hasTutoring: false, hasAdaptivePlan: true },
        active: true,
      },
      {
        id: "plan_opo_plus",
        scope: "global", organizationId: null,
        line: "oposiciones", target: "opositor",
        name: "Pro + Tutorías",
        price: 39.99, currency: "EUR", period: "monthly",
        trialDays: 14,
        tagline: "Para opositor con seguimiento humano",
        features: [
          "Todo lo de Pro",
          "2 tutorías de 30 min/mes con preparador asignado",
          "Correcciones personalizadas de ejercicios",
          "Informes mensuales personalizados",
          "Acceso a simulacros nacionales certificados (cuando estén)",
          "Soporte prioritario por email",
        ],
        limits: { simulacrosPerMonth: 999, personalTopics: 999, hasTutoring: true, tutoringPerMonth: 2, hasAdaptivePlan: true },
        active: true,
      },

      // ─────────────────────────────────────────────────────────────────────
      // PREPARADOR INDEPENDIENTE — line: preparador_independiente
      // Diseño: tres tramos por número de opositores, sin pasar por academia.
      // El preparador conecta su propia IA opcionalmente (~20:53). Quotas
      // (maxOpositores/maxProcesses) ya validadas en src/routes/processes.js.
      // ─────────────────────────────────────────────────────────────────────
      {
        id: "plan_prep_solo",
        scope: "global", organizationId: null,
        line: "preparador_independiente", target: "preparador",
        name: "Solo",
        price: 29, currency: "EUR", period: "monthly",
        priceYearly: 290,
        trialDays: 30,
        tagline: "Empezando como preparador",
        features: [
          "Hasta 5 opositores",
          "1 proceso selectivo",
          "Marca personal (logo)",
          "Plan adaptativo, agenda y tutorías",
          "Chatbot supervisado / off",
          "IA opcional con tu propia API key",
          "Soporte por email",
        ],
        quota: { maxOpositores: 5, maxProcesses: 1 },
        active: true,
      },
      {
        id: "plan_prep_pro",
        scope: "global", organizationId: null,
        line: "preparador_independiente", target: "preparador",
        name: "Pro",
        price: 79, currency: "EUR", period: "monthly",
        priceYearly: 790,
        trialDays: 14,
        tagline: "Preparador profesional consolidado",
        features: [
          "Hasta 20 opositores",
          "Hasta 3 procesos selectivos",
          "Marca personal completa (logo + colores + favicon)",
          "Carga masiva CSV con email automático",
          "Adjuntos en instrucciones de ejercicios",
          "Retos y rankings entre opositores",
          "Chatbot con 4 modos (off / supervisado / auto general / auto full)",
          "IA opcional con tu propia API key",
        ],
        quota: { maxOpositores: 20, maxProcesses: 3 },
        active: true,
      },
      {
        id: "plan_prep_business",
        scope: "global", organizationId: null,
        line: "preparador_independiente", target: "preparador",
        name: "Business",
        price: 149, currency: "EUR", period: "monthly",
        priceYearly: 1490,
        trialDays: 14,
        tagline: "Preparador con cartera grande",
        features: [
          "Hasta 50 opositores",
          "Hasta 10 procesos selectivos",
          "Subdominio personalizado (preparador.tudominio.com)",
          "Informes mensuales automáticos",
          "Encuesta NPS a tus alumnos",
          "Videoconferencia integrada (Zoom/Meet/Teams/Jitsi)",
          "API para integrar con tu Moodle",
          "Soporte prioritario (email + Slack)",
        ],
        quota: { maxOpositores: 50, maxProcesses: 10 },
        active: true,
      },

      // ─────────────────────────────────────────────────────────────────────
      // ACADEMIA (B2B) — line: academia, target: academia
      // Diseño: tres tramos por tamaño. La academia tiene varios preparadores
      // y muchos opositores. Stripe propio, branding propio, integraciones
      // propias. La IA de la academia es opcional: sus usuarios pueden
      // conectar la suya (transcripción ~20:53, catálogo §A.1).
      // ─────────────────────────────────────────────────────────────────────
      {
        id: "plan_academy_starter",
        scope: "global", organizationId: null,
        line: "academia", target: "academia",
        name: "Starter",
        price: 199, currency: "EUR", period: "monthly",
        priceYearly: 1990,
        trialDays: 30,
        tagline: "Academia pequeña, 1-3 preparadores",
        features: [
          "Hasta 3 preparadores",
          "Hasta 100 opositores activos",
          "Hasta 5 procesos selectivos",
          "Branding básico (logo + colores)",
          "Encuesta NPS",
          "Videoconferencia Jitsi pública",
          "Email y storage del sistema",
          "IA opcional (la academia conecta su API key, o cada usuario la suya)",
        ],
        quota: { maxPreparadores: 3, maxOpositores: 100, maxProcesses: 5 },
        active: true,
      },
      {
        id: "plan_academy_growth",
        scope: "global", organizationId: null,
        line: "academia", target: "academia",
        name: "Growth",
        price: 499, currency: "EUR", period: "monthly",
        priceYearly: 4990,
        trialDays: 14,
        tagline: "Academia consolidada, hasta 500 opositores",
        features: [
          "Hasta 10 preparadores",
          "Hasta 500 opositores activos",
          "Hasta 20 procesos selectivos",
          "Branding completo (subdominio, logo, favicon, lema)",
          "Integración Moodle",
          "Stripe Checkout (cobras tú a tus opositores)",
          "Carga masiva CSV con email automático",
          "Videoconferencia Zoom/Meet/Teams (con tus credenciales)",
          "Storage propio (S3/R2) y email propio (SMTP/Resend)",
          "Plantillas NPS extendidas",
          "IA opcional para toda la academia",
        ],
        quota: { maxPreparadores: 10, maxOpositores: 500, maxProcesses: 20 },
        active: true,
      },
      {
        id: "plan_academy_enterprise",
        scope: "global", organizationId: null,
        line: "academia", target: "academia",
        name: "Enterprise",
        price: 1299, currency: "EUR", period: "monthly",
        priceYearly: 12990,
        trialDays: 0, // contrato comercial, sin trial
        tagline: "Academia grande / red de academias",
        features: [
          "Preparadores y opositores ilimitados",
          "Procesos selectivos ilimitados",
          "Marketplace B2B de bancos de preguntas (cuando esté disponible)",
          "API completa",
          "White-label / reseller (puedes vender a sub-academias)",
          "IA premium centralizada (la academia paga, sus opositores no necesitan API key)",
          "Auditoría inicial de apuntes (única, incluida)",
          "SLA 99.9%",
          "Onboarding asistido + soporte 24h",
        ],
        quota: { maxPreparadores: 9999, maxOpositores: 9999, maxProcesses: 9999 },
        active: true,
      },

      // ─────────────────────────────────────────────────────────────────────
      // Líneas adicionales (transcripción ~19:57): EBAU y Universidad
      // Mantenemos un único plan por cada línea por ahora — se pueden
      // ampliar a 3 paquetes cuando se valide la demanda.
      // ─────────────────────────────────────────────────────────────────────
      {
        id: "plan_ebau",
        scope: "global", organizationId: null,
        line: "ebau", target: "opositor",
        name: "EBAU",
        price: 9.99, currency: "EUR", period: "monthly",
        trialDays: 14,
        tagline: "Para alumnos de Bachillerato",
        features: ["Asignaturas por comunidad autónoma", "Plan personalizado", "Técnicas de estudio", "IA opcional con tu API key"],
        active: true,
      },
      {
        id: "plan_uni",
        scope: "global", organizationId: null,
        line: "universidad", target: "opositor",
        name: "Universidad",
        price: 9.99, currency: "EUR", period: "monthly",
        trialDays: 14,
        tagline: "Para estudiantes universitarios",
        features: ["Plan por asignaturas", "Recursos por carrera", "Técnicas de estudio", "IA opcional con tu API key"],
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
        // Plan contratado por la academia con OpoPlan (nivel B2B).
        // El admin de la academia ve esto en su panel de suscripción.
        subscriptionPlanId: "plan_academy_starter",
        subscriptionStatus: "active",
        subscriptionRenewalDate: "2026-06-15",
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
        subscriptionPlanId: "plan_opo_plus",
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
        subscriptionPlanId: "plan_opo_pro",
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
      { id: "sub_1", organizationId: ORG_DEMO, userId: "u_opo_1", planId: "plan_opo_plus", status: "active", amount: 39.99, renewalDate: "2026-05-30", provider: "stripe", stripeSubscriptionId: "" },
      { id: "sub_2", organizationId: ORG_DEMO, userId: "u_opo_2", planId: "plan_opo_pro", status: "active", amount: 14.99, renewalDate: "2026-05-18", provider: "stripe", stripeSubscriptionId: "" },
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

    // ─── FASE 6: catálogo extendido ─────────────────────────────────────────

    // Banco de preguntas estructurado, alimentado por el preparador. Cada
    // pregunta queda etiquetada por tema y normativa de referencia, lo que
    // habilita: (1) dashboard analítico, (2) cruce con monitor normativo,
    // (3) marketplace de packs.
    questionBank: [
      {
        id: "qb_1", organizationId: ORG_DEMO, processId: "proc_1", topicId: "t_1",
        text: "Según el artículo 1.1 de la Constitución, España se constituye en un Estado social y democrático de Derecho. ¿Cuáles son sus valores superiores?",
        options: [
          "Libertad, justicia, igualdad y pluralismo político",
          "Libertad, justicia, igualdad y solidaridad",
          "Libertad, dignidad, igualdad y pluralismo político",
          "Libertad, justicia, soberanía y pluralismo político",
        ],
        correct: 0,
        difficulty: "media",
        norm: "CE 1978, art. 1.1",
        normIssuedAt: "1978-12-29",
        explanation: "Los valores superiores del ordenamiento jurídico son los cuatro citados literalmente en el art. 1.1.",
        tags: ["constitucion", "tit_preliminar"],
        active: true,
      },
      {
        id: "qb_2", organizationId: ORG_DEMO, processId: "proc_1", topicId: "t_1",
        text: "El Estado se organiza territorialmente en municipios, provincias y…",
        options: [
          "Comunidades Autónomas que se constituyan",
          "Áreas metropolitanas",
          "Comarcas y mancomunidades",
          "Diputaciones forales",
        ],
        correct: 0,
        difficulty: "facil",
        norm: "CE 1978, art. 137",
        normIssuedAt: "1978-12-29",
        explanation: "Art. 137 CE: 'El Estado se organiza territorialmente en municipios, en provincias y en las Comunidades Autónomas que se constituyan'.",
        tags: ["constitucion", "tit_VIII"],
        active: true,
      },
      {
        id: "qb_3", organizationId: ORG_DEMO, processId: "proc_1", topicId: "t_2",
        text: "El plazo general para resolver el procedimiento administrativo común es de…",
        options: [
          "Tres meses, salvo que una norma con rango de ley fije uno mayor",
          "Tres meses, sin posibilidad de ampliación",
          "Seis meses, salvo norma específica",
          "Un mes, ampliable a tres",
        ],
        correct: 0,
        difficulty: "media",
        norm: "Ley 39/2015, art. 21.2",
        normIssuedAt: "2015-10-01",
        explanation: "Art. 21.2 LPAC: 'el plazo máximo en el que debe notificarse la resolución expresa será el fijado por la norma reguladora del correspondiente procedimiento. Este plazo no podrá exceder de seis meses salvo que una norma con rango de Ley establezca uno mayor o así venga previsto en el Derecho de la Unión Europea'. El supletorio es 3 meses (art. 21.3).",
        tags: ["lpac", "plazos"],
        active: true,
      },
    ],

    // Intentos de simulacro con métricas cognitivas (catálogo §A.6 / §B.X):
    // tiempo por pregunta, cambios de respuesta, confianza declarada, orden.
    // Lo que permite calcular calibración y mapa de vulnerabilidad.
    simulacroAttempts: [
      {
        id: "sa_1", organizationId: ORG_DEMO, opositorId: "u_opo_1", processId: "proc_1",
        startedAt: "2026-04-27T10:00:00.000Z",
        finishedAt: "2026-04-27T11:42:00.000Z",
        durationSec: 6120,
        score: 7.3,
        questions: [
          { qbId: "qb_1", chosen: 0, correct: 0, timeMs: 38000, changes: 0, confidence: "sure" },
          { qbId: "qb_2", chosen: 0, correct: 0, timeMs: 22000, changes: 0, confidence: "sure" },
          { qbId: "qb_3", chosen: 2, correct: 0, timeMs: 95000, changes: 2, confidence: "doubt" },
        ],
      },
      {
        id: "sa_2", organizationId: ORG_DEMO, opositorId: "u_opo_2", processId: "proc_1",
        startedAt: "2026-04-26T15:00:00.000Z",
        finishedAt: "2026-04-26T16:35:00.000Z",
        durationSec: 5700,
        score: 4.9,
        questions: [
          { qbId: "qb_1", chosen: 1, correct: 0, timeMs: 51000, changes: 1, confidence: "doubt" },
          { qbId: "qb_2", chosen: 2, correct: 0, timeMs: 68000, changes: 0, confidence: "guess" },
          { qbId: "qb_3", chosen: 0, correct: 0, timeMs: 41000, changes: 0, confidence: "sure" },
        ],
      },
    ],

    // Alertas del monitor normativo (catálogo §A.2). En producción las genera
    // un servicio externo que vigila BOE/BOJA/DOUE. Aquí van datos de muestra
    // para que la academia vea el flujo desde el primer arranque.
    normativeAlerts: [
      {
        id: "na_1", organizationId: ORG_DEMO,
        level: "important",
        source: "BOE",
        sourceUrl: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7XXXX",
        publishedAt: "2026-04-30",
        norm: "Ley 39/2015, art. 21",
        normIssuedAt: "2015-10-01",
        title: "Modificación del régimen de plazos en el procedimiento administrativo común",
        summary: "El nuevo redactado clarifica el cómputo del plazo para resoluciones electrónicas y modifica la referencia al Derecho de la Unión Europea.",
        affectsTopicIds: ["t_2"],
        affectsQuestionIds: ["qb_3"],
        diff: "antes: 'Este plazo no podrá exceder de seis meses…'\ndespués: 'Este plazo no podrá exceder de seis meses, computado desde la fecha en que la solicitud haya tenido entrada en el registro electrónico…'",
        status: "open", // open | dismissed | resolved
        createdAt: "2026-04-30T08:15:00.000Z",
      },
      {
        id: "na_2", organizationId: ORG_DEMO,
        level: "informative",
        source: "BOJA",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2026/8X/index.html",
        publishedAt: "2026-04-22",
        norm: "Decreto 100/2026 de organización de la Junta de Andalucía",
        normIssuedAt: "2026-04-22",
        title: "Nueva estructura del Servicio Andaluz de Salud",
        summary: "Reorganización de las unidades administrativas del SAS. Afecta a temas de organización autonómica del temario de Administrativo.",
        affectsTopicIds: ["t_2"],
        affectsQuestionIds: [],
        diff: "",
        status: "open",
        createdAt: "2026-04-22T10:00:00.000Z",
      },
    ],

    // Marketplace B2B (catálogo §A.8): packs de bancos de preguntas listados
    // por academias vendedoras. La compra entre academias requiere Stripe
    // Connect (out of scope MVP) — aquí lo hacemos como transferencia
    // simulada que copia las preguntas a la academia compradora.
    marketplacePacks: [
      {
        id: "mkt_1", sellerOrgId: "org_partner_demo",
        sellerName: "Academia Partner Demo",
        category: "test_bank",
        title: "Banco completo Administrativo C1 — Junta Andalucía 2024-2026",
        description: "1.840 preguntas verificadas tipo ABCD, cubre los 70 temas, actualizado tras la reforma de la LPAC. Tasa de acierto media en simulacros: 64%.",
        oposicion: "Administrativo C1",
        scope: "Junta de Andalucía",
        questionsCount: 1840,
        topicsCovered: 70,
        coveragePct: 96,
        avgAccuracyPct: 64,
        lastUpdatedAt: "2026-03-15",
        certified: true,
        priceLicense: 449, // licencia anual
        priceOneOff: 1290, // venta única
        currency: "EUR",
        ratingAvg: 4.6,
        ratingCount: 12,
        // Demo: el pack incluye las 3 preguntas del banco. En producción aquí
        // van los IDs de las preguntas que el vendedor selecciona para vender.
        questionIds: ["qb_1", "qb_2", "qb_3"],
        active: true,
      },
      {
        id: "mkt_2", sellerOrgId: "org_partner_demo",
        sellerName: "Academia Partner Demo",
        category: "case_studies",
        title: "100 supuestos prácticos resueltos — LPAC + LRJSP",
        description: "Supuestos con rúbrica completa y solución comentada por área temática.",
        oposicion: "Administrativo / TAG",
        scope: "AGE / autonómico",
        questionsCount: 100,
        topicsCovered: 22,
        coveragePct: 78,
        avgAccuracyPct: 0,
        lastUpdatedAt: "2026-02-01",
        certified: false,
        priceLicense: 199,
        priceOneOff: 549,
        currency: "EUR",
        ratingAvg: 4.2,
        ratingCount: 5,
        active: true,
      },
    ],
    marketplacePurchases: [],

    // Wellbeing: chequeos de estrés del opositor (catálogo §B.7).
    stressChecks: [
      {
        id: "sc_1", organizationId: ORG_DEMO, opositorId: "u_opo_1",
        weekOf: "2026-04-22",
        answers: { overwhelm: 4, sleep: 2, focus: 4, doubt: 3, joy: 2 },
        score: 18, // alto
        notes: "Empieza a notar el cansancio acumulado.",
        createdAt: "2026-04-22T09:00:00.000Z",
      },
    ],

    // ─── FASE 6 ampliada ─────────────────────────────────────────────────
    // Certificación interna (catálogo §A.10.3)
    certificates: [],
    // Simulacros interacadémicos (catálogo §A.10.4)
    alliances: [],
    crossSimulacros: [],
    // Seguro de convocatoria (catálogo §A.10.1)
    insurancePolicies: [],
    insuranceEnrollments: [],
    // CRM especializado (catálogo §A.7)
    leads: [],
    alumni: [],
    // Auditoría de apuntes (catálogo §A.9)
    auditRequests: [],
    // Comunidad gamificada (catálogo §B.5)
    studyRooms: [],
    duels: [],
    forumThreads: [],
    mentoringRequests: [],
    // RAG: corpus indexado de cada academia (catálogo §A.10.5)
    ragChunks: [],
    // Vinculaciones del bot de Telegram (catálogo §B.4)
    telegramLinks: [],
    // Suscripciones Web Push (sustituto smartwatch — catálogo §B.4)
    pushSubscriptions: [],
    // PayPal: facturas emitidas por preparadores particulares
    paypalInvoices: [],
  };
};
