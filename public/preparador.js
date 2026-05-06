// ─────────────────────────────────────────────────────────────────────────────
// Vista del preparador. Fase 2:
//   - Agenda con calendario mensual + lista próximos 14 días
//   - Crear/editar evento con destinatarios y recurrencia (sem/quinc/mes)
//   - Edición y borrado "solo este día" o "todos"
//   - Publicar huecos de disponibilidad recurrentes
//   - Ver reservas confirmadas con opción de cancelar
// ─────────────────────────────────────────────────────────────────────────────

const preparadorView = (() => {
  const DOW_OPTS = [
    { v: 0, label: "Lunes" }, { v: 1, label: "Martes" }, { v: 2, label: "Miércoles" },
    { v: 3, label: "Jueves" }, { v: 4, label: "Viernes" }, { v: 5, label: "Sábado" }, { v: 6, label: "Domingo" },
  ];

  let state = {
    section: "dashboard",
    data: null,
    people: { preparadores: [], opositores: [], admins: [] },
    availability: [],
    occurrences: [],
    bookings: [],
    nextEvents: [],
    cal: null,
  };

  async function loadDashboard() { state.data = await api.preparador.dashboard(); }
  async function loadAgendaData() {
    try {
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const end = new Date(today); end.setDate(end.getDate() + 14);
      const to = end.toISOString().slice(0, 10);
      const [evs, people] = await Promise.all([api.common.events(from, to), api.common.people()]);
      state.nextEvents = evs.events || [];
      state.people = people;
    } catch (e) { console.error(e); }
  }
  async function loadAvailability() {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const end = new Date(today); end.setDate(end.getDate() + 60);
    const to = end.toISOString().slice(0, 10);
    const [a, b] = await Promise.all([api.common.availability(from, to), api.common.bookings()]);
    state.availability = a.availability || [];
    state.occurrences = a.occurrences || [];
    state.bookings = b.bookings || [];
  }

  function shell(content) {
    const initials = app.currentOrg?.branding?.initials || "PR";
    return `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand-row">
            <div class="brand-mark" style="background: var(--brand); color: white;">${ui.esc(initials)}</div>
            <div><strong style="color:white;">${ui.esc(app.currentOrg?.name || "Academia")}</strong><small>Panel preparador</small></div>
          </div>
          <div class="org-badge"><strong>${ui.esc(app.currentUser.name)}</strong>Preparador · ${ui.esc(app.currentUser.email)}</div>
          <nav class="nav">
            <button data-section="dashboard" ${state.section === "dashboard" ? 'class="active"' : ""}>📊 Resumen</button>
            <button data-section="agenda" ${state.section === "agenda" ? 'class="active"' : ""}>📅 Agenda</button>
            <button data-section="availability" ${state.section === "availability" ? 'class="active"' : ""}>🕐 Disponibilidad</button>
            <button data-section="bookings" ${state.section === "bookings" ? 'class="active"' : ""}>👋 Reservas</button>
            <button data-section="opositores" ${state.section === "opositores" ? 'class="active"' : ""}>👥 Mis opositores</button>
            <button data-section="syllabus" ${state.section === "syllabus" ? 'class="active"' : ""}>📚 Temario</button>
            <button data-section="library" ${state.section === "library" ? 'class="active"' : ""}>🗂️ Biblioteca</button>
            <button data-section="corrections" ${state.section === "corrections" ? 'class="active"' : ""}>✏️ Correcciones</button>
            <button data-section="chats" ${state.section === "chats" ? 'class="active"' : ""}>💬 Chats IA</button>
            <button data-section="reports" ${state.section === "reports" ? 'class="active"' : ""}>📄 Informes</button>
          </nav>
          <div class="sidebar-footer"><button class="ghost" id="logout-btn">Cerrar sesión</button></div>
        </aside>
        <main class="main">${content}</main>
      </div>`;
  }

  function dashboardSection() {
    const s = state.data?.stats || {};
    const opos = state.data?.opositores || [];
    const masteryData = opos.map((o) => ({ label: o.name.split(" ")[0], value: o.mastery || 0 }));
    return `
      <div class="section-head">
        <div><p class="eyebrow">Mi semana</p><h1>Hola, ${ui.esc(app.currentUser.name.split(" ")[0])}</h1></div>
      </div>
      <div class="grid cols-3 mb-4">
        <div class="card metric"><span class="label">Opositores</span><strong>${s.opositoresCount || 0}</strong></div>
        <div class="card metric"><span class="label">Interacciones del mes</span><strong>${s.interactionsThisMonth || 0}</strong></div>
        <div class="card metric"><span class="label">Correcciones pendientes</span><strong>${s.pendingCorrections || 0}</strong></div>
      </div>
      ${opos.length > 0 ? `
        <div class="grid cols-2 mb-4">
          <div class="chart-card">
            <h3>Dominio medio por opositor</h3>
            ${ui.barChart(masteryData, { maxValue: 100, height: 160 })}
            <div class="legend"><span><i style="background:var(--brand);"></i>% dominio</span></div>
          </div>
          <div class="chart-card">
            <h3>Reparto por especialidad</h3>
            ${(() => {
              const counts = {};
              opos.forEach((o) => { const k = o.examName || "Sin definir"; counts[k] = (counts[k] || 0) + 1; });
              const data = Object.entries(counts).map(([label, value]) => ({ label, value }));
              return ui.barChart(data, { height: 160 });
            })()}
            <div class="legend"><span><i style="background:var(--brand);"></i>nº opositores</span></div>
          </div>
        </div>
      ` : ""}
      <div class="card">
        <h2>Opositores asignados</h2>
        <div class="table mt-4">
          <div class="table-row header"><span>Nombre</span><span>Examen</span><span>Horas/sem</span><span>Dominio medio</span><span></span></div>
          ${opos.map((o) => `
            <div class="table-row">
              <span><strong>${ui.esc(o.name)}</strong><br/><small class="muted">${ui.esc(o.email)}</small></span>
              <span>${ui.esc(o.examDate || "—")}</span>
              <span>${o.weeklyHours} h</span>
              <span><span class="pill ${o.mastery > 65 ? "success" : o.mastery > 45 ? "warn" : "danger"}">${o.mastery}%</span></span>
              <span class="actions"><button class="ghost sm" data-prep-report="${ui.esc(o.id)}">Generar informe</button></span>
            </div>`).join("") || `<div class="empty-state">Sin opositores asignados.</div>`}
        </div>
      </div>`;
  }

  // ── Fase 4: Chats supervisión ───────────────────────────────────────────

  async function loadChatsSupervision() {
    try {
      const data = await api.chat.threads();
      state.chatThreads = data.threads || [];
      state.chatActive = state.chatThreads[0] || null;
    } catch { state.chatThreads = []; state.chatActive = null; }
  }

  function chatsSupervisionSection() {
    const threads = state.chatThreads || [];
    const opos = state.people.opositores || [];
    const active = state.chatActive;

    return `
      <div class="section-head">
        <div><p class="eyebrow">Asistente IA</p><h1>💬 Conversaciones de mis opositores</h1></div>
      </div>

      <div class="card mb-4">
        <h3>Activación del asistente</h3>
        <p class="muted text-sm mb-3">Activa o desactiva el asistente IA por opositor. Las conversaciones quedan registradas para tu revisión.</p>
        <div class="grid cols-2">
          ${opos.map((o) => `
            <div class="row" style="justify-content:space-between;background:var(--bg-soft);padding:10px 14px;border-radius:8px;margin-bottom:6px;">
              <strong>${ui.esc(o.name)}</strong>
              <button class="ghost sm" data-toggle-chat="${ui.esc(o.id)}" data-current="${o.chatbotEnabled ? "1" : "0"}">
                ${o.chatbotEnabled ? "✓ Activo · Desactivar" : "Activar"}
              </button>
            </div>`).join("")}
        </div>
      </div>

      <div class="chat-shell">
        <div class="chat-threads">
          ${threads.length === 0 ? `<div class="empty-state" style="padding:20px;">Sin conversaciones aún.</div>` : ""}
          ${threads.map((t) => {
            const opo = opos.find((o) => o.id === t.opositorId);
            return `
              <div class="thread-row ${active?.id === t.id ? "active" : ""}" data-sup-thread="${ui.esc(t.id)}">
                <strong>${ui.esc(opo?.name || "Opositor")}</strong>
                <small>${ui.esc(t.title || "")} · ${(t.messages || []).length} msg</small>
              </div>`;
          }).join("")}
        </div>

        <div class="chat-pane">
          ${active ? `
            <div class="chat-messages">
              ${(active.messages || []).map((m) => `
                <div class="chat-bubble ${m.role}">
                  ${ui.esc(m.text)}
                  <small>${ui.esc((m.at || "").slice(0, 16))}${m.mocked ? " · simulado" : ""}</small>
                </div>`).join("")}
            </div>
            <div class="chat-input">
              <small class="muted" style="margin:auto;">📖 Modo lectura · sólo el opositor puede enviar mensajes</small>
            </div>
          ` : `<div class="empty-state" style="padding:60px 20px;">Selecciona una conversación.</div>`}
        </div>
      </div>
    `;
  }

  // ── Fase 4: Informes ───────────────────────────────────────────────────

  async function loadReports() {
    // No carga datos previos: el informe se genera bajo demanda
    state.lastReport = state.lastReport || null;
  }

  function reportsSection() {
    const opos = state.people.opositores || [];
    const r = state.lastReport;
    return `
      <div class="section-head">
        <div><p class="eyebrow">Informes con IA</p><h1>📄 Informes de opositores</h1></div>
      </div>
      <p class="muted text-sm mb-4">Pulsa sobre un opositor para generar un informe automático con análisis y recomendaciones.</p>

      <div class="grid cols-3 mb-4">
        ${opos.map((o) => `
          <div class="card">
            <h3 style="font-size:0.95rem;">${ui.esc(o.name)}</h3>
            <p class="muted text-sm">${ui.esc(o.email)}</p>
            <button class="btn sm mt-3" data-gen-report="${ui.esc(o.id)}">Generar informe</button>
          </div>`).join("")}
      </div>

      ${r ? `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start;">
            <div>
              <p class="eyebrow">Informe generado por ${ui.esc(r.provider)}</p>
              <h2>${ui.esc(r.opositor.name)}</h2>
              <p class="muted text-sm">${ui.esc(r.generatedAt.slice(0, 16))}</p>
            </div>
            <button class="ghost sm" id="close-report">Cerrar</button>
          </div>

          <div class="grid cols-3 mt-4 mb-4">
            <div>
              <p class="eyebrow">Fortalezas</p>
              <ul style="padding-left:18px;font-size:0.86rem;">
                ${(r.heuristic.strengths || []).map((x) => `<li>${ui.esc(x)}</li>`).join("") || `<li class="muted">—</li>`}
              </ul>
            </div>
            <div>
              <p class="eyebrow">Áreas de mejora</p>
              <ul style="padding-left:18px;font-size:0.86rem;">
                ${(r.heuristic.weaknesses || []).map((x) => `<li>${ui.esc(x)}</li>`).join("") || `<li class="muted">—</li>`}
              </ul>
            </div>
            <div>
              <p class="eyebrow">Recomendaciones</p>
              <ul style="padding-left:18px;font-size:0.86rem;">
                ${(r.heuristic.recommendations || []).map((x) => `<li>${ui.esc(x)}</li>`).join("") || `<li class="muted">—</li>`}
              </ul>
            </div>
          </div>

          ${r.aiReport ? `
            <div class="divider"></div>
            <h3>Análisis IA</h3>
            <div class="card" style="background:var(--bg-soft);white-space:pre-wrap;font-size:0.9rem;">${ui.esc(r.aiReport)}</div>
          ` : ""}
        </div>
      ` : ""}
    `;
  }

  function agendaSection() {
    return `
      <div class="section-head">
        <div><p class="eyebrow">Calendario</p><h1>Agenda</h1></div>
        <button class="btn" id="new-event-btn">+ Nuevo evento</button>
      </div>
      <div class="grid" style="grid-template-columns: 2.2fr 1fr; gap: 16px;">
        <div id="cal-mount"></div>
        <div>
          <div class="card">
            <h3>Próximos 14 días</h3>
            <div class="event-list mt-3">
              ${state.nextEvents.length === 0 ? `<div class="empty-state" style="padding:18px;">Sin eventos.</div>` : ""}
              ${state.nextEvents.slice(0, 8).map(eventRow).join("")}
            </div>
          </div>
        </div>
      </div>`;
  }

  function eventRow(e) {
    const date = e.occurrenceDate || e.date;
    const day = date ? new Date(date + "T00:00:00").getDate() : "";
    const monthShort = date ? new Date(date + "T00:00:00").toLocaleDateString("es-ES", { month: "short" }) : "";
    const cls = ["event-row", (e.type || "").toLowerCase()].filter(Boolean).join(" ");
    return `
      <div class="${cls}" data-event-id="${ui.esc(e.id)}" data-event-date="${ui.esc(date)}">
        <div class="when">${ui.esc(monthShort)}<strong>${day}</strong>${e.time ? `<small>${ui.esc(e.time)}</small>` : ""}</div>
        <div>
          <strong>${ui.esc(e.title)}</strong>
          <small class="muted" style="display:block;">${ui.esc(e.type || "")}${e.recurrenceParentId ? " · ✏️ modificado" : e.recurrence !== "none" ? " · 🔁 recurrente" : ""}</small>
        </div>
        <div class="actions">
          <button class="ghost sm" data-event-edit="${ui.esc(e.id)}" data-event-date="${ui.esc(date)}">Editar</button>
        </div>
      </div>`;
  }

  function availabilitySection() {
    return `
      <div class="section-head">
        <div><p class="eyebrow">Tutorías</p><h1>Mi disponibilidad</h1></div>
        <button class="btn" id="new-slot-btn">+ Publicar hueco</button>
      </div>
      <p class="muted text-sm mb-4">Define los huecos recurrentes en los que estás disponible para tutorías. Los opositores asignados podrán reservarlos desde su panel.</p>
      <div class="card mb-4">
        <h3>Huecos publicados <span class="pill muted">${state.availability.length}</span></h3>
        <div class="event-list mt-3">
          ${state.availability.length === 0 ? `<div class="empty-state" style="padding:24px;">Aún no has publicado huecos.</div>` : ""}
          ${state.availability.map((s) => `
            <div class="slot-card">
              <div class="slot-when">
                <strong>${DOW_OPTS[s.dayOfWeek]?.label || ""} a las ${ui.esc(s.time)}</strong>
                <small>${s.durationMin} min · ${recurrenceLabel(s.recurrence)} ${s.until ? `· hasta ${s.until}` : ""}</small>
              </div>
              <button class="ghost sm" data-del-slot="${ui.esc(s.id)}">Quitar</button>
            </div>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3>Próximas ocurrencias <span class="pill muted">${state.occurrences.length}</span></h3>
        <p class="muted text-sm">Los huecos en gris ya están reservados.</p>
        <div class="event-list mt-3">
          ${state.occurrences.slice(0, 12).map((o) => `
            <div class="slot-card ${o.booked ? "booked" : ""}">
              <div class="slot-when">
                <strong>${ui.esc(formatDate(o.date))} · ${ui.esc(o.time)}</strong>
                <small>${o.durationMin} min ${o.booked ? `· reservado por ${ui.esc(opositorName(o.bookedBy))}` : ""}</small>
              </div>
              ${o.booked ? `<span class="pill warn">Reservado</span>` : `<span class="pill success">Libre</span>`}
            </div>`).join("")}
        </div>
      </div>`;
  }

  function bookingsSection() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = state.bookings.filter((b) => b.status === "confirmed" && b.date >= today);
    const past = state.bookings.filter((b) => b.date < today || b.status === "cancelled");

    return `
      <div class="section-head"><div><p class="eyebrow">Tutorías reservadas</p><h1>Reservas</h1></div></div>
      <div class="card mb-4">
        <h3>Próximas <span class="pill muted">${upcoming.length}</span></h3>
        <div class="event-list mt-3">
          ${upcoming.length === 0 ? `<div class="empty-state" style="padding:24px;">Sin reservas próximas.</div>` : ""}
          ${upcoming.map(bookingRow).join("")}
        </div>
      </div>
      ${past.length > 0 ? `
      <div class="card">
        <h3>Histórico</h3>
        <div class="event-list mt-3">${past.slice(0, 10).map(bookingRow).join("")}</div>
      </div>` : ""}`;
  }

  function bookingRow(b) {
    return `
      <div class="slot-card ${b.status === "cancelled" ? "booked" : ""}">
        <div class="slot-when">
          <strong>${ui.esc(formatDate(b.date))} · ${ui.esc(b.time)}</strong>
          <small>${b.durationMin || 60} min · ${ui.esc(opositorName(b.opositorId))}${b.notes ? ` · "${ui.esc(b.notes)}"` : ""}</small>
        </div>
        ${b.status === "confirmed"
          ? `<button class="ghost sm" data-cancel-booking="${ui.esc(b.id)}">Cancelar</button>`
          : `<span class="pill muted">${b.status}</span>`}
      </div>`;
  }

  function recurrenceLabel(r) {
    return { none: "Sin repetir", weekly: "Cada semana", biweekly: "Cada 2 semanas", monthly: "Cada mes" }[r] || r;
  }
  function formatDate(d) {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  }
  function opositorName(id) {
    return state.people.opositores.find((o) => o.id === id)?.name
      || state.data?.opositores?.find((o) => o.id === id)?.name
      || "(opositor)";
  }

  // ── Fase 3: Temario ─────────────────────────────────────────────────────

  async function loadSyllabus() {
    try {
      const data = await api.preparador.syllabi();
      state.syllabi = data.syllabi || [];
      const first = state.syllabi[0];
      if (first) {
        const fresh = await api.syllabi.get(first.id);
        state.activeSyllabus = fresh.syllabus;
      }
    } catch (e) { state.syllabi = []; state.activeSyllabus = null; }
  }

  function syllabusSection() {
    const s = state.activeSyllabus;
    if (!s) {
      return `
        <div class="section-head"><div><p class="eyebrow">Temario</p><h1>Temario oficial</h1></div></div>
        <div class="empty-state">
          <h3>📚 Sin temario</h3>
          <p>Aún no has creado ningún temario.</p>
          <button class="btn mt-3" id="new-syllabus-btn">+ Crear temario</button>
        </div>`;
    }
    return `
      <div class="section-head">
        <div>
          <p class="eyebrow">${ui.esc(s.examName || "Temario")}</p>
          <h1>${ui.esc(s.title)}</h1>
        </div>
        <button class="btn" id="add-topic-btn">+ Añadir tema</button>
      </div>
      ${s.description ? `<p class="muted mb-4">${ui.esc(s.description)}</p>` : ""}
      <div>
        ${(s.topics || []).map((t) => `
          <div class="topic-card" data-topic="${ui.esc(t.id)}">
            <div class="top">
              <div>
                <strong>${ui.esc(t.number)} · ${ui.esc(t.title)}</strong>
                <small>Bloque: ${ui.esc(t.block || "—")}</small>
                <div class="meta">
                  <span class="pill ${t.difficulty === "Alta" ? "warn" : t.difficulty === "Baja" ? "muted" : ""}">${ui.esc(t.difficulty || "Media")}</span>
                  <span class="pill ${t.priority === "Muy alta" ? "danger" : t.priority === "Alta" ? "warn" : "muted"}">${ui.esc(t.priority || "—")}</span>
                </div>
              </div>
              <div style="display:flex;gap:6px;">
                <button class="ghost sm" data-edit-topic="${ui.esc(t.id)}">Editar</button>
                <button class="ghost sm" data-add-attachment="${ui.esc(t.id)}">+ Adjunto</button>
                <button class="ghost sm" data-del-topic="${ui.esc(t.id)}" style="color:var(--danger);">Borrar</button>
              </div>
            </div>
            ${(t.attachments || []).length > 0 ? `
              <div class="topic-attachments">
                ${t.attachments.map((a) => `
                  <div class="topic-attachment kind-${ui.esc(a.kind || "documento")}">
                    <div class="icon">${ui.fileIcon(a.kind, a.contentType)}</div>
                    <div class="info">
                      <strong>${ui.esc(a.label)}</strong>
                      <small class="muted">${ui.esc(a.kind)} · ${ui.formatBytes(a.size)}</small>
                    </div>
                    <a class="ghost sm" href="${ui.esc(a.downloadUrl)}" target="_blank">Abrir</a>
                    <button class="ghost sm" data-del-attachment="${ui.esc(t.id)}|${ui.esc(a.id)}" style="color:var(--danger);">Quitar</button>
                  </div>`).join("")}
              </div>
            ` : ""}
          </div>
        `).join("") || `<div class="empty-state">Aún no hay temas.</div>`}
      </div>
    `;
  }

  // ── Fase 3: Biblioteca ──────────────────────────────────────────────────

  async function loadLibrary() {
    try {
      const data = await api.materials.list();
      state.materials = data.materials || [];
      state.materialCategories = data.categories || [];
    } catch (e) { state.materials = []; state.materialCategories = []; }
  }

  function librarySection() {
    const cats = state.materialCategories || [];
    const filter = state.libraryFilter || "all";
    const filtered = filter === "all"
      ? state.materials
      : state.materials.filter((m) => m.category === filter);

    return `
      <div class="section-head">
        <div><p class="eyebrow">Materiales clasificados</p><h1>Biblioteca</h1></div>
        <button class="btn" id="new-material-btn">+ Subir material</button>
      </div>
      <div class="category-bar">
        <button data-cat="all" class="${filter === "all" ? "active" : ""}">Todos · ${state.materials.length}</button>
        ${cats.map((c) => {
          const n = state.materials.filter((m) => m.category === c.id).length;
          return `<button data-cat="${ui.esc(c.id)}" class="${filter === c.id ? "active" : ""}">${c.icon} ${ui.esc(c.label)} · ${n}</button>`;
        }).join("")}
      </div>
      <div class="grid cols-3">
        ${filtered.length === 0 ? `<div class="empty-state" style="grid-column:1/-1;">Sin materiales en esta categoría.</div>` : ""}
        ${filtered.map((m) => `
          <div class="card">
            <p class="eyebrow">${ui.esc(catLabel(m.category))}</p>
            <h3 style="font-size:0.95rem;">${ui.esc(m.title)}</h3>
            <p class="muted text-sm">${ui.esc(m.topic || "—")}</p>
            <div class="row mt-3">
              <small class="muted">
                ${ui.esc(m.type || "Recurso")} · ${m.visibility === "all" ? "Todos" : `${(m.audienceIds || []).length} opositor(es)`}
                · ${m.downloads || 0} descargas
              </small>
            </div>
            <div class="row mt-2">
              ${m.downloadUrl ? `<a class="ghost sm" href="${ui.esc(m.downloadUrl)}" target="_blank">Abrir</a>` : `<span class="pill muted">Sin archivo</span>`}
              <button class="ghost sm" data-edit-mat="${ui.esc(m.id)}">Editar</button>
              <button class="ghost sm" data-del-mat="${ui.esc(m.id)}" style="color:var(--danger);">Borrar</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function catLabel(id) {
    const c = (state.materialCategories || []).find((x) => x.id === id);
    return c ? `${c.icon} ${c.label}` : id;
  }

  // ── Fase 3: Correcciones ────────────────────────────────────────────────

  async function loadCorrections() {
    try {
      const data = await api.corrections.list();
      state.corrections = data.corrections || [];
    } catch (e) { state.corrections = []; }
  }

  function correctionsSection() {
    const list = state.corrections || [];
    const buckets = {
      pendiente: list.filter((c) => c.status === "pendiente"),
      entregado: list.filter((c) => c.status === "entregado"),
      reabierto: list.filter((c) => c.status === "reabierto"),
      corregido: list.filter((c) => c.status === "corregido"),
    };
    const labels = { pendiente: "Pendientes", entregado: "Por corregir", reabierto: "Reabiertas", corregido: "Corregidas" };
    return `
      <div class="section-head">
        <div><p class="eyebrow">Ejercicios y rúbricas</p><h1>Correcciones</h1></div>
        <button class="btn" id="new-correction-btn">+ Nuevo ejercicio</button>
      </div>
      ${["entregado", "pendiente", "reabierto", "corregido"].map((s) => `
        <div class="card mb-4">
          <h3>${labels[s]} <span class="pill ${s === "entregado" ? "warn" : s === "corregido" ? "success" : "muted"}">${buckets[s].length}</span></h3>
          <div class="event-list mt-3">
            ${buckets[s].length === 0 ? `<div class="empty-state" style="padding:18px;">Sin elementos.</div>` : ""}
            ${buckets[s].map((c) => correctionRow(c)).join("")}
          </div>
        </div>
      `).join("")}
    `;
  }

  function correctionRow(c) {
    const opositor = state.people.opositores.find((o) => o.id === c.opositorId)
      || state.data?.opositores?.find((o) => o.id === c.opositorId);
    return `
      <div class="slot-card">
        <div class="slot-when">
          <strong>${ui.esc(c.title)}</strong>
          <small>${ui.esc(opositor?.name || "(opositor)")}${c.dueDate ? ` · vence ${ui.esc(c.dueDate)}` : ""}${c.totalScore != null ? ` · nota ${c.totalScore}/10` : ""}</small>
        </div>
        <div style="display:flex;gap:6px;">
          ${c.submissionFile ? `<a class="ghost sm" href="${ui.esc(c.submissionDownloadUrl)}" target="_blank">Ver entrega</a>` : ""}
          <button class="btn sm" data-correct="${ui.esc(c.id)}">${c.status === "entregado" ? "Corregir" : c.status === "corregido" ? "Ver" : "Detalle"}</button>
        </div>
      </div>`;
  }

  // ── Render + bindings (extendidos) ──────────────────────────────────────

  function render() {
    let content;
    if (state.section === "dashboard" || state.section === "opositores") content = dashboardSection();
    else if (state.section === "agenda") content = agendaSection();
    else if (state.section === "availability") content = availabilitySection();
    else if (state.section === "bookings") content = bookingsSection();
    else if (state.section === "syllabus") content = syllabusSection();
    else if (state.section === "library") content = librarySection();
    else if (state.section === "corrections") content = correctionsSection();
    else if (state.section === "chats") content = chatsSupervisionSection();
    else if (state.section === "reports") content = reportsSection();
    ui.root().innerHTML = shell(content);
    bind();
    if (state.section === "agenda") mountCalendar();
  }

  async function mountCalendar() {
    const mount = document.getElementById("cal-mount");
    if (!mount) return;
    state.cal = calendarComponent({
      getEvents: (from, to) => api.common.events(from, to),
      onEventClick: (ev) => { if (ev) openEventModal(ev); },
      onDayClick: (date) => openEventModal({ date, time: "10:00", recurrence: "none" }, true),
    });
    mount.innerHTML = await state.cal.init();
    state.cal.bind(mount.firstElementChild);
  }

  function bind() {
    document.querySelectorAll("[data-section]").forEach((b) => {
      b.onclick = async () => {
        state.section = b.dataset.section;
        if (state.section === "agenda") await loadAgendaData();
        else if (state.section === "availability" || state.section === "bookings") {
          await loadAvailability(); await loadAgendaData();
        } else if (state.section === "syllabus") await loadSyllabus();
        else if (state.section === "library") { await loadLibrary(); await loadAgendaData(); }
        else if (state.section === "corrections") { await loadCorrections(); await loadAgendaData(); }
        else if (state.section === "chats") { await loadChatsSupervision(); await loadAgendaData(); }
        else if (state.section === "reports") { await loadReports(); await loadAgendaData(); }
        render();
      };
    });
    document.getElementById("logout-btn").onclick = () => app.logout();

    document.getElementById("new-event-btn")?.addEventListener("click", () =>
      openEventModal({ date: new Date().toISOString().slice(0, 10), time: "10:00", recurrence: "none" }, true));

    document.querySelectorAll("[data-event-edit]").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.eventEdit;
        const occDate = b.dataset.eventDate;
        const ev = state.nextEvents.find((e) => e.id === id && (e.occurrenceDate || e.date) === occDate);
        if (ev) openEventModal(ev);
      };
    });

    document.getElementById("new-slot-btn")?.addEventListener("click", openSlotModal);
    document.querySelectorAll("[data-del-slot]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Quitar este hueco? Las reservas existentes se conservarán.")) return;
        try {
          await api.common.deleteAvailability(b.dataset.delSlot);
          ui.toast("Hueco eliminado", "success");
          await loadAvailability(); render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });
    document.querySelectorAll("[data-cancel-booking]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Cancelar la tutoría reservada?")) return;
        try {
          await api.common.cancelBooking(b.dataset.cancelBooking);
          ui.toast("Reserva cancelada", "success");
          await loadAvailability(); render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });

    // ── Temario ─────────────────────────────────────────────────────────────
    document.getElementById("new-syllabus-btn")?.addEventListener("click", openNewSyllabusModal);
    document.getElementById("add-topic-btn")?.addEventListener("click", () => openTopicModal(null));
    document.querySelectorAll("[data-edit-topic]").forEach((b) => {
      b.onclick = () => {
        const t = (state.activeSyllabus?.topics || []).find((x) => x.id === b.dataset.editTopic);
        if (t) openTopicModal(t);
      };
    });
    document.querySelectorAll("[data-del-topic]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Borrar el tema y todos sus adjuntos?")) return;
        try {
          await api.syllabi.deleteTopic(state.activeSyllabus.id, b.dataset.delTopic);
          ui.toast("Tema borrado", "success");
          await loadSyllabus(); render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });
    document.querySelectorAll("[data-add-attachment]").forEach((b) => {
      b.onclick = () => openAttachmentModal(b.dataset.addAttachment);
    });
    document.querySelectorAll("[data-del-attachment]").forEach((b) => {
      b.onclick = async () => {
        const [tid, aid] = b.dataset.delAttachment.split("|");
        if (!confirm("¿Quitar este adjunto?")) return;
        try {
          await api.syllabi.deleteAttachment(state.activeSyllabus.id, tid, aid);
          ui.toast("Adjunto eliminado", "success");
          await loadSyllabus(); render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });

    // ── Biblioteca ──────────────────────────────────────────────────────────
    document.getElementById("new-material-btn")?.addEventListener("click", () => openMaterialModal(null));
    document.querySelectorAll("[data-cat]").forEach((b) => {
      b.onclick = () => { state.libraryFilter = b.dataset.cat; render(); };
    });
    document.querySelectorAll("[data-edit-mat]").forEach((b) => {
      b.onclick = () => {
        const m = state.materials.find((x) => x.id === b.dataset.editMat);
        if (m) openMaterialModal(m);
      };
    });
    document.querySelectorAll("[data-del-mat]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Borrar el material?")) return;
        try {
          await api.materials.delete(b.dataset.delMat);
          ui.toast("Material borrado", "success");
          await loadLibrary(); render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });

    // ── Correcciones ────────────────────────────────────────────────────────
    document.getElementById("new-correction-btn")?.addEventListener("click", () => openCorrectionModal(null));
    document.querySelectorAll("[data-correct]").forEach((b) => {
      b.onclick = () => {
        const c = state.corrections.find((x) => x.id === b.dataset.correct);
        if (c) openCorrectionModal(c);
      };
    });

    // ── Chats supervisión ──────────────────────────────────────────────────
    document.querySelectorAll("[data-toggle-chat]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.toggleChat;
        const enabled = b.dataset.current !== "1";
        try {
          await api.chat.enable(id, enabled);
          ui.toast(enabled ? "Chatbot activado para este opositor" : "Chatbot desactivado", "success");
          await loadAgendaData();
          render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });
    document.querySelectorAll("[data-sup-thread]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.supThread;
        const fresh = await api.chat.thread(id);
        state.chatActive = fresh.thread;
        render();
      };
    });

    // ── Informes ───────────────────────────────────────────────────────────
    document.querySelectorAll("[data-gen-report], [data-prep-report]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.genReport || b.dataset.prepReport;
        try {
          ui.toast("Generando informe…", "info");
          const r = await api.reports.opositor(id);
          state.lastReport = r;
          state.section = "reports";
          render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });
    document.getElementById("close-report")?.addEventListener("click", () => {
      state.lastReport = null;
      render();
    });
  }

  function openEventModal(ev, isNew = false) {
    isNew = isNew || !ev.id;
    const recipientsAll = [
      ...state.people.preparadores.map((p) => ({ id: p.id, name: p.name })),
      ...state.people.opositores.map((o) => ({ id: o.id, name: o.name })),
    ];
    const selected = new Set(ev.recipients || [app.currentUser.id]);

    const m = ui.modal({
      title: isNew ? "Nuevo evento" : ev.title,
      body: `
        <form class="form" id="event-form">
          <label>Título<input name="title" required value="${ui.esc(ev.title || "")}" /></label>
          <div class="grid cols-2">
            <label>Tipo
              <select name="type">
                ${["evento", "tutoria", "llamada", "videoconferencia", "tarea", "aviso"].map((t) =>
                  `<option ${(ev.type || "evento") === t ? "selected" : ""}>${t}</option>`).join("")}
              </select>
            </label>
            <label>Duración (min)<input name="durationMin" type="number" min="15" step="15" value="${ev.durationMin || 60}" /></label>
          </div>
          <div class="grid cols-2">
            <label>Fecha<input name="date" type="date" required value="${ui.esc(ev.occurrenceDate || ev.date || "")}" /></label>
            <label>Hora<input name="time" type="time" required value="${ui.esc(ev.time || "10:00")}" /></label>
          </div>
          <label>Destinatarios
            <div class="chip-row" id="recipients-chips">
              ${recipientsAll.map((p) => `
                <button type="button" class="chip ${selected.has(p.id) ? "active" : ""}" data-recipient="${p.id}">
                  ${ui.esc(p.name)}
                </button>`).join("")}
            </div>
          </label>
          <div class="grid cols-2">
            <label>Recurrencia
              <select name="recurrence">
                <option value="none" ${(ev.recurrence || "none") === "none" ? "selected" : ""}>No se repite</option>
                <option value="weekly" ${ev.recurrence === "weekly" ? "selected" : ""}>Cada semana</option>
                <option value="biweekly" ${ev.recurrence === "biweekly" ? "selected" : ""}>Cada 2 semanas</option>
                <option value="monthly" ${ev.recurrence === "monthly" ? "selected" : ""}>Cada mes</option>
              </select>
            </label>
            <label>Hasta (opcional)<input name="recurrenceUntil" type="date" value="${ui.esc(ev.recurrenceUntil || "")}" /></label>
          </div>
          <label>Notas<textarea name="description" rows="2">${ui.esc(ev.description || "")}</textarea></label>
        </form>`,
      footer: isNew
        ? `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-ev">Crear</button>`
        : `<div style="margin-right:auto;display:flex;gap:6px;">
             <button class="ghost sm" id="del-this" style="color:var(--danger);">Borrar este día</button>
             ${(ev.recurrence && ev.recurrence !== "none") || ev.recurrenceParentId ? `<button class="ghost sm" id="del-all" style="color:var(--danger);">Borrar todos</button>` : ""}
           </div>
           <button class="ghost" data-close>Cancelar</button>
           ${(ev.recurrence && ev.recurrence !== "none") || ev.recurrenceParentId
              ? `<button class="ghost" id="save-this">Solo este día</button><button class="btn" id="save-all">Todos</button>`
              : `<button class="btn" id="save-all">Guardar</button>`}`,
    });

    m.el.querySelectorAll("[data-recipient]").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.recipient;
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        b.classList.toggle("active");
      };
    });

    function gather() {
      const fd = new FormData(m.el.querySelector("#event-form"));
      return {
        title: fd.get("title"), type: fd.get("type"),
        date: fd.get("date"), time: fd.get("time"),
        durationMin: Number(fd.get("durationMin")) || 60,
        recipients: Array.from(selected),
        recurrence: fd.get("recurrence"), recurrenceUntil: fd.get("recurrenceUntil") || "",
        description: fd.get("description") || "",
      };
    }
    async function refreshClose(msg) {
      ui.toast(msg, "success"); m.close();
      await loadAgendaData(); render();
    }

    const masterId = ev.recurrenceParentId || ev.id;
    const occDate = ev.occurrenceDate || ev.date;

    m.el.querySelector("#save-ev")?.addEventListener("click", async () => {
      try { await api.common.createEvent(gather()); await refreshClose("Evento creado"); }
      catch (e) { ui.toast(e.error || "Error", "error"); }
    });
    m.el.querySelector("#save-this")?.addEventListener("click", async () => {
      try { await api.common.updateEvent(masterId, gather(), "this", occDate); await refreshClose("Ocurrencia actualizada"); }
      catch (e) { ui.toast(e.error || "Error", "error"); }
    });
    m.el.querySelector("#save-all")?.addEventListener("click", async () => {
      try { await api.common.updateEvent(masterId, gather(), "all"); await refreshClose("Evento actualizado"); }
      catch (e) { ui.toast(e.error || "Error", "error"); }
    });
    m.el.querySelector("#del-this")?.addEventListener("click", async () => {
      if (!confirm("¿Borrar solo esta ocurrencia?")) return;
      try { await api.common.deleteEvent(masterId, "this", occDate); await refreshClose("Ocurrencia borrada"); }
      catch (e) { ui.toast(e.error || "Error", "error"); }
    });
    m.el.querySelector("#del-all")?.addEventListener("click", async () => {
      if (!confirm("¿Borrar TODAS las ocurrencias?")) return;
      try { await api.common.deleteEvent(masterId, "all"); await refreshClose("Evento borrado"); }
      catch (e) { ui.toast(e.error || "Error", "error"); }
    });
  }

  function openSlotModal() {
    const m = ui.modal({
      title: "Publicar hueco de tutoría",
      body: `
        <form class="form" id="slot-form">
          <p class="muted text-sm">Define un hueco recurrente. Los opositores asignados podrán reservarlo.</p>
          <label>Día de la semana
            <select name="dayOfWeek" required>
              ${DOW_OPTS.map((d) => `<option value="${d.v}">${d.label}</option>`).join("")}
            </select>
          </label>
          <div class="grid cols-2">
            <label>Hora<input type="time" name="time" required value="17:00" /></label>
            <label>Duración (min)<input type="number" name="durationMin" min="15" step="15" value="60" /></label>
          </div>
          <div class="grid cols-2">
            <label>Recurrencia
              <select name="recurrence">
                <option value="weekly">Cada semana</option>
                <option value="biweekly">Cada 2 semanas</option>
              </select>
            </label>
            <label>Hasta (opcional)<input type="date" name="until" /></label>
          </div>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-slot">Publicar</button>`,
    });
    m.el.querySelector("#save-slot").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#slot-form"));
      try {
        await api.common.createAvailability({
          dayOfWeek: Number(fd.get("dayOfWeek")), time: fd.get("time"),
          durationMin: Number(fd.get("durationMin")) || 60,
          recurrence: fd.get("recurrence") || "weekly", until: fd.get("until") || "",
        });
        ui.toast("Hueco publicado", "success");
        m.close();
        await loadAvailability(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    };
  }

  // ── Modales Fase 3 ──────────────────────────────────────────────────────

  function openNewSyllabusModal() {
    const m = ui.modal({
      title: "Crear temario",
      body: `
        <form class="form" id="syllabus-form">
          <label>Título<input name="title" required value="Mi temario" /></label>
          <label>Oposición<input name="examName" placeholder="ej. Auxiliar Administrativo del Estado" /></label>
          <label>Descripción<textarea name="description" rows="3"></textarea></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-syl">Crear</button>`,
    });
    m.el.querySelector("#save-syl").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#syllabus-form"));
      try {
        await api.preparador.createSyllabus({ title: fd.get("title"), description: fd.get("description") });
        ui.toast("Temario creado", "success");
        m.close();
        await loadSyllabus(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    };
  }

  function openTopicModal(topic) {
    const isNew = !topic;
    const m = ui.modal({
      title: isNew ? "Nuevo tema" : `Editar tema`,
      body: `
        <form class="form" id="topic-form">
          <div class="grid cols-2">
            <label>Nº tema<input name="number" value="${ui.esc(topic?.number || `Tema ${(state.activeSyllabus?.topics?.length || 0) + 1}`)}" required /></label>
            <label>Bloque<input name="block" value="${ui.esc(topic?.block || "")}" /></label>
          </div>
          <label>Título<input name="title" required value="${ui.esc(topic?.title || "")}" /></label>
          <div class="grid cols-2">
            <label>Dificultad
              <select name="difficulty">
                ${["Baja","Media","Alta"].map((d) => `<option ${(topic?.difficulty || "Media") === d ? "selected" : ""}>${d}</option>`).join("")}
              </select>
            </label>
            <label>Prioridad
              <select name="priority">
                ${["Baja","Media","Alta","Muy alta"].map((d) => `<option ${(topic?.priority || "Alta") === d ? "selected" : ""}>${d}</option>`).join("")}
              </select>
            </label>
          </div>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-topic">${isNew ? "Crear" : "Guardar"}</button>`,
    });
    m.el.querySelector("#save-topic").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#topic-form"));
      const data = Object.fromEntries(fd);
      try {
        if (isNew) await api.preparador.addTopic(state.activeSyllabus.id, data);
        else await api.syllabi.updateTopic(state.activeSyllabus.id, topic.id, data);
        ui.toast(isNew ? "Tema creado" : "Tema actualizado", "success");
        m.close();
        await loadSyllabus(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    };
  }

  function openAttachmentModal(topicId) {
    const m = ui.modal({
      title: "Añadir adjunto al tema",
      body: `
        <p class="muted text-sm mb-3">Sube un PDF, audio, vídeo o documento. El opositor podrá descargarlo desde su panel.</p>
        <div id="dz-mount"></div>
        <form class="form mt-3" id="attach-form">
          <label>Etiqueta (opcional)<input name="label" placeholder="ej. Audio resumen" /></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cerrar</button>`,
    });
    const dz = ui.dropzone({
      hint: "Arrastra el archivo aquí o pulsa para seleccionar",
      help: "PDF, audio, vídeo, imagen o documento (hasta 50 MB)",
      accept: ".pdf,audio/*,video/*,image/*,.doc,.docx,.xls,.xlsx,.txt",
      onUpload: (file) => api.files.upload(file, "topic"),
      onComplete: async (result, file) => {
        if (!result?.file?.id) return;
        const label = m.el.querySelector("[name=label]")?.value || file.name;
        try {
          await api.syllabi.addAttachment(state.activeSyllabus.id, topicId, {
            fileId: result.file.id,
            label,
            kind: result.file.contentType?.startsWith("audio/") ? "audio"
                : result.file.contentType?.startsWith("video/") ? "video"
                : result.file.contentType?.startsWith("image/") ? "imagen"
                : (result.file.contentType || "").includes("pdf") ? "pdf"
                : "documento",
          });
          ui.toast("Adjunto añadido", "success");
        } catch (e) { ui.toast(e.error || "Error al adjuntar", "error"); }
      },
    });
    m.el.querySelector("#dz-mount").innerHTML = dz.html();
    dz.bind(m.el.querySelector("[data-dz]"));

    m.el.addEventListener("click", async (e) => {
      if (e.target.matches("[data-close]")) {
        await loadSyllabus(); render();
      }
    });
  }

  function openMaterialModal(material) {
    const isNew = !material;
    const cats = state.materialCategories || [];
    const allOpos = state.people.opositores || [];

    let uploadedFileId = material?.fileId || null;
    let uploadedFileName = material?.file?.originalName || null;

    const m = ui.modal({
      title: isNew ? "Nuevo material" : `Editar ${material.title}`,
      body: `
        <form class="form" id="mat-form">
          <div class="grid cols-2">
            <label>Categoría
              <select name="category" required>
                ${cats.map((c) => `<option value="${c.id}" ${material?.category === c.id ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("")}
              </select>
            </label>
            <label>Título<input name="title" required value="${ui.esc(material?.title || "")}" /></label>
          </div>
          <div class="grid cols-2">
            <label>Tema relacionado<input name="topic" value="${ui.esc(material?.topic || "")}" placeholder="ej. Tema 1" /></label>
            <label>Tipo de recurso<input name="type" value="${ui.esc(material?.type || "")}" placeholder="ej. PDF, audio…" /></label>
          </div>
          <label>Descripción<textarea name="description" rows="2">${ui.esc(material?.description || "")}</textarea></label>

          ${isNew ? `<div id="mat-dz" class="mt-2"></div>` : ""}
          <div id="current-file" class="${isNew ? "hidden" : ""}"></div>

          <label>Visibilidad
            <select name="visibility" id="vis-select">
              <option value="all" ${material?.visibility !== "specific" ? "selected" : ""}>Todos los opositores</option>
              <option value="specific" ${material?.visibility === "specific" ? "selected" : ""}>Solo opositores específicos</option>
            </select>
          </label>
          <div id="audience-wrap" class="${material?.visibility === "specific" ? "" : "hidden"}">
            <label>Opositores destinatarios
              <div class="chip-row" id="aud-chips">
                ${allOpos.map((o) => `
                  <button type="button" class="chip ${(material?.audienceIds || []).includes(o.id) ? "active" : ""}" data-aud="${o.id}">${ui.esc(o.name)}</button>
                `).join("")}
              </div>
            </label>
          </div>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-mat">${isNew ? "Crear" : "Guardar"}</button>`,
    });

    function renderCurrentFile() {
      const el = m.el.querySelector("#current-file");
      if (!el) return;
      if (uploadedFileId) {
        el.innerHTML = `
          <div class="file-pill mt-2">
            <div class="icon">📎</div>
            <div class="meta"><strong>${ui.esc(uploadedFileName || "Archivo asociado")}</strong><small>Se conservará al guardar.</small></div>
          </div>`;
      } else {
        el.innerHTML = "";
      }
    }
    renderCurrentFile();

    if (isNew) {
      const dz = ui.dropzone({
        hint: "Arrastra el archivo del material",
        help: "PDF, audio, vídeo, imagen, documento (opcional)",
        onUpload: (file) => api.files.upload(file, "material"),
        onComplete: (result, file) => {
          if (result?.file?.id) {
            uploadedFileId = result.file.id;
            uploadedFileName = result.file.originalName;
          }
        },
      });
      m.el.querySelector("#mat-dz").innerHTML = dz.html();
      dz.bind(m.el.querySelector("[data-dz]"));
    }

    const audSet = new Set(material?.audienceIds || []);
    m.el.querySelectorAll("[data-aud]").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.aud;
        if (audSet.has(id)) audSet.delete(id);
        else audSet.add(id);
        b.classList.toggle("active");
      };
    });

    m.el.querySelector("#vis-select").onchange = (e) => {
      m.el.querySelector("#audience-wrap").classList.toggle("hidden", e.target.value !== "specific");
    };

    m.el.querySelector("#save-mat").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#mat-form"));
      const data = {
        category: fd.get("category"),
        title: fd.get("title"),
        topic: fd.get("topic"),
        type: fd.get("type"),
        description: fd.get("description"),
        visibility: fd.get("visibility"),
        audienceIds: fd.get("visibility") === "specific" ? Array.from(audSet) : [],
        ...(uploadedFileId ? { fileId: uploadedFileId } : {}),
      };
      try {
        if (isNew) await api.materials.create(data);
        else await api.materials.update(material.id, data);
        ui.toast(isNew ? "Material creado" : "Material actualizado", "success");
        m.close();
        await loadLibrary(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    };
  }

  function openCorrectionModal(correction) {
    const isNew = !correction;
    const allOpos = state.people.opositores || [];
    let rubric = correction?.rubric ? correction.rubric.slice() : [
      { id: db_id("rb"), name: "Contenido", weight: 50, max: 10, description: "" },
      { id: db_id("rb"), name: "Estructura", weight: 25, max: 10, description: "" },
      { id: db_id("rb"), name: "Precisión normativa", weight: 25, max: 10, description: "" },
    ];

    const renderRubric = () => rubric.map((rc, i) => `
      <div class="rubric-row" data-rb-row="${i}">
        <label>Criterio<input name="rb-name" value="${ui.esc(rc.name)}" /></label>
        <label>Peso (%)<input name="rb-weight" type="number" min="0" max="100" value="${rc.weight}" /></label>
        <label>Sobre<input name="rb-max" type="number" min="1" value="${rc.max}" /></label>
        <button type="button" class="ghost sm" data-rb-del="${i}" style="color:var(--danger);">×</button>
      </div>`).join("");

    const m = ui.modal({
      title: isNew ? "Asignar nuevo ejercicio" : correction.title,
      body: `
        <form class="form" id="cor-form">
          <label>Opositor
            <select name="opositorId" required ${isNew ? "" : "disabled"}>
              ${allOpos.map((o) => `<option value="${o.id}" ${correction?.opositorId === o.id ? "selected" : ""}>${ui.esc(o.name)}</option>`).join("")}
            </select>
          </label>
          <label>Título del ejercicio<input name="title" required value="${ui.esc(correction?.title || "")}" /></label>
          <div class="grid cols-2">
            <label>Fecha límite<input name="dueDate" type="date" value="${ui.esc(correction?.dueDate || "")}" /></label>
            <label>Estado<input value="${ui.esc(correction?.status || "pendiente")}" disabled /></label>
          </div>
          <label>Instrucciones<textarea name="instructions" rows="3">${ui.esc(correction?.instructions || "")}</textarea></label>

          <h3 class="mt-3" style="font-size:0.95rem;">Rúbrica de evaluación</h3>
          <p class="help">Pesos en porcentaje. La nota total se calcula automáticamente sobre 10.</p>
          <div id="rubric-list">${renderRubric()}</div>
          <button type="button" class="ghost sm" id="add-rb">+ Añadir criterio</button>

          ${correction?.submissionFile ? `
            <div class="divider"></div>
            <h3 style="font-size:0.95rem;">Entrega del opositor</h3>
            <div class="file-pill">
              <div class="icon">${ui.fileIcon(null, correction.submissionFile.contentType, correction.submissionFile.name)}</div>
              <div class="meta"><strong>${ui.esc(correction.submissionFile.name)}</strong><small>${ui.formatBytes(correction.submissionFile.size)} · entregado ${ui.esc((correction.submittedAt || "").slice(0,10))}</small></div>
              <a class="ghost sm" href="${ui.esc(correction.submissionDownloadUrl)}" target="_blank">Abrir</a>
            </div>
            ${correction.submissionNotes ? `<p class="muted text-sm mt-2">Notas: ${ui.esc(correction.submissionNotes)}</p>` : ""}
          ` : ""}

          ${correction?.status === "entregado" || correction?.status === "corregido" ? `
            <div class="divider"></div>
            <h3 style="font-size:0.95rem;">Puntuación por criterio</h3>
            <div id="score-list">
              ${rubric.map((rc) => `
                <div class="score-cell">
                  <label>${ui.esc(rc.name)} <span class="weight">peso ${rc.weight}% · sobre ${rc.max}</span>
                    <input data-score-id="${rc.id}" type="number" min="0" max="${rc.max}" step="0.1" value="${correction?.scores?.[rc.id] ?? ""}" />
                  </label>
                </div>`).join("")}
            </div>
            ${correction?.totalScore != null ? `
              <div class="score-summary mt-3">
                <div class="num ${correction.totalScore >= 7 ? "" : correction.totalScore >= 5 ? "warn" : "danger"}">${correction.totalScore}/10</div>
                <small class="muted">Nota total ponderada</small>
              </div>` : ""}
            <label class="mt-3">Feedback general<textarea name="feedback" rows="3">${ui.esc(correction?.feedback || "")}</textarea></label>
          ` : ""}
        </form>`,
      footer: footerForCorrection(correction, isNew),
    });

    function refreshRubric() {
      m.el.querySelector("#rubric-list").innerHTML = renderRubric();
      bindRubricRows();
    }
    function bindRubricRows() {
      m.el.querySelectorAll("[data-rb-del]").forEach((b) => {
        b.onclick = () => {
          rubric.splice(Number(b.dataset.rbDel), 1);
          refreshRubric();
        };
      });
      m.el.querySelectorAll("[data-rb-row]").forEach((row) => {
        const i = Number(row.dataset.rbRow);
        row.querySelector("[name=rb-name]").oninput = (e) => (rubric[i].name = e.target.value);
        row.querySelector("[name=rb-weight]").oninput = (e) => (rubric[i].weight = Number(e.target.value) || 0);
        row.querySelector("[name=rb-max]").oninput = (e) => (rubric[i].max = Number(e.target.value) || 10);
      });
    }
    bindRubricRows();

    m.el.querySelector("#add-rb").onclick = () => {
      rubric.push({ id: db_id("rb"), name: "Nuevo criterio", weight: 0, max: 10 });
      refreshRubric();
    };

    m.el.querySelector("#save-cor")?.addEventListener("click", async () => {
      const fd = new FormData(m.el.querySelector("#cor-form"));
      const data = {
        opositorId: fd.get("opositorId"),
        title: fd.get("title"),
        dueDate: fd.get("dueDate") || "",
        instructions: fd.get("instructions") || "",
        rubric,
      };
      try {
        if (isNew) await api.corrections.create(data);
        else await api.corrections.update(correction.id, data);
        ui.toast(isNew ? "Ejercicio asignado" : "Ejercicio actualizado", "success");
        m.close();
        await loadCorrections(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    });

    m.el.querySelector("#submit-score")?.addEventListener("click", async () => {
      const scores = {};
      m.el.querySelectorAll("[data-score-id]").forEach((inp) => {
        scores[inp.dataset.scoreId] = Number(inp.value) || 0;
      });
      const feedback = m.el.querySelector("[name=feedback]").value;
      try {
        await api.corrections.score(correction.id, { scores, feedback });
        ui.toast("Corrección enviada", "success");
        m.close();
        await loadCorrections(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    });

    m.el.querySelector("#reopen-cor")?.addEventListener("click", async () => {
      const feedback = m.el.querySelector("[name=feedback]")?.value || "";
      if (!confirm("¿Devolver al opositor para nueva entrega?")) return;
      try {
        await api.corrections.reopen(correction.id, { feedback });
        ui.toast("Ejercicio reabierto", "success");
        m.close();
        await loadCorrections(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    });

    m.el.querySelector("#del-cor")?.addEventListener("click", async () => {
      if (!confirm("¿Borrar el ejercicio? No se puede deshacer.")) return;
      try {
        await api.corrections.delete(correction.id);
        ui.toast("Ejercicio borrado", "success");
        m.close();
        await loadCorrections(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    });
  }

  function footerForCorrection(c, isNew) {
    if (isNew) return `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-cor">Asignar</button>`;
    if (c.status === "entregado") {
      return `<button class="ghost sm" data-close style="margin-right:auto;">Cerrar</button>
              <button class="ghost sm" id="del-cor" style="color:var(--danger);">Borrar</button>
              <button class="ghost" id="reopen-cor">Reabrir</button>
              <button class="btn" id="submit-score">Enviar corrección</button>`;
    }
    if (c.status === "corregido") {
      return `<button class="ghost sm" data-close style="margin-right:auto;">Cerrar</button>
              <button class="ghost sm" id="del-cor" style="color:var(--danger);">Borrar</button>
              <button class="ghost" id="reopen-cor">Reabrir</button>
              <button class="btn" id="submit-score">Re-puntuar</button>`;
    }
    return `<button class="ghost" data-close>Cerrar</button>
            <button class="ghost sm" id="del-cor" style="color:var(--danger);">Borrar</button>
            <button class="btn" id="save-cor">Guardar cambios</button>`;
  }

  function db_id(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }

  return {
    show: async () => {
      try { await loadDashboard(); await loadAgendaData(); await loadAvailability(); }
      catch { state.data = { opositores: [], stats: {} }; }
      render();
    },
  };
})();
