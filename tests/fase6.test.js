const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, request, asAdmin, asLucia } = require("./helpers");

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

test("dashboard analítico: heatmap calcula tasas reales por tema", async () => {
  const cookie = await asAdmin();
  const r = await request("GET", "/api/analytics/heatmap", { cookie });
  assert.equal(r.status, 200);
  assert.ok(r.body.heatmap);
  const topics = r.body.heatmap.topics;
  // Hay 2 temas con datos del seed
  const withData = topics.filter((t) => t.attempts > 0);
  assert.ok(withData.length >= 1, "al menos un tema con intentos");
});

test("most-failed devuelve preguntas con distractor dominante", async () => {
  const cookie = await asAdmin();
  const r = await request("GET", "/api/analytics/most-failed?limit=10", { cookie });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.questions));
  // Las respuestas del seed son todas en chosen != correct, por lo que hay errores
  const withDistractor = r.body.questions.filter((q) => q.dominantDistractor);
  assert.ok(withDistractor.length >= 1);
});

test("predictor con N=1 devuelve lowConfidence=true y prob capada al 85%", async () => {
  const cookie = await asLucia();
  const r = await request("GET", "/api/predictor/forecast", { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.forecast.ready, true);
  assert.equal(r.body.forecast.lowConfidence, true);
  assert.ok(r.body.forecast.todayPassProbability <= 85);
});

test("simulacro: begin → answer → finish con análisis cognitivo", async () => {
  const cookie = await asLucia();
  const begin = await request("POST", "/api/simulacros/begin", {
    cookie,
    body: { processId: "proc_1", count: 3 },
  });
  assert.equal(begin.status, 200);
  const attemptId = begin.body.attemptId;
  // Responder cada pregunta con métricas
  for (const q of begin.body.questions) {
    const r = await request("POST", `/api/simulacros/${attemptId}/answer`, {
      cookie,
      body: { qbId: q.qbId, chosen: 0, timeMs: 30000, changes: 1, confidence: "doubt" },
    });
    assert.equal(r.status, 200);
  }
  // Finalizar
  const finish = await request("POST", `/api/simulacros/${attemptId}/finish`, { cookie });
  assert.equal(finish.status, 200);
  assert.ok(finish.body.attempt.score !== null);
  assert.ok(finish.body.analysis.calibrationPct !== undefined);
});

test("monitor normativo: 2 alertas de muestra del seed", async () => {
  const cookie = await asAdmin();
  const r = await request("GET", "/api/normative/alerts", { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.alerts.length, 2);
  const urgent = r.body.alerts.find((a) => a.level === "important");
  assert.ok(urgent);
});

test("marketplace: comprar pack copia preguntas + Stripe Connect mock auto-settle", async () => {
  const cookie = await asAdmin();
  // Antes de onboardear, la compra queda pending_transfer (no hay cuenta destino)
  const r0 = await request("POST", "/api/marketplace/buy/mkt_2", {
    cookie,
    body: { licenseType: "license" },
  });
  assert.equal(r0.status, 200);
  // mkt_2 no tiene questionIds en seed → 0 copiadas
  assert.equal(r0.body.copiedQuestions, 0);
  // Sin onboarding del vendedor: pending_transfer
  assert.equal(r0.body.purchase.paymentStatus, "pending_transfer");
  // Comisión 18% sobre 199€ = 35.82€
  assert.equal(r0.body.purchase.platformFee, 35.82);

  // mkt_1 tiene questionIds [qb_1, qb_2, qb_3]
  const r1 = await request("POST", "/api/marketplace/buy/mkt_1", {
    cookie,
    body: { licenseType: "license" },
  });
  assert.equal(r1.body.copiedQuestions, 3);
});

test("wellbeing: opositor responde stress check y recibe label", async () => {
  const cookie = await asLucia();
  const r = await request("POST", "/api/wellbeing/stress-check", {
    cookie,
    body: { answers: { overwhelm: 5, sleep: 1, focus: 5, doubt: 5, joy: 1 } },
  });
  assert.equal(r.status, 200);
  // Score: 5 + (6-1) + 5 + 5 + (6-1) = 25 → burnout
  assert.equal(r.body.check.score, 25);
  assert.equal(r.body.label.id, "burnout");
});

test("multichannel: daily question es estable por día (mismo seed)", async () => {
  const cookie = await asLucia();
  const r1 = await request("GET", "/api/multichannel/daily-question", { cookie });
  const r2 = await request("GET", "/api/multichannel/daily-question", { cookie });
  assert.equal(r1.body.question.qbId, r2.body.question.qbId);
});
