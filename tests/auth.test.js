const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, request, asAdmin, asLucia, asSuperadmin, testUser } = require("./helpers");

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

test("login con credenciales correctas devuelve user + cookie", async () => {
  const user = testUser("lucia");
  const r = await request("POST", "/api/auth/login", {
    body: { email: user.email, password: user.password },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, "opositor");
  assert.ok(r.setCookie, "set-cookie esperado");
});

test("login con password incorrecto devuelve 401", async () => {
  const user = testUser("lucia");
  const r = await request("POST", "/api/auth/login", {
    body: { email: user.email, password: "wrong" },
  });
  assert.equal(r.status, 401);
});

test("/api/auth/me sin sesión devuelve user: null", async () => {
  const r = await request("GET", "/api/auth/me");
  assert.equal(r.status, 200);
  assert.equal(r.body.user, null);
});

test("admin ve plan contratado de su academia en /me", async () => {
  const cookie = await asAdmin();
  const r = await request("GET", "/api/auth/me", { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.organization.subscriptionPlanId, "plan_academy_starter");
  assert.equal(r.body.organization.subscriptionStatus, "active");
});

test("opositor no puede acceder a endpoints de admin", async () => {
  const cookie = await asLucia();
  const r = await request("GET", "/api/admin/dashboard", { cookie });
  assert.equal(r.status, 403);
});

test("superadmin lista los 11 planes (3 academia + 3 prep + 3 opositor + 2 extras)", async () => {
  const cookie = await asSuperadmin();
  const r = await request("GET", "/api/superadmin/plans", { cookie });
  assert.equal(r.status, 200);
  const plans = r.body.plans;
  assert.equal(plans.length, 11);
  const targets = {};
  for (const p of plans) targets[p.target] = (targets[p.target] || 0) + 1;
  assert.equal(targets.academia, 3);
  assert.equal(targets.preparador, 3);
  assert.equal(targets.opositor, 5); // 3 + EBAU + Universidad
});
