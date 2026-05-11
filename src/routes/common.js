const express = require("express");
const db = require("../lib/db");
const auth = require("../middleware/auth");
const notifications = require("../services/notifications");
const videoconferenceService = require("../services/videoconference");
const { expandEvents, expandAvailability, fmtDate, parseDate, addDays } = require("../lib/recurrence");
const { BOOKING_CANCEL_HOURS } = require("../lib/constants");

// ─────────────────────────────────────────────────────────────────────────────
// Rutas compartidas por todos los roles autenticados (admin, preparador,
// opositor). Todas filtran por organización del usuario.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function commonRoutes({ appUrl, videoconference: globalVc } = {}) {
  const r = express.Router();
  r.use(auth.requireAuth);

  // Helper: orgId del usuario actual
  const orgOf = (req) => req.user.organizationId;

  // Helper: ¿este evento es visible para el usuario actual?
  function eventVisibleTo(e, user) {
    if (user.role === "admin" || user.role === "superadmin") return true;
    if (e.recipients?.includes("all")) return true;
    if (e.recipients?.includes(user.id)) return true;
    if (e.ownerId === user.id) return true;
    if (user.role === "preparador" && e.preparadorId === user.id) return true;
    if (user.role === "opositor" && e.opositorId === user.id) return true;
    return false;
  }

  // ── Eventos / agenda ──────────────────────────────────────────────────────

  // GET /events?from=2026-05-01&to=2026-05-31
  // Devuelve ocurrencias expandidas dentro del rango. Si no se da rango,
  // expande [hoy, hoy+60].
  r.get("/events", (req, res) => {
    const orgId = orgOf(req);
    const today = new Date();
    const from = req.query.from || fmtDate(today);
    const to = req.query.to || fmtDate(addDays(today, 60));

    const events = db.find("events", (e) => e.organizationId === orgId);
    const visible = events.filter((e) => eventVisibleTo(e, req.user));
    const occurrences = expandEvents(visible, from, to);

    res.json({ events: occurrences, range: { from, to } });
  });

  r.post("/events", (req, res) => {
    const orgId = orgOf(req);
    const {
      title, type, date, time, durationMin,
      recipients, recurrence, recurrenceUntil,
      opositorId, preparadorId, description,
    } = req.body || {};
    const recipientIds = Array.isArray(recipients) ? recipients : recipients ? [recipients] : [req.user.id];
    const e = db.insert("events", {
      id: db.id("e"),
      organizationId: orgId,
      ownerType: req.user.role,
      ownerId: req.user.id,
      preparadorId: preparadorId || (req.user.role === "preparador" ? req.user.id : null),
      opositorId: opositorId || (req.user.role === "opositor" ? req.user.id : null),
      title: title || "(sin título)",
      type: type || "evento",
      date: date || "",
      time: time || "",
      durationMin: Number(durationMin) || 60,
      recipients: recipientIds,
      recurrence: recurrence || "none",
      recurrenceUntil: recurrenceUntil || "",
      recurrenceExceptions: [],
      description: description || "",
      createdAt: new Date().toISOString(),
    });

    // Notificar destinatarios (excepto el creador). Para recurrentes solo se
    // notifica al crear; los recordatorios automáticos los manda el scheduler.
    const toNotify = recipientIds.filter((id) => id !== req.user.id && id !== "all");
    if (toNotify.length) {
      notifications.notifyUsers({
        orgId, userIds: toNotify, template: "eventReminder",
        data: { eventTitle: e.title, eventDate: e.date, eventTime: e.time, eventType: e.type },
        appUrl,
      }).catch((er) => console.error("[notify:event]", er));
    }
    res.json({ event: e });
  });

  // PATCH /events/:id?scope=this&date=YYYY-MM-DD
  //   scope=this  → crea un override para esa ocurrencia y deja el maestro intacto
  //   scope=all   → modifica el maestro (afecta a todas las ocurrencias futuras)
  r.patch("/events/:id", (req, res) => {
    const orgId = orgOf(req);
    const master = db.findOne("events", (e) => e.id === req.params.id && e.organizationId === orgId);
    if (!master) return res.status(404).json({ error: "not_found" });
    if (req.user.role !== "admin" && req.user.role !== "superadmin" && master.ownerId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }

    const scope = req.query.scope || "all";
    if (scope === "this" && master.recurrence !== "none") {
      // Override: añade fecha a las excepciones y crea instancia nueva
      const occDate = req.query.date || master.date;
      const exceptions = master.recurrenceExceptions || [];
      if (!exceptions.includes(occDate)) {
        db.update("events", (e) => e.id === master.id, {
          recurrenceExceptions: [...exceptions, occDate],
        });
      }
      const override = db.insert("events", {
        ...master,
        id: db.id("e"),
        recurrence: "none",
        recurrenceUntil: "",
        recurrenceExceptions: [],
        recurrenceParentId: master.id,
        originalOccurrenceDate: occDate,
        date: req.body.date || occDate,
        time: req.body.time !== undefined ? req.body.time : master.time,
        title: req.body.title !== undefined ? req.body.title : master.title,
        description: req.body.description !== undefined ? req.body.description : master.description,
        durationMin: req.body.durationMin !== undefined ? req.body.durationMin : master.durationMin,
      });
      return res.json({ event: override, mode: "override" });
    }

    // scope=all
    const updated = db.update("events", (e) => e.id === master.id, req.body || {});
    res.json({ event: updated, mode: "master" });
  });

  // DELETE /events/:id?scope=this&date=YYYY-MM-DD
  r.delete("/events/:id", (req, res) => {
    const orgId = orgOf(req);
    const master = db.findOne("events", (e) => e.id === req.params.id && e.organizationId === orgId);
    if (!master) return res.status(404).json({ error: "not_found" });
    if (req.user.role !== "admin" && req.user.role !== "superadmin" && master.ownerId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }

    const scope = req.query.scope || "all";
    if (scope === "this" && master.recurrence !== "none") {
      const occDate = req.query.date || master.date;
      const exceptions = master.recurrenceExceptions || [];
      if (!exceptions.includes(occDate)) {
        db.update("events", (e) => e.id === master.id, {
          recurrenceExceptions: [...exceptions, occDate],
        });
      }
      return res.json({ ok: true, mode: "exception" });
    }
    db.remove("events", (e) => e.id === master.id || e.recurrenceParentId === master.id);
    res.json({ ok: true, mode: "master" });
  });

  // ── Disponibilidad publicable (preparador) ───────────────────────────────

  r.get("/availability", (req, res) => {
    const orgId = orgOf(req);
    let list = db.find("availability", (a) => a.organizationId === orgId && a.active !== false);

    if (req.user.role === "preparador") {
      list = list.filter((a) => a.preparadorId === req.user.id);
    } else if (req.user.role === "opositor") {
      // El opositor ve la disponibilidad de su preparador asignado
      const assignment = db.findOne("assignments",
        (x) => x.opositorId === req.user.id && x.active);
      if (!assignment) return res.json({ availability: [], occurrences: [] });
      list = list.filter((a) => a.preparadorId === assignment.preparadorId);
    }

    // Expandimos en ocurrencias futuras (hasta +60 días)
    const today = new Date();
    const from = req.query.from || fmtDate(today);
    const to = req.query.to || fmtDate(addDays(today, 60));

    let occurrences = [];
    for (const slot of list) {
      occurrences = occurrences.concat(expandAvailability(slot, from, to));
    }

    // Marcamos las ocurrencias ya reservadas (status=confirmed o pending) para
    // que el opositor no pueda reservar dos veces el mismo hueco.
    const bookings = db.find("bookings",
      (b) => b.organizationId === orgId && (b.status === "pending" || b.status === "confirmed"));

    occurrences = occurrences.map((o) => {
      const booked = bookings.find((b) =>
        b.availabilityId === o.id && b.date === o.date && b.time === o.time);
      return { ...o, booked: !!booked, bookingId: booked?.id || null, bookedBy: booked?.opositorId || null };
    }).filter((o) => parseDate(o.date) >= parseDate(from));

    res.json({ availability: list, occurrences });
  });

  r.post("/availability", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = orgOf(req);
    const { dayOfWeek, dayOfWeeks, time, durationMin, recurrence, until, slotsPerWindow } = req.body || {};
    // Permite enviar un array `dayOfWeeks` (varios días con mismo horario, transcripción ~20:13)
    const days = Array.isArray(dayOfWeeks) && dayOfWeeks.length
      ? dayOfWeeks.map((d) => Number(d))
      : (dayOfWeek !== undefined ? [Number(dayOfWeek)] : []);
    if (!days.length || !time) return res.status(400).json({ error: "missing_fields" });
    const created = days.map((d) => db.insert("availability", {
      id: db.id("av"),
      organizationId: orgId,
      preparadorId: req.user.role === "preparador" ? req.user.id : (req.body.preparadorId || null),
      dayOfWeek: d,
      time,
      durationMin: Number(durationMin) || 60,
      slotsPerWindow: Number(slotsPerWindow) || 1,
      recurrence: recurrence || "weekly",
      until: until || "",
      active: true,
      createdAt: new Date().toISOString(),
    }));
    res.json({ availability: created.length === 1 ? created[0] : null, slots: created });
  });

  r.delete("/availability/:id", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = orgOf(req);
    const slot = db.findOne("availability", (a) => a.id === req.params.id && a.organizationId === orgId);
    if (!slot) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "preparador" && slot.preparadorId !== req.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    db.update("availability", (a) => a.id === slot.id, { active: false });
    res.json({ ok: true });
  });

  // ── Reservas de tutoría ──────────────────────────────────────────────────

  r.get("/bookings", (req, res) => {
    const orgId = orgOf(req);
    let list = db.find("bookings", (b) => b.organizationId === orgId);
    if (req.user.role === "preparador") list = list.filter((b) => b.preparadorId === req.user.id);
    if (req.user.role === "opositor") list = list.filter((b) => b.opositorId === req.user.id);
    res.json({ bookings: list });
  });

  // El opositor reserva un hueco concreto (availabilityId + date)
  r.post("/bookings", auth.requireRole("opositor", "admin", "superadmin"), async (req, res) => {
    const orgId = orgOf(req);
    const { availabilityId, date, time, notes } = req.body || {};
    if (!availabilityId || !date) return res.status(400).json({ error: "missing_fields" });

    const slot = db.findOne("availability",
      (a) => a.id === availabilityId && a.organizationId === orgId && a.active !== false);
    if (!slot) return res.status(404).json({ error: "slot_not_found" });

    // Comprobar que no existe ya una reserva activa para el mismo hueco
    const conflict = db.findOne("bookings", (b) =>
      b.organizationId === orgId && b.availabilityId === slot.id && b.date === date && b.time === (time || slot.time)
      && (b.status === "pending" || b.status === "confirmed"));
    if (conflict) return res.status(409).json({ error: "already_booked" });

    const opositorId = req.user.role === "opositor" ? req.user.id : req.body.opositorId;
    const opositor = db.findOne("users", (u) => u.id === opositorId);
    const preparador = db.findOne("users", (u) => u.id === slot.preparadorId);
    const org = db.findOne("organizations", (o) => o.id === orgId);

    const bookingTime = time || slot.time;
    const durationMin = slot.durationMin || 60;

    // ── Generar enlace de videoconferencia (~20:11) ──────────────────────────
    // Si la academia tiene videoconferencia configurada usamos la suya, si no
    // la global de la plataforma (o mock). Si todo falla, seguimos sin URL —
    // la reserva se crea igualmente y el preparador puede compartir manualmente.
    let videoMeeting = null;
    try {
      const vc = videoconferenceService.fromOrg(org, globalVc);
      if (vc) {
        const startAt = new Date(`${date}T${bookingTime}:00`).toISOString();
        videoMeeting = await vc.createMeeting({
          title: opositor ? `Tutoría con ${opositor.name}` : "Tutoría",
          startAt,
          durationMin,
          hostEmail: preparador?.email,
          attendees: [opositor?.email, preparador?.email].filter(Boolean),
        });
      }
    } catch (e) {
      console.error("[videoconference:create]", e.message);
      // No bloqueamos la reserva si falla la creación del enlace. Log y seguimos.
    }

    const booking = db.insert("bookings", {
      id: db.id("bk"),
      organizationId: orgId,
      availabilityId: slot.id,
      preparadorId: slot.preparadorId,
      opositorId,
      date,
      time: bookingTime,
      durationMin,
      status: "confirmed", // auto-confirmed; en próximas iteraciones puede ir a "pending"
      notes: notes || "",
      eventId: null,
      videoProvider: videoMeeting?.provider || null,
      videoJoinUrl: videoMeeting?.joinUrl || null,
      videoHostUrl: videoMeeting?.hostUrl || null,
      videoMeetingId: videoMeeting?.meetingId || null,
      videoPasscode: videoMeeting?.passcode || null,
      createdAt: new Date().toISOString(),
    });

    // Generamos un evento en la agenda para ambos
    const ev = db.insert("events", {
      id: db.id("e"),
      organizationId: orgId,
      ownerType: "preparador",
      ownerId: slot.preparadorId,
      preparadorId: slot.preparadorId,
      opositorId,
      title: opositor ? `Tutoría con ${opositor.name}` : "Tutoría",
      type: "tutoria",
      date,
      time: booking.time,
      durationMin: booking.durationMin,
      recipients: [slot.preparadorId, opositorId],
      recurrence: "none",
      recurrenceUntil: "",
      recurrenceExceptions: [],
      description: [
        notes ? `Notas del opositor: ${notes}` : "",
        videoMeeting?.joinUrl ? `Enlace de videoconferencia: ${videoMeeting.joinUrl}` : "",
      ].filter(Boolean).join("\n"),
      bookingId: booking.id,
      videoJoinUrl: videoMeeting?.joinUrl || null,
      createdAt: new Date().toISOString(),
    });
    db.update("bookings", (b) => b.id === booking.id, { eventId: ev.id });

    // Email al preparador (~20:35) y al opositor: bookingCreated
    if (opositor && preparador) {
      notifications.notifyUsers({
        orgId,
        userIds: [opositor.id, preparador.id],
        template: "bookingCreated",
        data: {
          bookingDate: ev.date,
          bookingTime: ev.time,
          opositorName: opositor.name,
          preparadorName: preparador.name,
          notes: notes || "",
          videoJoinUrl: videoMeeting?.joinUrl || "",
          videoProvider: videoMeeting?.provider || "",
          videoPasscode: videoMeeting?.passcode || "",
        },
        appUrl,
      }).catch((er) => console.error("[notify:booking]", er));
    }

    res.json({ booking, event: ev, video: videoMeeting });
  });

  r.patch("/bookings/:id/cancel", (req, res) => {
    const orgId = orgOf(req);
    const booking = db.findOne("bookings", (b) => b.id === req.params.id && b.organizationId === orgId);
    if (!booking) return res.status(404).json({ error: "not_found" });
    if (req.user.role === "opositor" && booking.opositorId !== req.user.id) return res.status(403).json({ error: "forbidden" });
    if (req.user.role === "preparador" && booking.preparadorId !== req.user.id) return res.status(403).json({ error: "forbidden" });

    // Regla 48h (transcripción ~20:35): el opositor no puede cancelar con menos
    // de 48h de antelación. Admin y preparador pueden saltarse la regla.
    if (req.user.role === "opositor") {
      const target = new Date(`${booking.date}T${(booking.time || "00:00")}:00`);
      const diffH = (target - new Date()) / 36e5;
      if (diffH < BOOKING_CANCEL_HOURS) {
        return res.status(409).json({
          error: "cancel_window_closed",
          hoursRequired: BOOKING_CANCEL_HOURS,
          hoursLeft: Math.max(0, Math.round(diffH * 10) / 10),
        });
      }
    }

    db.update("bookings", (b) => b.id === booking.id, {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledBy: req.user.id,
    });
    if (booking.eventId) db.remove("events", (e) => e.id === booking.eventId);

    // Avisar a la contraparte
    const counterpartId = req.user.id === booking.opositorId ? booking.preparadorId : booking.opositorId;
    const me = db.findOne("users", (u) => u.id === req.user.id);
    if (counterpartId && me) {
      notifications.notifyUsers({
        orgId,
        userIds: [counterpartId],
        template: "bookingCancelled",
        data: {
          bookingDate: booking.date,
          bookingTime: booking.time,
          cancelledBy: me.name,
        },
        appUrl,
      }).catch((er) => console.error("[notify:cancel]", er));
    }
    res.json({ ok: true });
  });

  // ── Interacciones (historial preparador ↔ opositor) ───────────────────────

  r.get("/interactions", (req, res) => {
    const orgId = orgOf(req);
    let list = db.find("interactions", (i) => i.organizationId === orgId);
    if (req.user.role === "opositor") list = list.filter((i) => i.opositorId === req.user.id);
    if (req.user.role === "preparador") list = list.filter((i) => i.preparadorId === req.user.id);
    res.json({ interactions: list });
  });

  r.post("/interactions", auth.requireRole("preparador", "admin", "superadmin"), (req, res) => {
    const orgId = orgOf(req) || req.body.organizationId;
    const { opositorId, type, subject, notes, date, durationMin } = req.body || {};
    const i = db.insert("interactions", {
      id: db.id("c"),
      organizationId: orgId,
      preparadorId: req.user.role === "preparador" ? req.user.id : req.body.preparadorId,
      opositorId,
      type: type || "mensaje",
      subject: subject || "",
      notes: notes || "",
      date: date || new Date().toISOString().slice(0, 10),
      durationMin: Number(durationMin) || 0,
    });
    res.json({ interaction: i });
  });

  // ── Avisos generales ──────────────────────────────────────────────────────

  r.get("/announcements", (req, res) => {
    const orgId = orgOf(req);
    let list = db.find("announcements", (a) => a.organizationId === orgId);
    // Filtrado por audiencia
    list = list.filter((a) => {
      if (a.audience === "todos") return true;
      if (a.audience === "preparadores") return req.user.role === "preparador";
      if (a.audience === "opositores") return req.user.role === "opositor";
      if (Array.isArray(a.audience)) return a.audience.includes(req.user.id);
      return true;
    });
    res.json({ announcements: list });
  });

  r.post("/announcements", auth.requireRole("admin", "superadmin"), (req, res) => {
    const orgId = orgOf(req) || req.body.organizationId;
    const { title, body, audience } = req.body || {};
    const a = db.insert("announcements", {
      id: db.id("an"),
      organizationId: orgId,
      title,
      body,
      audience: audience || "todos",
      date: new Date().toISOString().slice(0, 10),
      authorId: req.user.id,
    });
    // Resolver destinatarios y enviar email
    const all = db.find("users", (u) => u.organizationId === orgId && u.status === "active" && u.email);
    let recipients = [];
    if (a.audience === "todos") recipients = all;
    else if (a.audience === "preparadores") recipients = all.filter((u) => u.role === "preparador");
    else if (a.audience === "opositores") recipients = all.filter((u) => u.role === "opositor");
    else if (Array.isArray(a.audience)) recipients = all.filter((u) => a.audience.includes(u.id));
    if (recipients.length) {
      notifications.notifyUsers({
        orgId,
        userIds: recipients.map((u) => u.id),
        template: "announcement",
        data: { title, body },
        appUrl,
      }).catch((er) => console.error("[notify:announcement]", er));
    }
    res.json({ announcement: a, notifiedCount: recipients.length });
  });

  // ── Listado de preparadores y opositores de la organización ───────────────

  r.get("/people", (req, res) => {
    const orgId = orgOf(req);
    const users = db.find("users", (u) => u.organizationId === orgId && u.status === "active");
    res.json({
      preparadores: users.filter((u) => u.role === "preparador").map((u) => ({ id: u.id, name: u.name, email: u.email })),
      opositores: users.filter((u) => u.role === "opositor").map((u) => ({ id: u.id, name: u.name, email: u.email })),
      admins: users.filter((u) => u.role === "admin").map((u) => ({ id: u.id, name: u.name, email: u.email })),
    });
  });

  return r;
};
