const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, request, asAdmin } = require("./helpers");

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

test("Connect: estado inicial sin cuenta vinculada", async () => {
  const cookie = await asAdmin();
  const r = await request("GET", "/api/payments-connect/status", { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.connected, false);
  assert.equal(r.body.provider, "mock");
});

test("Connect: onboarding crea cuenta y devuelve URL", async () => {
  const cookie = await asAdmin();
  const r = await request("POST", "/api/payments-connect/onboarding", { cookie });
  assert.equal(r.status, 200);
  assert.ok(r.body.accountId.startsWith("acct_mock_"));
  assert.ok(r.body.url.includes("mock_onboarding"));
});

test("Connect: tras simular onboarding, cuenta queda activa", async () => {
  const cookie = await asAdmin();
  // Simular completion en mock
  await request("POST", "/api/payments-connect/simulate-complete", { cookie });
  const r = await request("GET", "/api/payments-connect/status", { cookie });
  assert.equal(r.body.connected, true);
  assert.equal(r.body.chargesEnabled, true);
  assert.equal(r.body.payoutsEnabled, true);
});
