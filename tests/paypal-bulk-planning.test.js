const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, request, asPreparador, asLucia, asAdmin } = require("./helpers");
const parser = require("../src/lib/topicsBulkParser");

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

// ── PayPal ─────────────────────────────────────────────────────────────────

test("PayPal: preparador configura PayPal.Me y se guarda", async () => {
  const cookie = await asPreparador();
  const r = await request("PATCH", "/api/preparador/me/paypal", {
    cookie,
    body: { mode: "link_only", paypalMeHandle: "miprep", defaultCurrency: "EUR" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, "link_only");

  const get = await request("GET", "/api/preparador/me/paypal", { cookie });
  assert.equal(get.body.paypalMeHandle, "miprep");
  assert.equal(get.body.hasClientSecret, false);
});

test("PayPal: link_only sin handle devuelve 400", async () => {
  const cookie = await asPreparador();
  const r = await request("PATCH", "/api/preparador/me/paypal", {
    cookie,
    body: { mode: "link_only", paypalMeHandle: "" },
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "missing_paypal_me_handle");
});

test("PayPal: preparador crea factura para Lucía y obtiene URL paypal.me", async () => {
  const cookie = await asPreparador();
  const r = await request("POST", "/api/paypal/invoices", {
    cookie,
    body: { opositorId: "u_opo_1", amount: 80, concept: "Mensualidad mayo" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.invoice.amount, 80);
  assert.equal(r.body.invoice.status, "pending");
  assert.equal(r.body.invoice.mode, "link_only");
  assert.ok(r.body.invoice.paymentUrl.includes("paypal.me/miprep"));
  assert.ok(r.body.invoice.paymentUrl.includes("80.00"));
});

test("PayPal: opositor ve sus facturas pendientes", async () => {
  const cookie = await asLucia();
  const r = await request("GET", "/api/paypal/invoices/mine", { cookie });
  assert.equal(r.status, 200);
  assert.ok(r.body.invoices.length >= 1);
  const pending = r.body.invoices.find((i) => i.status === "pending");
  assert.ok(pending);
  assert.equal(pending.preparadorName, "Preparador Demo");
});

test("PayPal: preparador marca factura como cobrada", async () => {
  const cookie = await asPreparador();
  const list = await request("GET", "/api/paypal/invoices/issued", { cookie });
  const inv = list.body.invoices.find((i) => i.status === "pending");
  assert.ok(inv);
  const r = await request("POST", `/api/paypal/invoices/${inv.id}/mark-paid`, {
    cookie,
    body: { via: "paypal_me_confirmed" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.invoice.status, "paid");
  assert.equal(r.body.invoice.paidVia, "paypal_me_confirmed");
});

// ── Bulk parser (unit tests, sin servidor) ─────────────────────────────────

test("bulk parser: detecta texto numerado simple '1. Título'", () => {
  const r = parser.parse(`1. La Constitución española
2. Tit. Preliminar
3. Derechos fundamentales`);
  assert.equal(r.format, "text");
  assert.equal(r.topics.length, 3);
  assert.equal(r.topics[0].title, "La Constitución española");
  assert.equal(r.topics[0].number, "1");
});

test("bulk parser: detecta 'Tema X:' y bloques", () => {
  const r = parser.parse(`BLOQUE I — Derecho Constitucional
Tema 1: La Constitución
Tema 2.- Tit. Preliminar
BLOQUE II - Derecho Administrativo
Tema 3: La LPAC`);
  assert.equal(r.topics.length, 3);
  assert.equal(r.topics[0].block, "Derecho Constitucional");
  assert.equal(r.topics[2].block, "Derecho Administrativo");
  assert.equal(r.topics[2].title, "La LPAC");
});

test("bulk parser: CSV con cabecera y comillas", () => {
  const r = parser.parse(`number,title,block,difficulty,priority
1,"La Constitución, de 1978",I,Media,Alta
2,Tit. Preliminar,I,Baja,Alta`);
  assert.equal(r.format, "csv");
  assert.equal(r.topics.length, 2);
  assert.equal(r.topics[0].title, "La Constitución, de 1978");
  assert.equal(r.topics[0].priority, "Alta");
});

test("bulk parser: lista markdown con bullets", () => {
  const r = parser.parse(`## Bloque I
- Tema 1: Tit. Preliminar
- Tema 2: Derechos
* Tema 3: Garantías`);
  assert.equal(r.topics.length, 3);
  assert.equal(r.topics[0].block, "Bloque I");
});

// ── Endpoint bulk ──────────────────────────────────────────────────────────

test("bulk endpoint: dryRun preview no persiste", async () => {
  const cookie = await asPreparador();
  const before = await request("GET", "/api/preparador/syllabi", { cookie });
  const beforeCount = before.body.syllabi.find((s) => s.id === "s_1").topics.length;

  const r = await request("POST", "/api/preparador/syllabi/s_1/topics/bulk", {
    cookie,
    body: { text: "1. Tema A\n2. Tema B\n3. Tema C", dryRun: true },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.preview, true);
  assert.equal(r.body.wouldAdd, 3);

  const after = await request("GET", "/api/preparador/syllabi", { cookie });
  const afterCount = after.body.syllabi.find((s) => s.id === "s_1").topics.length;
  assert.equal(afterCount, beforeCount);
});

test("bulk endpoint: persiste con replace=true", async () => {
  const cookie = await asPreparador();
  const r = await request("POST", "/api/preparador/syllabi/s_1/topics/bulk", {
    cookie,
    body: {
      text: "1. Constitución\n2. Tit. Preliminar\n3. Derechos\n4. Garantías\n5. Tribunal Constitucional",
      replace: true,
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.added, 5);
  assert.equal(r.body.total, 5);
  assert.equal(r.body.replaced, true);
  const list = await request("GET", "/api/preparador/syllabi", { cookie });
  const updated = list.body.syllabi.find((s) => s.id === "s_1");
  assert.equal(updated.topics.length, 5);
  assert.equal(updated.topics[0].title, "Constitución");
});

test("bulk endpoint: 400 si texto vacío", async () => {
  const cookie = await asPreparador();
  const r = await request("POST", "/api/preparador/syllabi/s_1/topics/bulk", {
    cookie, body: { text: "" },
  });
  assert.equal(r.status, 400);
});

test("bulk endpoint: admin puede subir a syllabi de su academia", async () => {
  const cookie = await asAdmin();
  const r = await request("POST", "/api/preparador/syllabi/s_1/topics/bulk", {
    cookie,
    body: { text: "Apéndice A\nApéndice B", dryRun: true },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.preview, true);
});

// ── Planificación con títulos reales y examDate (HTTP) ─────────────────────

test("planning: el plan contiene topicTitle y topicNumber reales", async () => {
  const cookie = await asLucia();
  const r = await request("PATCH", "/api/opositor/commitment", {
    cookie,
    body: { weeklyHours: 20, dailyHours: 4,
      activeDays: ["Lunes","Martes","Miércoles","Jueves","Viernes"] },
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.plan);
  assert.ok(r.body.plan.tasks.length > 0);
  const taskWithTopic = r.body.plan.tasks.find((t) => t.topicId);
  if (taskWithTopic) {
    assert.ok(taskWithTopic.topicTitle);
    assert.ok(taskWithTopic.topicNumber);
    assert.ok(taskWithTopic.title.includes(taskWithTopic.topicTitle));
  }
});

test("planning: detecta weeksUntilExam con examDate +60d", async () => {
  const cookie = await asLucia();
  const examDate = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const r = await request("PATCH", "/api/opositor/commitment", {
    cookie,
    body: { examDate, weeklyHours: 20, dailyHours: 4,
      activeDays: ["Lunes","Martes","Miércoles","Jueves","Viernes"] },
  });
  assert.equal(r.status, 200);
  const plan = r.body.plan;
  assert.ok(plan.weeksUntilExam !== null && plan.weeksUntilExam !== undefined,
    `weeksUntilExam should be set, got: ${plan.weeksUntilExam}`);
  assert.ok(plan.weeksUntilExam >= 8 && plan.weeksUntilExam <= 10);
});

test("planning: feasibility 'tight' cuando dedicación insuficiente", async () => {
  const prepCookie = await asPreparador();
  const manyTopics = Array.from({length: 50}, (_, i) => `${i+1}. Tema ${i+1}`).join("\n");
  await request("POST", "/api/preparador/syllabi/s_1/topics/bulk", {
    cookie: prepCookie,
    body: { text: manyTopics, replace: true },
  });
  const cookie = await asLucia();
  const examDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const r = await request("PATCH", "/api/opositor/commitment", {
    cookie,
    body: { examDate, weeklyHours: 5, dailyHours: 1,
      activeDays: ["Lunes","Martes","Miércoles","Jueves","Viernes"] },
  });
  assert.equal(r.status, 200);
  const plan = r.body.plan;
  assert.equal(plan.feasibility, "tight",
    `feasibility=${plan.feasibility}, note=${plan.feasibilityNote}`);
  assert.ok(plan.feasibilityNote);
});
