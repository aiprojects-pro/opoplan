const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, request, asAdmin } = require("./helpers");

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

test("RAG: estado inicial sin chunks indexados", async () => {
  const cookie = await asAdmin();
  const r = await request("GET", "/api/rag/status", { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.indexed, 0);
});

test("RAG: reindex genera chunks de syllabi + questionBank con embedder mock", async () => {
  const cookie = await asAdmin();
  const r = await request("POST", "/api/rag/reindex", { cookie });
  assert.equal(r.status, 200);
  assert.ok(r.body.indexed > 0, "debe indexar al menos algo");
  assert.equal(r.body.provider, "mock"); // sin API keys → mock embedder
});

test("RAG: búsqueda por similitud devuelve hits ordenados por score", async () => {
  const cookie = await asAdmin();
  const r = await request("POST", "/api/rag/search", {
    cookie,
    body: { query: "valores superiores Constitución" },
  });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.hits));
  if (r.body.hits.length > 1) {
    // Los scores deben estar ordenados descendentemente
    for (let i = 1; i < r.body.hits.length; i++) {
      assert.ok(r.body.hits[i - 1].score >= r.body.hits[i].score);
    }
  }
});

test("RAG: estado tras reindex muestra provider y conteo por kind", async () => {
  const cookie = await asAdmin();
  const r = await request("GET", "/api/rag/status", { cookie });
  assert.equal(r.status, 200);
  assert.ok(r.body.indexed > 0);
  assert.equal(r.body.provider, "mock");
  assert.ok(r.body.byKind.question >= 1);
});
