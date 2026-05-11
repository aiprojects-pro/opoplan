const express = require("express");
const auth = require("../middleware/auth");
const db = require("../lib/db");
const crypto = require("crypto");
const realtime = require("../services/realtime");

// Comunidad gamificada extendida (catálogo §B.5).
//
// Lo que cubre este módulo:
//   - Rachas globales: días consecutivos con actividad de estudio.
//   - Salas Pomodoro compartidas: 3-6 opositores estudian "juntos" con un
//     temporizador común (50/10 min adaptado a oposiciones).
//   - Modo duelo: dos opositores se retan a una batería de 10 preguntas y
//     el que más acierta en menos tiempo gana puntos.
//   - Foros: hilos por oposición/tema para resolver dudas.
//   - Mentoring: alumni que ofrecen sesiones se exponen via /crm/mentors;
//     este módulo permite al opositor solicitar sesión.
//
// Honestidad:
//   - Las salas Pomodoro y duelos en tiempo real se entregan con polling
//     simple (sin WebSocket) para no introducir un canal nuevo. Es perfecto
//     para 2-6 personas, pero no escala a cientos. Cuando crezca, migrar a
//     WebSocket / Server-Sent Events.

module.exports = function communityRoutes() {
  const r = express.Router();
  r.use(auth.requireAuth);

  function isOpositor(req) { return req.user.role === "opositor"; }
  function orgOf(req) { return req.user.organizationId; }

  // ── RACHAS GLOBALES ──────────────────────────────────────────────────
  // Un día cuenta para la racha si el opositor tiene `habit` registrado o
  // ha completado alguna tarea del plan ese día.
  r.get("/community/streak", auth.requireRole("opositor"), (req, res) => {
    res.json(computeStreak(req.user.id));
  });

  // Tabla de clasificación: top 10 por racha, opt-in en perfil
  r.get("/community/leaderboard", auth.requireRole("opositor"), (req, res) => {
    const opositores = db.find("users",
      (u) => u.role === "opositor" && u.status === "active" && u.profile?.publicLeaderboard !== false);
    const rows = opositores.map((o) => {
      const s = computeStreak(o.id);
      return { name: o.name, currentStreak: s.currentStreak, bestStreak: s.bestStreak };
    });
    rows.sort((a, b) => b.currentStreak - a.currentStreak || b.bestStreak - a.bestStreak);
    res.json({ rows: rows.slice(0, 10) });
  });

  // ── SALAS POMODORO COMPARTIDAS ────────────────────────────────────────
  r.get("/community/study-rooms", auth.requireRole("opositor"), (_req, res) => {
    const rooms = db.find("studyRooms", (r) => r.active);
    res.json({ rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      currentPhase: r.currentPhase,
      phaseEndsAt: r.phaseEndsAt,
      members: (r.members || []).length,
      capacity: r.capacity,
    })) });
  });

  r.post("/community/study-rooms", auth.requireRole("opositor"), (req, res) => {
    const { name, mode = "50_10", capacity = 6 } = req.body || {};
    if (!name) return res.status(400).json({ error: "missing_name" });
    const phaseDuration = mode === "25_5" ? 25 * 60 : 50 * 60;
    const room = db.insert("studyRooms", {
      id: "sr_" + crypto.randomBytes(4).toString("hex"),
      name,
      mode, // 25_5 | 50_10
      capacity: Math.min(8, Math.max(2, Number(capacity))),
      members: [req.user.id],
      currentPhase: "study", // study | break
      phaseEndsAt: new Date(Date.now() + phaseDuration * 1000).toISOString(),
      cyclesCompleted: 0,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
      active: true,
    });
    res.json({ room });
  });

  r.post("/community/study-rooms/:id/join", auth.requireRole("opositor"), (req, res) => {
    const room = db.findOne("studyRooms", (r) => r.id === req.params.id && r.active);
    if (!room) return res.status(404).json({ error: "not_found" });
    if ((room.members || []).includes(req.user.id)) return res.json({ room });
    if ((room.members || []).length >= room.capacity) return res.status(409).json({ error: "room_full" });
    const updated = db.update("studyRooms", (r) => r.id === room.id, {
      members: [...(room.members || []), req.user.id],
    });
    realtime.emit(`room:${room.id}`, { event: "member_joined", userId: req.user.id, members: updated.members });
    res.json({ room: updated });
  });

  r.post("/community/study-rooms/:id/leave", auth.requireRole("opositor"), (req, res) => {
    const room = db.findOne("studyRooms", (r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: "not_found" });
    const members = (room.members || []).filter((id) => id !== req.user.id);
    const patch = { members };
    if (!members.length) patch.active = false; // sala vacía → cerrar
    const updated = db.update("studyRooms", (r) => r.id === room.id, patch);
    realtime.emit(`room:${room.id}`, { event: "member_left", userId: req.user.id, members });
    if (!members.length) realtime.emit(`room:${room.id}`, { event: "closed" });
    res.json({ room: updated });
  });

  // GET /study-rooms/:id/state — consulta del estado actual (cliente hace polling)
  r.get("/community/study-rooms/:id/state", auth.requireRole("opositor"), (req, res) => {
    const room = db.findOne("studyRooms", (r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: "not_found" });
    // Avanzar fases si tocaba
    advanceRoomPhases(room);
    const fresh = db.findOne("studyRooms", (r) => r.id === room.id);
    const memberInfo = (fresh.members || []).map((id) => {
      const u = db.findOne("users", (x) => x.id === id);
      return u ? { id: u.id, name: u.name } : null;
    }).filter(Boolean);
    res.json({
      id: fresh.id,
      name: fresh.name,
      mode: fresh.mode,
      currentPhase: fresh.currentPhase,
      phaseEndsAt: fresh.phaseEndsAt,
      cyclesCompleted: fresh.cyclesCompleted,
      members: memberInfo,
      active: fresh.active,
    });
  });

  // ── MODO DUELO ─────────────────────────────────────────────────────────
  // Dos opositores se enfrentan a 10 preguntas. El primero crea el duelo,
  // el segundo lo acepta. Ambos responden y el sistema compara aciertos +
  // tiempo total.
  r.post("/community/duels", auth.requireRole("opositor"), (req, res) => {
    const { challengeName, opponentEmail, processId, count = 10 } = req.body || {};
    const opponent = opponentEmail
      ? db.findOne("users", (u) => u.email === opponentEmail && u.role === "opositor" && u.organizationId === orgOf(req))
      : null;
    if (!opponent) return res.status(404).json({ error: "opponent_not_found" });
    if (opponent.id === req.user.id) return res.status(400).json({ error: "cannot_duel_self" });
    const pool = db.find("questionBank",
      (q) => q.organizationId === orgOf(req) && (!processId || q.processId === processId) && q.active !== false);
    if (pool.length < count) return res.status(409).json({ error: "not_enough_questions" });
    const selected = shuffle(pool).slice(0, Number(count));
    const duel = db.insert("duels", {
      id: "duel_" + crypto.randomBytes(4).toString("hex"),
      organizationId: orgOf(req),
      challengeName: challengeName || "Duelo de preguntas",
      challengerId: req.user.id,
      opponentId: opponent.id,
      questionIds: selected.map((q) => q.id),
      status: "pending", // pending | accepted | finished | declined
      createdAt: new Date().toISOString(),
      challengerResults: null,
      opponentResults: null,
    });
    res.json({ duel });
  });

  r.get("/community/duels/mine", auth.requireRole("opositor"), (req, res) => {
    const list = db.find("duels",
      (d) => d.challengerId === req.user.id || d.opponentId === req.user.id);
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const expanded = list.map((d) => {
      const challenger = db.findOne("users", (u) => u.id === d.challengerId);
      const opponent = db.findOne("users", (u) => u.id === d.opponentId);
      return {
        ...d,
        challengerName: challenger?.name || "?",
        opponentName: opponent?.name || "?",
      };
    });
    res.json({ duels: expanded });
  });

  // POST /duels/:id/accept — aceptar duelo
  r.post("/community/duels/:id/accept", auth.requireRole("opositor"), (req, res) => {
    const d = db.findOne("duels", (x) => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: "not_found" });
    if (d.opponentId !== req.user.id) return res.status(403).json({ error: "not_invited" });
    if (d.status !== "pending") return res.status(409).json({ error: "wrong_status" });
    db.update("duels", (x) => x.id === d.id, { status: "accepted", acceptedAt: new Date().toISOString() });
    realtime.emit(`duel:${d.id}`, { event: "accepted", by: req.user.id });
    // Devolvemos las preguntas (sin la respuesta correcta)
    const qs = (d.questionIds || []).map((qid) => {
      const q = db.findOne("questionBank", (x) => x.id === qid);
      return q ? { qbId: q.id, text: q.text, options: q.options } : null;
    }).filter(Boolean);
    res.json({ questions: qs });
  });

  // POST /duels/:id/submit — uno de los dos manda sus resultados
  r.post("/community/duels/:id/submit", auth.requireRole("opositor"), (req, res) => {
    const d = db.findOne("duels", (x) => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: "not_found" });
    if (d.challengerId !== req.user.id && d.opponentId !== req.user.id) return res.status(403).json({ error: "not_in_duel" });
    if (d.status === "finished") return res.status(409).json({ error: "already_finished" });
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    let correct = 0, totalTimeMs = 0;
    for (const a of answers) {
      const q = db.findOne("questionBank", (x) => x.id === a.qbId);
      if (!q) continue;
      if (Number(a.chosen) === q.correct) correct += 1;
      totalTimeMs += Math.max(0, Number(a.timeMs) || 0);
    }
    const result = { correct, total: answers.length, totalTimeMs, submittedAt: new Date().toISOString() };
    const patch = req.user.id === d.challengerId
      ? { challengerResults: result }
      : { opponentResults: result };
    // Si ambos han enviado, marcar como finalizado
    const next = { ...d, ...patch };
    if (next.challengerResults && next.opponentResults) {
      patch.status = "finished";
      patch.finishedAt = new Date().toISOString();
      // winner = más aciertos; en empate, menos tiempo
      const cR = next.challengerResults, oR = next.opponentResults;
      if (cR.correct > oR.correct) patch.winnerId = d.challengerId;
      else if (oR.correct > cR.correct) patch.winnerId = d.opponentId;
      else patch.winnerId = cR.totalTimeMs <= oR.totalTimeMs ? d.challengerId : d.opponentId;
    }
    const updated = db.update("duels", (x) => x.id === d.id, patch);
    if (patch.status === "finished") {
      realtime.emit(`duel:${d.id}`, {
        event: "finished",
        winnerId: patch.winnerId,
        challengerResults: updated.challengerResults,
        opponentResults: updated.opponentResults,
      });
    } else {
      realtime.emit(`duel:${d.id}`, { event: "answer_submitted", by: req.user.id });
    }
    res.json({ duel: updated });
  });

  // ── FOROS ──────────────────────────────────────────────────────────────
  r.get("/community/forum/threads", (req, res) => {
    const { topicTag } = req.query;
    let threads = db.find("forumThreads", (t) => t.organizationId === orgOf(req));
    if (topicTag) threads = threads.filter((t) => t.topicTag === topicTag);
    threads.sort((a, b) => (b.lastReplyAt || b.createdAt || "").localeCompare(a.lastReplyAt || a.createdAt || ""));
    res.json({ threads });
  });

  r.post("/community/forum/threads", (req, res) => {
    const { title, body, topicTag } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: "missing_fields" });
    const u = db.findOne("users", (x) => x.id === req.user.id);
    const thread = db.insert("forumThreads", {
      id: "ft_" + crypto.randomBytes(4).toString("hex"),
      organizationId: orgOf(req),
      title,
      body,
      topicTag: topicTag || "",
      authorId: req.user.id,
      authorName: u?.name || "",
      replies: [],
      createdAt: new Date().toISOString(),
      lastReplyAt: null,
    });
    res.json({ thread });
  });

  r.post("/community/forum/threads/:id/reply", (req, res) => {
    const t = db.findOne("forumThreads", (x) => x.id === req.params.id && x.organizationId === orgOf(req));
    if (!t) return res.status(404).json({ error: "not_found" });
    const body = (req.body?.body || "").trim();
    if (!body) return res.status(400).json({ error: "empty" });
    const u = db.findOne("users", (x) => x.id === req.user.id);
    const reply = {
      id: "fr_" + crypto.randomBytes(4).toString("hex"),
      authorId: req.user.id,
      authorName: u?.name || "",
      authorRole: req.user.role,
      body,
      at: new Date().toISOString(),
    };
    res.json({ thread: db.update("forumThreads", (x) => x.id === t.id, {
      replies: [...(t.replies || []), reply],
      lastReplyAt: reply.at,
    }) });
  });

  // ── MENTORING ──────────────────────────────────────────────────────────
  // Solicitar sesión a un alumnus que ofrece mentoring
  r.post("/community/mentoring/request", auth.requireRole("opositor"), (req, res) => {
    const { mentorAlumnusId, message } = req.body || {};
    const m = db.findOne("alumni",
      (a) => a.id === mentorAlumnusId && a.organizationId === orgOf(req) && a.offersMentoring);
    if (!m) return res.status(404).json({ error: "mentor_not_available" });
    const u = db.findOne("users", (x) => x.id === req.user.id);
    const reqMnt = db.insert("mentoringRequests", {
      id: "mnr_" + crypto.randomBytes(4).toString("hex"),
      organizationId: orgOf(req),
      mentorAlumnusId,
      mentorName: m.name,
      menteeId: req.user.id,
      menteeName: u?.name || "",
      message: message || "",
      status: "pending", // pending | accepted | declined | done
      createdAt: new Date().toISOString(),
    });
    res.json({ request: reqMnt });
  });

  return r;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function computeStreak(opositorId) {
  // Recopilamos los días con actividad en habits o tareas completadas
  const habits = db.find("habits", (h) => h.opositorId === opositorId)
    .map((h) => h.date).filter(Boolean);
  const plan = db.findOne("plans", (p) => p.opositorId === opositorId);
  const planDays = plan?.tasks
    ? plan.tasks.filter((t) => t.status === "done" && t.completedAt)
        .map((t) => (t.completedAt || "").slice(0, 10))
    : [];
  const days = [...new Set([...habits, ...planDays])].sort();
  if (!days.length) return { currentStreak: 0, bestStreak: 0, daysActive: 0 };
  // Calcular racha actual (hasta hoy)
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let current = 0;
  if (days.includes(today) || days.includes(yesterday)) {
    let cursor = days.includes(today) ? today : yesterday;
    while (days.includes(cursor)) {
      current += 1;
      const d = new Date(cursor + "T00:00:00");
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    }
  }
  // Mejor racha histórica
  let best = 0, run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + "T00:00:00");
    const cur = new Date(days[i] + "T00:00:00");
    const diff = Math.round((cur - prev) / 86400000);
    if (diff === 1) run += 1;
    else { best = Math.max(best, run); run = 1; }
  }
  best = Math.max(best, run, current);
  return { currentStreak: current, bestStreak: best, daysActive: days.length };
}

function advanceRoomPhases(room) {
  if (!room.active) return;
  const now = Date.now();
  const ends = new Date(room.phaseEndsAt).getTime();
  if (now < ends) return;
  // Toca cambiar de fase
  const isStudyMode50 = room.mode === "50_10";
  const studyMin = isStudyMode50 ? 50 : 25;
  const breakMin = isStudyMode50 ? 10 : 5;
  let nextPhase, durationMin, cycles = room.cyclesCompleted || 0;
  if (room.currentPhase === "study") {
    nextPhase = "break";
    durationMin = breakMin;
  } else {
    nextPhase = "study";
    durationMin = studyMin;
    cycles += 1;
  }
  const phaseEndsAt = new Date(now + durationMin * 60 * 1000).toISOString();
  db.update("studyRooms", (r) => r.id === room.id, {
    currentPhase: nextPhase,
    phaseEndsAt,
    cyclesCompleted: cycles,
  });
  realtime.emit(`room:${room.id}`, {
    event: "phase_changed",
    currentPhase: nextPhase,
    phaseEndsAt,
    cyclesCompleted: cycles,
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
