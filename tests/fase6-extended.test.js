const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, request, asAdmin, asLucia, asAlvaro, testUser } = require("./helpers");

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

test("certificaciones: 4 niveles default + Lucía con 1 simulacro válido", async () => {
  const cookieAdmin = await asAdmin();
  const lvls = await request("GET", "/api/certifications/levels", { cookie: cookieAdmin });
  assert.equal(lvls.body.levels.length, 4);

  const cookieLucia = await asLucia();
  const mine = await request("GET", "/api/certifications/mine", { cookie: cookieLucia });
  assert.equal(mine.status, 200);
  // Lucía tiene 1 simulacro con score 7.3 que cumple L1, L2, L3
  const l1 = mine.body.eligibility.find((e) => e.id === "L1");
  assert.equal(l1.progress.current, 1);
  assert.equal(l1.progress.target, 3);
  assert.equal(l1.eligibleNow, false);
});

test("CRM: lead → contacted con histórico de eventos", async () => {
  const cookie = await asAdmin();
  const create = await request("POST", "/api/crm/leads", {
    cookie,
    body: { name: "Pedro García", email: "pedro@test.es", oposicion: "Auxiliar", stage: "lead" },
  });
  assert.equal(create.status, 200);
  const id = create.body.lead.id;
  // Cambiar etapa
  const upd = await request("PATCH", `/api/crm/leads/${id}`, {
    cookie,
    body: { stage: "contacted" },
  });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.lead.stage, "contacted");
  // El histórico tiene 'created' + 'stage_change'
  const events = upd.body.lead.events;
  assert.ok(events.find((e) => e.type === "stage_change"));
});

test("auditoría: ciclo de vida con eventos", async () => {
  const cookie = await asAdmin();
  const create = await request("POST", "/api/audits", {
    cookie,
    body: { title: "Auditoría test", type: "complete", syllabusId: "syl_1" },
  });
  assert.equal(create.status, 200);
  assert.equal(create.body.audit.status, "requested");
  // Comentario del admin
  const comment = await request("POST", `/api/audits/${create.body.audit.id}/comment`, {
    cookie,
    body: { message: "Adjunto los apuntes en breve." },
  });
  assert.equal(comment.status, 200);
  assert.equal(comment.body.audit.events.length, 2);
});

test("seguros: condiciones de elegibilidad calculan correctamente", async () => {
  const cookieAdmin = await asAdmin();
  const policy = await request("POST", "/api/insurance/policies", {
    cookie: cookieAdmin,
    body: {
      name: "Test policy", premiumPct: 20,
      benefit: { type: "extension", extensionMonths: 6 },
      minProgramCompletionPct: 80,
      minSimulacrosCompliancePct: 80,
      mustAttendConvocations: 1,
    },
  });
  assert.equal(policy.status, 200);
  const cookieLucia = await asLucia();
  const enroll = await request("POST", "/api/insurance/enroll", {
    cookie: cookieLucia,
    body: { policyId: policy.body.policy.id },
  });
  assert.equal(enroll.status, 200);
  assert.equal(enroll.body.enrollment.premiumStatus, "pending");
  // Comprobar elegibilidad
  const mine = await request("GET", "/api/insurance/mine", { cookie: cookieLucia });
  assert.equal(mine.status, 200);
  const e = mine.body.enrollments[0];
  // Lucía no cumple condiciones (no tiene 80% de programa, no ha presentado convocatoria)
  assert.equal(e.compliance.eligible, false);
  assert.equal(e.compliance.attendedOk, false);
});

test("alianzas: crear y listar con miembros expandidos", async () => {
  const cookie = await asAdmin();
  const r = await request("POST", "/api/alliances", {
    cookie,
    body: { name: "Alianza test", description: "Descripción" },
  });
  assert.equal(r.status, 200);
  const list = await request("GET", "/api/alliances/mine", { cookie });
  assert.ok(list.body.alliances.find((a) => a.id === r.body.alliance.id));
  const a = list.body.alliances.find((a) => a.id === r.body.alliance.id);
  assert.equal(a.members.length, 1);
  assert.equal(a.members[0].name, "Academia Demo");
});

test("comunidad: racha de Lucía calculada de habits + plan", async () => {
  const cookie = await asLucia();
  const r = await request("GET", "/api/community/streak", { cookie });
  assert.equal(r.status, 200);
  assert.ok(r.body.bestStreak >= 1);
});

test("comunidad: sala Pomodoro con polling avanza fases", async () => {
  const cookie = await asLucia();
  const create = await request("POST", "/api/community/study-rooms", {
    cookie,
    body: { name: "Test room", mode: "25_5" },
  });
  assert.equal(create.status, 200);
  const id = create.body.room.id;
  const state = await request("GET", `/api/community/study-rooms/${id}/state`, { cookie });
  assert.equal(state.body.currentPhase, "study");
  assert.equal(state.body.members.length, 1);
});

test("comunidad: duelo entre Lucía y Álvaro", async () => {
  const cookieLucia = await asLucia();
  const create = await request("POST", "/api/community/duels", {
    cookie: cookieLucia,
    body: { opponentEmail: testUser("alvaro").email, processId: "proc_1", count: 3 },
  });
  assert.equal(create.status, 200);
  const id = create.body.duel.id;
  // Álvaro acepta
  const cookieAlvaro = await asAlvaro();
  const accept = await request("POST", `/api/community/duels/${id}/accept`, { cookie: cookieAlvaro });
  assert.equal(accept.status, 200);
  assert.equal(accept.body.questions.length, 3);
});

test("recordatorio examProximity: frecuencia adaptativa según días al examen", async () => {
  // Verificación indirecta: el endpoint de update commitment no falla y la
  // configuración queda guardada para que el scheduler la consuma.
  const cookie = await asLucia();
  const r = await request("PATCH", "/api/opositor/commitment", {
    cookie,
    body: { examName: "Auxiliar AGE", examDate: "2026-06-15", weeklyHours: 30 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.commitment.examDate, "2026-06-15");
});

test("informe automático: configurar schedule en assignment", async () => {
  const cookie = await asAdmin();
  const r = await request("PATCH", "/api/preparador/assignments/a_1/report-schedule", {
    cookie,
    body: { enabled: true, frequency: "weekly" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.assignment.reportSchedule.enabled, true);
  assert.equal(r.body.assignment.reportSchedule.frequency, "weekly");
});
