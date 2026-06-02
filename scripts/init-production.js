#!/usr/bin/env node
// Inicialización productiva — crea data/app-data.json desde cero con UNA
// academia real y dos usuarios (superadmin + admin de academia). Pensado para
// el primer arranque en producción: el seed demo (Lucía, Álvaro, academia
// ficticia) sirve para desarrollo, no para vender.
//
// Uso:
//   ORG_NAME="CGD E-Learning Center" \
//   ORG_SLUG="cgd" \
//   ADMIN_EMAIL="ai@frigodar.com" \
//   ADMIN_PASSWORD="cámbiala-tras-el-primer-login" \
//   SUPERADMIN_EMAIL="root@frigodar.com" \
//   SUPERADMIN_PASSWORD="cámbiala-tras-el-primer-login" \
//   node scripts/init-production.js
//
// Si `data/app-data.json` ya existe, aborta. Pasa `--force` para sobrescribir
// (descarta todos los datos actuales).

const fs = require("fs");
const path = require("path");
const passwords = require("../src/lib/passwords");
const seed = require("../src/lib/seed");

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "app-data.json");
const force = process.argv.includes("--force");

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Falta variable de entorno requerida: ${name}`);
    process.exit(1);
  }
  return v;
}

const ORG_NAME = required("ORG_NAME");
const ORG_SLUG = required("ORG_SLUG").toLowerCase().replace(/[^a-z0-9-]/g, "-");
const ADMIN_EMAIL = required("ADMIN_EMAIL");
const ADMIN_PASSWORD = required("ADMIN_PASSWORD");
const SUPERADMIN_EMAIL = required("SUPERADMIN_EMAIL");
const SUPERADMIN_PASSWORD = required("SUPERADMIN_PASSWORD");
const ADMIN_NAME = process.env.ADMIN_NAME || "Administrador";
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME || "Superadmin";

if (fs.existsSync(dataFile) && !force) {
  console.error(`✗ Ya existe ${dataFile}`);
  console.error("  Para sobrescribir (DESTRUCTIVO), pasa --force.");
  process.exit(1);
}
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Reutilizamos el seed demo, pero filtramos: nos quedamos solo con lo global
// (platform + subscriptionPlans) y reemplazamos organizations/users por los
// datos productivos. El resto de colecciones queda vacío — el admin las
// puebla desde la UI.
const demoSeed = seed();
const orgId = "org_" + ORG_SLUG;
const superId = "u_super_1";
const adminId = "u_admin_1";

const data = {
  ...demoSeed,
  organizations: [
    {
      id: orgId,
      name: ORG_NAME,
      slug: ORG_SLUG,
      status: "active",
      type: "academia",
      createdAt: new Date().toISOString().slice(0, 10),
      branding: {
        tagline: "",
        initials: ORG_NAME.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase(),
        primaryColor: "#155ea8",
        secondaryColor: "#08264a",
        accentColor: "#0c8f6f",
        logo: "",
        favicon: "",
      },
      contact: { email: ADMIN_EMAIL, phone: "", website: "", address: "" },
      billing: { legalName: "", taxId: "", address: "", country: "ES", iban: "" },
      integrations: {
        stripe: { enabled: false, publishableKey: "", secretKey: "", webhookSecret: "" },
        email: { enabled: false, provider: "resend", apiKey: "", from: "" },
        storage: { enabled: false, provider: "r2", bucket: "", endpoint: "", accessKeyId: "", secretAccessKey: "" },
        ai: { enabled: false, provider: "gemini", apiKey: "", model: "gemini-1.5-flash" },
        moodle: { enabled: false, baseUrl: "", clientId: "", clientSecret: "" },
        videoconference: { enabled: false, provider: "zoom", account: "", baseUrl: "" },
        redsys: { enabled: false, merchantCode: "", terminal: "1", secretKey: "", environment: "sandbox" },
        legal: { privacyUrl: "", termsUrl: "", dataController: "", supportEmail: "" },
      },
      globalPlanOverrides: {},
      nps: { enabled: false, template: "nps_classic", frequency: "monthly", customQuestions: [] },
      defaults: {
        inactivityReminder: { preset: "normal", days: 7 },
        brokenCommitmentEmail: { enabled: true, daysInARow: 3 },
        unconsumedTutoringEmail: { enabled: true },
      },
    },
  ],
  users: [
    {
      id: superId,
      organizationId: null,
      role: "superadmin",
      name: SUPERADMIN_NAME,
      email: SUPERADMIN_EMAIL,
      phone: "", photo: "",
      passwordHash: passwords.hash(SUPERADMIN_PASSWORD),
      status: "active",
      mustChangePassword: true,
    },
    {
      id: adminId,
      organizationId: orgId,
      role: "admin",
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      phone: "", photo: "",
      passwordHash: passwords.hash(ADMIN_PASSWORD),
      status: "active",
      mustChangePassword: true,
    },
  ],
  // Todo lo demás se vacía — el admin crea desde la UI
  assignments: [], assignmentHistory: [], processes: [], syllabi: [],
  personalSyllabi: [], progress: [], plans: [], events: [], interactions: [],
  subscriptions: [], procedures: [], assessments: [], habits: [], materials: [],
  corrections: [], announcements: [], availability: [], bookings: [],
  chatThreads: [], files: [], notifications: [], challenges: [],
  challengeAttempts: [], npsResponses: [], aiArtifacts: [], activityLog: [],
  questionBank: [], simulacroAttempts: [], normativeAlerts: [],
  studyRooms: [], duels: [], forumThreads: [], mentoringRequests: [],
  ragChunks: [], telegramLinks: [], pushSubscriptions: [], paypalInvoices: [],
  remindersSent: [],
};

fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

console.log(`✓ Base de datos productiva creada en ${dataFile}`);
console.log("");
console.log("  Organización:  " + ORG_NAME + " (slug: " + ORG_SLUG + ")");
console.log("  Superadmin:    " + SUPERADMIN_EMAIL);
console.log("  Admin org:     " + ADMIN_EMAIL);
console.log("");
console.log("  Ambos usuarios tienen mustChangePassword=true.");
console.log("  Arranca con `npm start` y haz login para cambiar contraseña.");
