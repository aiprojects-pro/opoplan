// Helpers para los tests. Arrancan el servidor en un puerto aleatorio,
// hacen login y devuelven un cliente HTTP con cookies persistentes.

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

let serverInstance = null;
let baseUrl = "";
const cookies = new Map(); // role → cookie string
const testUsers = {
  admin: { email: process.env.OPOPLAN_TEST_ADMIN_EMAIL, password: process.env.OPOPLAN_TEST_ADMIN_PASSWORD },
  preparador: { email: process.env.OPOPLAN_TEST_PREPARADOR_EMAIL, password: process.env.OPOPLAN_TEST_PREPARADOR_PASSWORD },
  lucia: { email: process.env.OPOPLAN_TEST_LUCIA_EMAIL, password: process.env.OPOPLAN_TEST_LUCIA_PASSWORD },
  alvaro: { email: process.env.OPOPLAN_TEST_ALVARO_EMAIL, password: process.env.OPOPLAN_TEST_ALVARO_PASSWORD },
  superadmin: { email: process.env.OPOPLAN_TEST_SUPERADMIN_EMAIL, password: process.env.OPOPLAN_TEST_SUPERADMIN_PASSWORD },
};

function testUser(key) {
  const user = testUsers[key];
  if (!user?.email || !user?.password) {
    throw new Error(`Missing test credentials for ${key}. Set OPOPLAN_TEST_* environment variables.`);
  }
  return user;
}

async function startServer() {
  if (serverInstance) return baseUrl;
  // Reset DB antes de arrancar
  const dataPath = path.join(__dirname, "..", "data", "app-data.json");
  if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);

  process.env.NODE_ENV = "test";
  // Limpiar caché de require para que el módulo se cargue fresco con la DB nueva
  Object.keys(require.cache).forEach((k) => {
    if (k.includes("/opoplan-main/")) delete require.cache[k];
  });

  // Importar el server completo (con todos sus middlewares + routes wireados)
  const { app } = require("../server");
  await new Promise((resolve) => {
    serverInstance = app.listen(0, () => resolve());
  });
  const port = serverInstance.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  return baseUrl;
}

async function stopServer() {
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
    serverInstance = null;
    baseUrl = "";
    cookies.clear(); // reset entre archivos de test
  }
}

function request(method, urlPath, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const data = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try { parsed = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
          // Capturar cookies de set-cookie
          const sc = res.headers["set-cookie"];
          let setCookie = null;
          if (sc) setCookie = sc.map((s) => s.split(";")[0]).join("; ");
          resolve({ status: res.statusCode, body: parsed, raw: text, setCookie });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login(email, password) {
  const r = await request("POST", "/api/auth/login", { body: { email, password } });
  if (r.status !== 200) throw new Error(`login failed: ${r.status} ${r.raw}`);
  return r.setCookie;
}

async function asAdmin() {
  const user = testUser("admin");
  if (!cookies.has("admin")) cookies.set("admin", await login(user.email, user.password));
  return cookies.get("admin");
}
async function asPreparador() {
  const user = testUser("preparador");
  if (!cookies.has("preparador")) cookies.set("preparador", await login(user.email, user.password));
  return cookies.get("preparador");
}
async function asLucia() {
  const user = testUser("lucia");
  if (!cookies.has("lucia")) cookies.set("lucia", await login(user.email, user.password));
  return cookies.get("lucia");
}
async function asAlvaro() {
  const user = testUser("alvaro");
  if (!cookies.has("alvaro")) cookies.set("alvaro", await login(user.email, user.password));
  return cookies.get("alvaro");
}
async function asSuperadmin() {
  const user = testUser("superadmin");
  if (!cookies.has("super")) cookies.set("super", await login(user.email, user.password));
  return cookies.get("super");
}

module.exports = {
  startServer, stopServer, request,
  asAdmin, asPreparador, asLucia, asAlvaro, asSuperadmin,
  testUser,
  resetCookies() { cookies.clear(); },
};
