const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, request, asLucia, asSuperadmin } = require("./helpers");

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

test("Telegram: status sin BOT_TOKEN devuelve enabled=false", async () => {
  const cookie = await asLucia();
  const r = await request("GET", "/api/telegram/status", { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, false);
  assert.equal(r.body.linked, false);
});

test("Telegram: confirmar código inválido devuelve 404", async () => {
  const cookie = await asLucia();
  const r = await request("POST", "/api/telegram/confirm", {
    cookie, body: { code: "00000000" },
  });
  assert.equal(r.status, 404);
});

test("Telegram: setup-webhook sin bot configurado devuelve 400", async () => {
  const cookie = await asSuperadmin();
  const r = await request("POST", "/api/telegram/setup-webhook", {
    cookie, body: { url: "https://example.com/api/telegram/webhook" },
  });
  // Sin BOT_TOKEN, bot.enabled=false → 400
  assert.equal(r.status, 400);
});
