// ─────────────────────────────────────────────────────────────────────────────
// Vista del opositor — Fase 1.B completa.
//
// Pantallas:
//   dashboard   — resumen, vista semanal visual, próximos eventos, plan.
//   commitment  — proceso selectivo, horas, días activos/descanso, vacaciones.
//   profile     — foto, datos personales, contraseña.
//   plan        — vista detallada del plan con observaciones por tarea.
//   materials   — biblioteca de materiales del preparador.
//
// Vista semanal: 7 columnas (lun-dom), tareas posicionadas por día, color por
// tipo (estudio/repaso/simulacro), badge de cumplimiento (full/partial/none),
// día actual destacado, días de descanso/vacaciones marcados visualmente.
// ─────────────────────────────────────────────────────────────────────────────

const opositorView = (() => {
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  let state = { section: "dashboard", data: null };

  async function load() {
    state.data = await api.opositor.dashboard();
  }

  async function loadAgenda() {
    try {
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const end = new Date(today); end.setDate(end.getDate() + 30);
      const to = end.toISOString().slice(0, 10);
      const evs = await api.common.events(from, to);
      state.agendaEvents = evs.events || [];
    } catch { state.agendaEvents = []; }
  }

  async function loadTutoring() {
    try {
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const end = new Date(today); end.setDate(end.getDate() + 60);
      const to = end.toISOString().slice(0, 10);
      const [a, b] = await Promise.all([api.common.availability(from, to), api.common.bookings()]);
      state.slots = a.occurrences || [];
      state.bookings = b.bookings || [];
    } catch { state.slots = []; state.bookings = []; }
  }

  function avatar(user, size = "") {
    if (user?.photo) {
      return `<div class="avatar ${size}"><img src="${ui.esc(user.photo)}" alt=""></div>`;
    }
    return `<div class="avatar ${size}">${ui.esc(ui.initials(user?.name))}</div>`;
  }

  function shell(content) {
    const initials = app.currentOrg?.branding?.initials || "OP";
    return `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand-row">
            <div class="brand-mark" style="background: var(--brand); color: white;">${ui.esc(initials)}</div>
            <div><strong style="color:white;">${ui.esc(app.currentOrg?.name || "Academia")}</strong><small>Panel opositor</small></div>
          </div>
          <div class="org-badge" style="display:flex;gap:10px;align-items:center;">
            ${avatar(app.currentUser)}
            <div><strong>${ui.esc(app.currentUser.name)}</strong>Opositor</div>
          </div>
          <nav class="nav">
            <button data-section="dashboard" ${state.section === "dashboard" ? 'class="active"' : ""}>📊 Mi semana</button>
            <button data-section="plan" ${state.section === "plan" ? 'class="active"' : ""}>📅 Mi plan</button>
            <button data-section="agenda" ${state.section === "agenda" ? 'class="active"' : ""}>🗓️ Agenda</button>
            <button data-section="tutoring" ${state.section === "tutoring" ? 'class="active"' : ""}>👋 Reservar tutoría</button>
            <button data-section="commitment" ${state.section === "commitment" ? 'class="active"' : ""}>🎯 Compromiso</button>
            <button data-section="syllabus" ${state.section === "syllabus" ? 'class="active"' : ""}>📚 Mi temario</button>
            <button data-section="materials" ${state.section === "materials" ? 'class="active"' : ""}>🗂️ Materiales</button>
            <button data-section="exercises" ${state.section === "exercises" ? 'class="active"' : ""}>✏️ Mis ejercicios</button>
            <button data-section="assessments" ${state.section === "assessments" ? 'class="active"' : ""}>🎯 Mis pruebas</button>
            <button data-section="procedures" ${state.section === "procedures" ? 'class="active"' : ""}>📋 Trámites</button>
            <button data-section="chat" ${state.section === "chat" ? 'class="active"' : ""}>💬 Asistente IA</button>
            <button data-section="billing" ${state.section === "billing" ? 'class="active"' : ""}>💳 Mi suscripción</button>
            <button data-section="profile" ${state.section === "profile" ? 'class="active"' : ""}>👤 Mi perfil</button>
          </nav>
          <div class="sidebar-footer"><button class="ghost" id="logout-btn">Cerrar sesión</button></div>
        </aside>
        <main class="main">${content}</main>
      </div>`;
  }

  // ── Dashboard con vista semanal visual ──────────────────────────────────

  function dashboardSection() {
    const d = state.data;
    if (!d) return "<div class='empty-state'>Cargando...</div>";
    const c = d.profile?.commitment || {};
    const tasks = d.plan?.tasks || [];
    const totalDone = tasks.filter((t) => t.compliance === "full").length;
    const totalPartial = tasks.filter((t) => t.compliance === "partial").length;

    // Días hasta el examen
    let daysToExam = null;
    if (c.examDate) {
      const diff = Math.ceil((new Date(c.examDate) - new Date()) / (1000 * 60 * 60 * 24));
      daysToExam = diff;
    }

    return `
      <div class="section-head">
        <div><p class="eyebrow">Hoy</p><h1>Hola, ${ui.esc(d.profile.name.split(" ")[0])}</h1></div>
        <div class="row" style="gap:8px;">
          <button class="ghost sm" id="replan-btn">↻ Recalcular plan</button>
        </div>
      </div>

      <div class="grid cols-4 mb-4">
        <div class="card metric"><span class="label">Examen</span><strong style="font-size: 1.1rem;">${ui.esc(c.examName || "Sin definir")}</strong>
          <span class="muted text-xs">${ui.esc(c.examDate || "—")}${daysToExam !== null && daysToExam >= 0 ? ` · faltan ${daysToExam} días` : ""}</span>
        </div>
        <div class="card metric"><span class="label">Horas/sem</span><strong>${c.weeklyHours || 0}h</strong><span class="muted text-xs">${c.dailyHours || 0}h/día</span></div>
        <div class="card metric"><span class="label">Tareas hechas</span><strong>${totalDone}/${tasks.length}</strong>${totalPartial ? `<span class="muted text-xs">+${totalPartial} parciales</span>` : ""}</div>
        <div class="card metric"><span class="label">Mi preparador/a</span><strong style="font-size:1rem;">${ui.esc(d.preparador?.name || "Sin asignar")}</strong></div>
      </div>

      ${d.plan?.recommendation ? `
      <div class="callout mb-4">
        <div class="icon">i</div>
        <div><strong>Recomendación</strong><span>${ui.esc(d.plan.recommendation)}</span></div>
      </div>` : ""}

      <div class="card">
        <div class="row mb-2">
          <h2>Mi semana</h2>
          <small class="muted">Pulsa una tarea para registrar su cumplimiento.</small>
        </div>
        ${weekGrid(tasks, c)}
      </div>

      ${(() => {
        const ass = (d.assessments || []).slice().reverse(); // cronológico
        if (ass.length === 0) return "";
        const lineData = ass.map((a) => ({
          label: (a.date || "").slice(5),
          value: Math.round(((a.score || 0) / (a.maxScore || 10)) * 100) / 10, // sobre 10
        }));
        // Distribución por tipo
        const byType = {};
        ass.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
        const barData = Object.entries(byType).map(([label, value]) => ({ label, value }));
        return `
          <div class="grid cols-2 mt-4">
            <div class="chart-card">
              <h3>Evolución de notas</h3>
              ${ui.lineChart(lineData, { height: 160, maxValue: 10, threshold: 5 })}
              <div class="legend">
                <span><i style="background:var(--brand);"></i>nota /10</span>
                <span><i style="background:var(--ok);"></i>aprobado (5)</span>
              </div>
            </div>
            <div class="chart-card">
              <h3>Pruebas por tipo</h3>
              ${ui.barChart(barData, { height: 160 })}
              <div class="legend"><span><i style="background:var(--brand);"></i>nº pruebas</span></div>
            </div>
          </div>
        `;
      })()}
    `;
  }

  function weekGrid(tasks, commitment) {
    const tasksByDay = {};
    DIAS.forEach((d) => (tasksByDay[d] = []));
    tasks.forEach((t) => { if (tasksByDay[t.day]) tasksByDay[t.day].push(t); });

    const todayName = DIAS[(new Date().getDay() + 6) % 7]; // 0=domingo en JS
    const restDays = commitment?.restDays || [];
    const inVacation = isInVacation(commitment?.vacationRanges);

    return `<div class="week-grid">${DIAS.map((day, idx) => {
      const list = tasksByDay[day] || [];
      const isToday = day === todayName;
      const isRest = restDays.includes(day);
      const isVac = inVacation && (commitment?.activeDays || []).includes(day);
      const cls = ["week-day", isToday ? "today" : "", isRest ? "rest" : "", isVac ? "vacation" : ""].filter(Boolean).join(" ");
      return `
        <div class="${cls}">
          <h4>${day.slice(0, 3)}<strong>${day}</strong></h4>
          ${isVac ? `<div class="day-empty">🏖️ Vacaciones</div>` : ""}
          ${isRest ? `<div class="day-empty">😴 Descanso</div>` : ""}
          ${!isVac && !isRest && list.length === 0 ? `<div class="day-empty">Sin tareas</div>` : ""}
          ${list.map(taskCard).join("")}
        </div>`;
    }).join("")}</div>`;
  }

  function taskCard(t) {
    const compliance = t.compliance || (t.done ? "full" : "");
    const cls = ["task-card", (t.type || "").toLowerCase(), compliance].filter(Boolean).join(" ");
    return `
      <div class="${cls}" data-task="${t.id}">
        <div class="ttype"><span>${ui.esc(t.type)}</span><span>${t.minutes}m</span></div>
        <div class="ttitle">${ui.esc(t.title)}</div>
        ${t.notes ? `<div class="tnotes">📝 ${ui.esc(t.notes)}</div>` : ""}
        <div class="task-mark ${compliance}"></div>
      </div>`;
  }

  function isInVacation(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) return false;
    const today = new Date();
    return ranges.some((r) => r.from && r.to && new Date(r.from) <= today && today <= new Date(r.to));
  }

  // ── Compromiso completo (días, vacaciones) ──────────────────────────────

  let pendingCommitment = null; // estado en memoria mientras se edita

  function commitmentSection() {
    const c = pendingCommitment || state.data?.profile?.commitment || {};
    pendingCommitment = c;

    const activeDays = c.activeDays || [];
    const restDays = c.restDays || [];
    const vacations = c.vacationRanges || [];

    return `
      <div class="section-head">
        <div><p class="eyebrow">Mi proceso selectivo</p><h1>Compromiso de estudio</h1></div>
      </div>

      <div class="card mb-4">
        <h3>📋 Proceso selectivo</h3>
        <div class="grid cols-2 mt-3">
          <label>Nombre del examen<input id="commit-examName" value="${ui.esc(c.examName || "")}" /></label>
          <label>Fecha del examen<input id="commit-examDate" type="date" value="${ui.esc(c.examDate || "")}" /></label>
        </div>
      </div>

      <div class="card mb-4">
        <h3>⏱️ Compromiso de horas</h3>
        <div class="grid cols-2 mt-3">
          <label>Horas a la semana<input id="commit-weekly" type="number" min="0" max="80" value="${c.weeklyHours || 0}" /></label>
          <label>Horas al día (objetivo)<input id="commit-daily" type="number" min="0" max="14" step="0.5" value="${c.dailyHours || 0}" /></label>
        </div>
        <p class="help mt-2">Tu plan se distribuye automáticamente en los días activos respetando descansos y vacaciones.</p>
      </div>

      <div class="card mb-4">
        <h3>📅 Días de la semana</h3>
        <p class="muted text-sm mt-2">Marca como activo cada día en el que estudiarás. El resto se considera de descanso.</p>
        <div class="chip-row mt-3" id="active-days">
          ${DIAS.map((d) => {
            const isActive = activeDays.includes(d);
            const isRest = restDays.includes(d);
            return `<button type="button" class="chip ${isActive ? "active" : isRest ? "rest active" : ""}" data-day="${d}">${d}</button>`;
          }).join("")}
        </div>
        <p class="help mt-2">Pulsa una vez para activarlo, otra para marcarlo como descanso, otra para limpiarlo.</p>
      </div>

      <div class="card mb-4">
        <h3>🏖️ Periodos de vacaciones</h3>
        <p class="muted text-sm mt-2">Durante estos rangos no se programan tareas. El plan se readapta automáticamente.</p>
        <div id="vacations-list" class="mt-3">
          ${vacations.map((v, i) => vacationRow(v, i)).join("") || `<div class="empty-state" style="padding:20px;">Sin periodos definidos.</div>`}
        </div>
        <button class="ghost sm mt-3" id="add-vacation">+ Añadir periodo</button>
      </div>

      <div class="row mt-4">
        <span class="muted">Al guardar se recalcula tu plan respetando tareas ya completadas.</span>
        <button class="btn" id="save-commitment">Guardar compromiso</button>
      </div>
    `;
  }

  function vacationRow(v, i) {
    return `
      <div class="vacation-row" data-vac="${i}">
        <label>Desde<input type="date" data-field="from" value="${ui.esc(v.from || "")}" /></label>
        <label>Hasta<input type="date" data-field="to" value="${ui.esc(v.to || "")}" /></label>
        <button class="ghost sm" data-remove-vac="${i}">Quitar</button>
      </div>`;
  }

  // ── Mi perfil ────────────────────────────────────────────────────────────

  function profileSection() {
    const u = state.data?.profile || {};
    return `
      <div class="section-head"><div><p class="eyebrow">Mi cuenta</p><h1>Perfil</h1></div></div>
      <div class="grid cols-2">
        <div class="card">
          <h3>Foto de perfil</h3>
          <p class="muted text-sm mt-2">Aparecerá junto a tu nombre en el panel y en las comunicaciones del preparador.</p>
          <div class="row mt-4" style="justify-content: flex-start; gap: 18px;">
            ${avatar(u, "xl")}
            <div>
              <button class="btn sm" id="upload-photo-btn">Cambiar foto</button>
              <input type="file" id="photo-input" accept="image/*" style="display:none;" />
              <p class="help mt-2">JPG/PNG, hasta 5 MB.</p>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Datos personales</h3>
          <form class="form mt-3" id="profile-form">
            <label>Nombre completo<input name="name" value="${ui.esc(u.name || "")}" required /></label>
            <label>Email<input value="${ui.esc(u.email || "")}" disabled /></label>
            <label>Teléfono<input name="phone" value="${ui.esc(u.phone || "")}" /></label>
            <div class="divider"></div>
            <label>Nueva contraseña <span class="help">(deja en blanco para no cambiarla)</span><input name="password" type="password" minlength="6" /></label>
            <button class="btn" type="submit">Guardar perfil</button>
          </form>
        </div>
      </div>`;
  }

  // ── Mi plan (vista detallada con observaciones) ──────────────────────────

  function planSection() {
    const tasks = state.data?.plan?.tasks || [];
    return `
      <div class="section-head">
        <div><p class="eyebrow">Mi planificación</p><h1>Plan detallado</h1></div>
        <button class="ghost sm" id="replan-btn">↻ Recalcular</button>
      </div>
      ${tasks.length === 0 ? `<div class="empty-state"><h3>Sin plan generado</h3><p>Define tu compromiso para generar tu plan personalizado.</p></div>` : ""}
      <div class="card">
        <div class="table">
          <div class="table-row header"><span>Día</span><span>Tarea</span><span>Tipo</span><span>Cumplimiento</span><span></span></div>
          ${tasks.map((t) => {
            const compliance = t.compliance || (t.done ? "full" : "none");
            return `
            <div class="table-row">
              <span><strong>${ui.esc(t.day)}</strong><br/><small class="muted">${t.minutes} min · ${ui.esc(t.suggestedSlot || "")}</small></span>
              <span>${ui.esc(t.title)}${t.notes ? `<br/><small class="muted">📝 ${ui.esc(t.notes)}</small>` : ""}</span>
              <span><span class="pill muted">${ui.esc(t.type)}</span></span>
              <span><span class="pill ${compliance === "full" ? "success" : compliance === "partial" ? "warn" : compliance === "none" ? "danger" : "muted"}">${complianceLabel(compliance)}</span></span>
              <span class="actions"><button class="ghost sm" data-task="${t.id}">Marcar</button></span>
            </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  function complianceLabel(c) {
    return { full: "✓ Hecha", partial: "~ Parcial", none: "✗ No cumplida" }[c] || "pendiente";
  }

  // ── Materiales ──────────────────────────────────────────────────────────

  // ── Materiales (versión Fase 3 con filtros y tracking) ─────────────────

  async function loadMaterials() {
    try {
      const data = await api.materials.list();
      state.materials = data.materials || [];
      state.materialCategories = data.categories || [];
    } catch { state.materials = []; state.materialCategories = []; }
  }

  function materialsSection() {
    const cats = state.materialCategories || [];
    const mats = state.materials || [];
    const filter = state.materialsFilter || "all";
    const filtered = filter === "all" ? mats : mats.filter((m) => m.category === filter);

    return `
      <div class="section-head"><div><p class="eyebrow">Biblioteca</p><h1>Materiales</h1></div></div>
      ${mats.length === 0 ? `<div class="empty-state"><h3 class="muted">📚 Sin materiales</h3><p>Tu preparador todavía no ha compartido materiales.</p></div>` : ""}
      ${mats.length > 0 ? `
        <div class="category-bar">
          <button data-mat-cat="all" class="${filter === "all" ? "active" : ""}">Todos · ${mats.length}</button>
          ${cats.map((c) => {
            const n = mats.filter((m) => m.category === c.id).length;
            return n > 0 ? `<button data-mat-cat="${ui.esc(c.id)}" class="${filter === c.id ? "active" : ""}">${c.icon} ${ui.esc(c.label)} · ${n}</button>` : "";
          }).join("")}
        </div>
      ` : ""}
      <div class="grid cols-3">
        ${filtered.map((m) => {
          const cat = cats.find((c) => c.id === m.category);
          return `
            <div class="card">
              <p class="eyebrow">${cat ? `${cat.icon} ${ui.esc(cat.label)}` : ui.esc(m.category)}</p>
              <h3 style="font-size:0.95rem;">${ui.esc(m.title)}</h3>
              <p class="muted text-sm">${ui.esc(m.topic || "")}${m.type ? ` · ${ui.esc(m.type)}` : ""}</p>
              ${m.description ? `<p class="text-sm mt-2">${ui.esc(m.description)}</p>` : ""}
              <p class="text-xs muted mt-2">Actualizado ${ui.esc(m.updatedAt || "")}</p>
              <div class="row mt-3">
                ${m.downloadUrl
                  ? `<a class="btn sm" href="${ui.esc(m.downloadUrl)}" target="_blank" data-track-mat="${ui.esc(m.id)}">Descargar</a>`
                  : `<span class="pill muted">Sin archivo</span>`}
              </div>
            </div>`;
        }).join("") || `<div class="empty-state" style="grid-column:1/-1;">Sin materiales en esta categoría.</div>`}
      </div>
    `;
  }

  // ── Mi temario (solo lectura) ──────────────────────────────────────────

  async function loadOpoSyllabus() {
    try {
      // El opositor tiene acceso al temario de su preparador
      // Busco el temario directo desde el dashboard ya cargado y luego pido los detalles
      const dash = state.data || (await api.opositor.dashboard());
      // No tenemos la id del temario directamente; pasamos por preparador.syllabi (filtra por mi preparador)
      const list = await api.preparador.syllabi();
      const mine = list.syllabi?.[0];
      if (mine) {
        const fresh = await api.syllabi.get(mine.id);
        state.opoSyllabus = fresh.syllabus;
      } else {
        state.opoSyllabus = null;
      }
    } catch { state.opoSyllabus = null; }
  }

  function opoSyllabusSection() {
    const s = state.opoSyllabus;
    if (!s) {
      return `
        <div class="section-head"><div><p class="eyebrow">Temario</p><h1>Mi temario</h1></div></div>
        <div class="empty-state"><h3>📚 Sin temario</h3><p>Tu preparador todavía no ha publicado temario.</p></div>`;
    }
    return `
      <div class="section-head">
        <div><p class="eyebrow">${ui.esc(s.examName || "Temario oficial")}</p><h1>${ui.esc(s.title)}</h1></div>
      </div>
      ${s.description ? `<p class="muted mb-4">${ui.esc(s.description)}</p>` : ""}
      <div>
        ${(s.topics || []).map((t) => `
          <div class="topic-card">
            <div class="top">
              <div>
                <strong>${ui.esc(t.number)} · ${ui.esc(t.title)}</strong>
                <small>Bloque: ${ui.esc(t.block || "—")}</small>
                <div class="meta">
                  <span class="pill ${t.difficulty === "Alta" ? "warn" : t.difficulty === "Baja" ? "muted" : ""}">${ui.esc(t.difficulty || "Media")}</span>
                  <span class="pill ${t.priority === "Muy alta" ? "danger" : t.priority === "Alta" ? "warn" : "muted"}">${ui.esc(t.priority || "—")}</span>
                </div>
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
                  </div>`).join("")}
              </div>
            ` : ""}
          </div>
        `).join("") || `<div class="empty-state">Sin temas todavía.</div>`}
      </div>
    `;
  }

  // ── Mis ejercicios (correcciones) ──────────────────────────────────────

  async function loadExercises() {
    try {
      const data = await api.corrections.list();
      state.corrections = data.corrections || [];
    } catch { state.corrections = []; }
  }

  function exercisesSection() {
    const list = state.corrections || [];
    const buckets = {
      pendiente: list.filter((c) => c.status === "pendiente" || c.status === "reabierto"),
      entregado: list.filter((c) => c.status === "entregado"),
      corregido: list.filter((c) => c.status === "corregido"),
    };
    const labels = { pendiente: "Por entregar", entregado: "Esperando corrección", corregido: "Corregidos" };

    return `
      <div class="section-head"><div><p class="eyebrow">Trabajos asignados</p><h1>Mis ejercicios</h1></div></div>
      ${list.length === 0 ? `<div class="empty-state"><h3>✏️ Sin ejercicios</h3><p>Tu preparador todavía no te ha asignado ningún ejercicio.</p></div>` : ""}
      ${["pendiente", "entregado", "corregido"].map((s) => buckets[s].length === 0 ? "" : `
        <div class="card mb-4">
          <h3>${labels[s]} <span class="pill ${s === "pendiente" ? "warn" : s === "corregido" ? "success" : "muted"}">${buckets[s].length}</span></h3>
          <div class="event-list mt-3">
            ${buckets[s].map((c) => `
              <div class="slot-card">
                <div class="slot-when">
                  <strong>${ui.esc(c.title)}</strong>
                  <small>${c.dueDate ? `Vence ${ui.esc(c.dueDate)}` : "Sin fecha"}${c.totalScore != null ? ` · nota ${c.totalScore}/10` : ""}</small>
                </div>
                <button class="btn sm" data-exercise="${ui.esc(c.id)}">${s === "pendiente" ? "Entregar" : s === "corregido" ? "Ver corrección" : "Detalle"}</button>
              </div>`).join("")}
          </div>
        </div>`).join("")}
    `;
  }

  // ── Mis pruebas / simulacros ────────────────────────────────────────────

  async function loadAssessments() {
    try {
      const [list, types] = await Promise.all([api.assessments.list(), api.assessments.types()]);
      state.assessments = list.assessments || [];
      state.assessmentTypes = types.types || [];
    } catch { state.assessments = []; state.assessmentTypes = []; }
  }

  function assessmentsSection() {
    const types = state.assessmentTypes || [];
    const list = (state.assessments || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const filter = state.assessmentsFilter || "all";
    const filtered = filter === "all" ? list : list.filter((a) => a.type === filter);

    return `
      <div class="section-head">
        <div><p class="eyebrow">Simulacros y evaluaciones</p><h1>Mis pruebas</h1></div>
        <button class="btn" id="new-assessment-btn">+ Registrar prueba</button>
      </div>
      <div class="category-bar">
        <button data-as-cat="all" class="${filter === "all" ? "active" : ""}">Todas · ${list.length}</button>
        ${types.map((t) => {
          const n = list.filter((a) => a.type === t.id).length;
          return `<button data-as-cat="${ui.esc(t.id)}" class="${filter === t.id ? "active" : ""}">${ui.esc(t.label)} · ${n}</button>`;
        }).join("")}
      </div>
      <div class="card">
        <div class="table">
          <div class="table-row header"><span>Fecha</span><span>Prueba</span><span>Tipo</span><span>Nota</span><span></span></div>
          ${filtered.length === 0 ? `<div class="empty-state">Sin pruebas registradas en esta categoría.</div>` : ""}
          ${filtered.map((a) => `
            <div class="table-row">
              <span><strong>${ui.esc(a.date)}</strong></span>
              <span>${ui.esc(a.title)}${a.topic ? `<br/><small class="muted">${ui.esc(a.topic)}</small>` : ""}</span>
              <span><span class="pill muted">${ui.esc(typeLabel(a.type))}</span></span>
              <span><strong>${a.score != null ? `${a.score}/${a.maxScore || 10}` : "—"}</strong></span>
              <span class="actions"><button class="ghost sm" data-del-as="${ui.esc(a.id)}">Borrar</button></span>
            </div>`).join("")}
        </div>
      </div>
    `;
  }

  function typeLabel(typeId) {
    return (state.assessmentTypes || []).find((t) => t.id === typeId)?.label || typeId;
  }

  // ── Fase 4: Trámites ───────────────────────────────────────────────────

  async function loadProcedures() {
    try {
      const [list, cat] = await Promise.all([api.procedures.list(), api.procedures.catalog()]);
      state.procedures = list.procedures || [];
      state.procedureCatalog = cat.catalog || [];
    } catch { state.procedures = []; state.procedureCatalog = []; }
  }

  function proceduresSection() {
    const list = state.procedures || [];
    const buckets = {
      urgente: list.filter((p) => p.status === "urgente"),
      pendiente: list.filter((p) => p.status === "pendiente"),
      "en curso": list.filter((p) => p.status === "en curso"),
      completado: list.filter((p) => p.status === "completado"),
    };
    return `
      <div class="section-head">
        <div><p class="eyebrow">Tu carpeta administrativa</p><h1>Trámites</h1></div>
        <button class="btn" id="install-procedure-btn">+ Añadir trámite</button>
      </div>

      ${list.length === 0 ? `<div class="empty-state"><h3>📋 Sin trámites</h3><p>Añade tu primer trámite del catálogo.</p></div>` : ""}

      ${["urgente", "pendiente", "en curso", "completado"].map((s) => buckets[s].length === 0 ? "" : `
        <div class="card mb-4">
          <h3 style="text-transform:capitalize;">${s} <span class="pill ${s === "urgente" ? "danger" : s === "completado" ? "success" : s === "en curso" ? "warn" : "muted"}">${buckets[s].length}</span></h3>
          <div class="mt-3">
            ${buckets[s].map((p) => `
              <div class="procedure-row ${ui.esc((p.status || "").replace(/\\s+/g, "-"))}">
                <div class="icon-big">${ui.esc(p.icon || "📌")}</div>
                <div class="info">
                  <strong>${ui.esc(p.title)}</strong>
                  <small>${p.deadline ? `Vence ${ui.esc(p.deadline)}` : "Sin fecha"}${p.notes ? ` · ${ui.esc(p.notes)}` : ""}</small>
                </div>
                <button class="ghost sm" data-edit-procedure="${ui.esc(p.id)}">Editar</button>
              </div>`).join("")}
          </div>
        </div>`).join("")}
    `;
  }

  // ── Fase 4: Chat ───────────────────────────────────────────────────────

  async function loadChat() {
    try {
      const data = await api.chat.threads();
      state.chatThreads = data.threads || [];
      // Si hay hilos, abre el más reciente; si no, no hay hilo activo
      state.activeThread = state.chatThreads[0] || null;
    } catch { state.chatThreads = []; state.activeThread = null; }
  }

  function chatSection() {
    const threads = state.chatThreads || [];
    const active = state.activeThread;
    const enabled = state.data?.profile?.chatbotEnabled;

    if (!enabled) {
      return `
        <div class="section-head"><div><p class="eyebrow">Asistente IA</p><h1>💬 Chat con tu asistente</h1></div></div>
        <div class="empty-state">
          <h3>🔒 Asistente no activado</h3>
          <p>Tu preparador todavía no ha activado el asistente para ti. Contacta con él para que lo habilite.</p>
        </div>
      `;
    }

    return `
      <div class="section-head">
        <div><p class="eyebrow">Asistente educativo · IA</p><h1>💬 Chat</h1></div>
        <button class="btn" id="new-thread-btn">+ Nueva conversación</button>
      </div>

      <p class="muted text-sm mb-3">⚠️ Tu preparador puede ver estas conversaciones para supervisar el aprendizaje.</p>

      <div class="chat-shell">
        <div class="chat-threads">
          ${threads.length === 0 ? `<div class="empty-state" style="padding:20px;">Sin conversaciones todavía. Pulsa "Nueva conversación" para empezar.</div>` : ""}
          ${threads.map((t) => `
            <div class="thread-row ${active?.id === t.id ? "active" : ""}" data-thread="${ui.esc(t.id)}">
              <strong>${ui.esc(t.title || "Conversación")}</strong>
              <small>${(t.messages || []).length} mensajes · ${ui.esc((t.updatedAt || "").slice(0, 10))}</small>
            </div>`).join("")}
        </div>

        <div class="chat-pane">
          ${active ? `
            <div class="chat-messages" id="chat-messages">
              ${(active.messages || []).map((m) => `
                <div class="chat-bubble ${m.role}">
                  ${ui.esc(m.text)}
                  <small>${ui.esc((m.at || "").slice(11, 16))}${m.mocked ? " · respuesta simulada" : ""}</small>
                </div>`).join("")}
            </div>
            <div class="chat-input">
              <textarea id="chat-textarea" placeholder="Escribe tu mensaje (Enter para enviar)..." rows="2"></textarea>
              <button class="btn" id="send-msg-btn">Enviar</button>
            </div>
          ` : `<div class="empty-state" style="padding:60px 20px;">Crea una nueva conversación o selecciona una existente.</div>`}
        </div>
      </div>
    `;
  }

  // ── Fase 4: Suscripción ───────────────────────────────────────────────

  async function loadBilling() {
    try {
      const [planRes, sub] = await Promise.all([api.billing.plans(), api.billing.subscription()]);
      state.plans = planRes.plans || [];
      state.currentSub = sub.subscription;
      state.currentPlan = sub.plan;
    } catch { state.plans = []; state.currentSub = null; }
  }

  function billingSection() {
    const plans = (state.plans || []).filter((p) => p.scope === "global"); // muestra los globales
    const current = state.currentPlan;
    const sub = state.currentSub;
    return `
      <div class="section-head">
        <div><p class="eyebrow">Plan y facturación</p><h1>Mi suscripción</h1></div>
      </div>

      ${current ? `
        <div class="card mb-4">
          <div class="row" style="justify-content:space-between;">
            <div>
              <p class="eyebrow">Plan actual</p>
              <h2>${ui.esc(current.name)}</h2>
              <p class="muted">${ui.esc(current.description || "")}</p>
              <p class="text-sm mt-2">${sub.amount ? `${sub.amount}€/mes · ` : ""}Renovación ${ui.esc(sub.renewalDate || "—")} · ${ui.esc(sub.provider || "")}</p>
            </div>
            <div>
              <button class="ghost sm" id="cancel-sub-btn">Cancelar suscripción</button>
            </div>
          </div>
        </div>
      ` : ""}

      <h2>Cambiar de plan</h2>
      <div class="grid cols-3 mt-3">
        ${plans.map((p) => `
          <div class="plan-card ${current?.id === p.id ? "current" : ""}">
            <p class="eyebrow">${current?.id === p.id ? "✓ Tu plan actual" : ""}&nbsp;</p>
            <h3>${ui.esc(p.name)}</h3>
            <div class="price">${p.priceMonthly || 0}€<small> /mes</small></div>
            <p class="muted text-sm">${ui.esc(p.description || "")}</p>
            <ul class="features">
              ${(p.features || []).map((f) => `<li>${ui.esc(f)}</li>`).join("")}
            </ul>
            ${current?.id === p.id
              ? `<button class="ghost" disabled>Plan actual</button>`
              : `<button class="btn" data-select-plan="${ui.esc(p.id)}">Seleccionar</button>`}
          </div>
        `).join("") || `<div class="empty-state" style="grid-column:1/-1;">Sin planes disponibles.</div>`}
      </div>
    `;
  }

  // ── Agenda ───────────────────────────────────────────────────────────────

  function agendaSection() {
    const events = state.agendaEvents || [];
    return `
      <div class="section-head">
        <div><p class="eyebrow">Calendario</p><h1>Mi agenda</h1></div>
      </div>
      <div class="grid" style="grid-template-columns: 2.2fr 1fr; gap: 16px;">
        <div id="cal-mount"></div>
        <div>
          <div class="card">
            <h3>Próximos eventos</h3>
            <div class="event-list mt-3">
              ${events.length === 0 ? `<div class="empty-state" style="padding:18px;">Sin eventos en los próximos 30 días.</div>` : ""}
              ${events.slice(0, 8).map(eventRowReadOnly).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function eventRowReadOnly(e) {
    const date = e.occurrenceDate || e.date;
    const day = date ? new Date(date + "T00:00:00").getDate() : "";
    const monthShort = date ? new Date(date + "T00:00:00").toLocaleDateString("es-ES", { month: "short" }) : "";
    const cls = ["event-row", (e.type || "").toLowerCase()].filter(Boolean).join(" ");
    return `
      <div class="${cls}">
        <div class="when">${ui.esc(monthShort)}<strong>${day}</strong>${e.time ? `<small>${ui.esc(e.time)}</small>` : ""}</div>
        <div>
          <strong>${ui.esc(e.title)}</strong>
          <small class="muted" style="display:block;">${ui.esc(e.type || "")}</small>
        </div>
        <div></div>
      </div>`;
  }

  // ── Reservar tutoría ─────────────────────────────────────────────────────

  function tutoringSection() {
    const free = (state.slots || []).filter((s) => !s.booked);
    const grouped = {};
    for (const s of free) {
      if (!grouped[s.date]) grouped[s.date] = [];
      grouped[s.date].push(s);
    }
    const myUpcoming = (state.bookings || []).filter(
      (b) => b.status === "confirmed" && b.date >= new Date().toISOString().slice(0, 10)
    );

    return `
      <div class="section-head">
        <div><p class="eyebrow">Tutorías con mi preparador</p><h1>Reservar tutoría</h1></div>
      </div>

      ${myUpcoming.length > 0 ? `
        <div class="card mb-4">
          <h3>Mis próximas tutorías <span class="pill muted">${myUpcoming.length}</span></h3>
          <div class="event-list mt-3">
            ${myUpcoming.map((b) => `
              <div class="slot-card">
                <div class="slot-when">
                  <strong>${ui.esc(formatLongDate(b.date))} · ${ui.esc(b.time)}</strong>
                  <small>${b.durationMin || 60} min con ${ui.esc(state.data?.preparador?.name || "tu preparador")}</small>
                </div>
                <button class="ghost sm" data-cancel-booking="${ui.esc(b.id)}">Cancelar</button>
              </div>`).join("")}
          </div>
        </div>` : ""}

      <div class="card">
        <h3>Huecos disponibles</h3>
        <p class="muted text-sm mb-4">${free.length === 0 ? "Tu preparador todavía no ha publicado huecos disponibles." : "Pulsa en uno de los huecos para reservarlo."}</p>
        ${Object.entries(grouped).map(([date, slots]) => `
          <div class="mb-4">
            <p class="eyebrow" style="margin-bottom: 6px;">${ui.esc(formatLongDate(date))}</p>
            <div class="event-list">
              ${slots.map((s) => `
                <div class="slot-card">
                  <div class="slot-when">
                    <strong>${ui.esc(s.time)}</strong>
                    <small>${s.durationMin || 60} minutos</small>
                  </div>
                  <button class="btn sm" data-book-slot="${ui.esc(s.id)}" data-book-date="${ui.esc(s.date)}" data-book-time="${ui.esc(s.time)}">Reservar</button>
                </div>`).join("")}
            </div>
          </div>`).join("")}
      </div>
    `;
  }

  function formatLongDate(d) {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  }

  // ── Render + bindings ───────────────────────────────────────────────────

  function render() {
    let content;
    if (state.section === "dashboard") content = dashboardSection();
    else if (state.section === "commitment") content = commitmentSection();
    else if (state.section === "profile") content = profileSection();
    else if (state.section === "plan") content = planSection();
    else if (state.section === "materials") content = materialsSection();
    else if (state.section === "agenda") content = agendaSection();
    else if (state.section === "tutoring") content = tutoringSection();
    else if (state.section === "syllabus") content = opoSyllabusSection();
    else if (state.section === "exercises") content = exercisesSection();
    else if (state.section === "assessments") content = assessmentsSection();
    else if (state.section === "procedures") content = proceduresSection();
    else if (state.section === "chat") content = chatSection();
    else if (state.section === "billing") content = billingSection();

    ui.root().innerHTML = shell(content);
    bind();

    if (state.section === "agenda") mountCalendar();
  }

  async function mountCalendar() {
    const mount = document.getElementById("cal-mount");
    if (!mount) return;
    const cal = calendarComponent({
      getEvents: (from, to) => api.common.events(from, to),
      onEventClick: (ev) => {
        if (!ev) return;
        ui.modal({
          title: ev.title,
          body: `
            <p class="muted text-sm">${ui.esc(formatLongDate(ev.occurrenceDate || ev.date))} · ${ui.esc(ev.time || "")}</p>
            <p><span class="pill muted">${ui.esc(ev.type || "evento")}</span></p>
            ${ev.description ? `<p class="mt-3">${ui.esc(ev.description)}</p>` : ""}
          `,
          footer: `<button class="btn" data-close>Cerrar</button>`,
        });
      },
    });
    mount.innerHTML = await cal.init();
    cal.bind(mount.firstElementChild);
  }

  function bind() {
    document.querySelectorAll("[data-section]").forEach((b) => {
      b.onclick = async () => {
        if (state.section === "commitment") pendingCommitment = null;
        state.section = b.dataset.section;
        if (state.section === "agenda") await loadAgenda();
        else if (state.section === "tutoring") await loadTutoring();
        else if (state.section === "materials") await loadMaterials();
        else if (state.section === "syllabus") await loadOpoSyllabus();
        else if (state.section === "exercises") await loadExercises();
        else if (state.section === "assessments") await loadAssessments();
        else if (state.section === "procedures") await loadProcedures();
        else if (state.section === "chat") await loadChat();
        else if (state.section === "billing") await loadBilling();
        render();
      };
    });
    document.getElementById("logout-btn").onclick = () => app.logout();

    // Recalcular plan
    const replan = document.getElementById("replan-btn");
    if (replan) replan.onclick = async () => {
      try {
        await api.opositor.replan({ preserveDone: true });
        ui.toast("Plan recalculado", "success");
        await refresh();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };

    // Click en tarea (semana o tabla) → modal de cumplimiento
    document.querySelectorAll("[data-task]").forEach((el) => {
      el.onclick = () => openTaskModal(el.dataset.task);
    });

    // Reservar hueco
    document.querySelectorAll("[data-book-slot]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Reservar este hueco?")) return;
        try {
          await api.common.createBooking({
            availabilityId: b.dataset.bookSlot,
            date: b.dataset.bookDate,
            time: b.dataset.bookTime,
          });
          ui.toast("Tutoría reservada · te llegará un recordatorio por email", "success");
          await loadTutoring();
          render();
        } catch (e) {
          ui.toast(e.error === "already_booked" ? "Ese hueco ya está reservado" : (e.error || "Error"), "error");
        }
      };
    });

    // Cancelar reserva
    document.querySelectorAll("[data-cancel-booking]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Cancelar la tutoría?")) return;
        try {
          await api.common.cancelBooking(b.dataset.cancelBooking);
          ui.toast("Reserva cancelada", "success");
          await loadTutoring();
          render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });

    // ── Materiales: filtros y tracking de descargas ────────────────────────
    document.querySelectorAll("[data-mat-cat]").forEach((b) => {
      b.onclick = () => { state.materialsFilter = b.dataset.matCat; render(); };
    });
    document.querySelectorAll("[data-track-mat]").forEach((a) => {
      // No usamos preventDefault: queremos que el link descargue normalmente
      a.addEventListener("click", () => {
        api.materials.trackDownload(a.dataset.trackMat).catch(() => {});
      });
    });

    // ── Mis ejercicios (correcciones) ──────────────────────────────────────
    document.querySelectorAll("[data-exercise]").forEach((b) => {
      b.onclick = () => {
        const c = (state.corrections || []).find((x) => x.id === b.dataset.exercise);
        if (c) openExerciseModal(c);
      };
    });

    // ── Mis pruebas ────────────────────────────────────────────────────────
    document.getElementById("new-assessment-btn")?.addEventListener("click", openAssessmentModal);
    document.querySelectorAll("[data-as-cat]").forEach((b) => {
      b.onclick = () => { state.assessmentsFilter = b.dataset.asCat; render(); };
    });
    document.querySelectorAll("[data-del-as]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Borrar esta prueba? No se puede deshacer.")) return;
        try {
          await api.assessments.delete(b.dataset.delAs);
          ui.toast("Prueba borrada", "success");
          await loadAssessments(); render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });

    // ── Trámites ───────────────────────────────────────────────────────────
    document.getElementById("install-procedure-btn")?.addEventListener("click", openInstallProcedureModal);
    document.querySelectorAll("[data-edit-procedure]").forEach((b) => {
      b.onclick = () => {
        const p = (state.procedures || []).find((x) => x.id === b.dataset.editProcedure);
        if (p) openProcedureModal(p);
      };
    });

    // ── Chat ───────────────────────────────────────────────────────────────
    document.getElementById("new-thread-btn")?.addEventListener("click", async () => {
      try {
        const r = await api.chat.createThread();
        await loadChat();
        state.activeThread = r.thread;
        render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    });
    document.querySelectorAll("[data-thread]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.thread;
        const fresh = await api.chat.thread(id);
        state.activeThread = fresh.thread;
        render();
      };
    });
    const sendBtn = document.getElementById("send-msg-btn");
    const ta = document.getElementById("chat-textarea");
    if (sendBtn && ta) {
      const send = async () => {
        const text = ta.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        ta.disabled = true;
        try {
          const r = await api.chat.sendMessage(state.activeThread.id, text);
          // Refrescar el hilo
          const fresh = await api.chat.thread(state.activeThread.id);
          state.activeThread = fresh.thread;
          // Recargar lista para actualizar título y orden
          const all = await api.chat.threads();
          state.chatThreads = all.threads || [];
          render();
        } catch (e) {
          ui.toast(e.error === "chatbot_not_enabled" ? "El asistente está deshabilitado" : (e.error || "Error"), "error");
          sendBtn.disabled = false;
          ta.disabled = false;
        }
      };
      sendBtn.onclick = send;
      ta.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      };
      // Auto-scroll al final
      const msgs = document.getElementById("chat-messages");
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    // ── Suscripción ────────────────────────────────────────────────────────
    document.querySelectorAll("[data-select-plan]").forEach((b) => {
      b.onclick = async () => {
        const planId = b.dataset.selectPlan;
        try {
          const r = await api.billing.checkout(planId);
          if (r.mocked) {
            // En modo mock, simulamos la confirmación inmediata
            await api.billing.confirm({ planId, mock: true });
            ui.toast("Suscripción activada (modo demo)", "success");
            await loadBilling(); render();
          } else {
            // En modo real, redirigimos a Stripe Checkout
            window.location.href = r.url;
          }
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });
    document.getElementById("cancel-sub-btn")?.addEventListener("click", async () => {
      if (!confirm("¿Cancelar tu suscripción? Mantendrás el acceso hasta el final del periodo facturado.")) return;
      try {
        await api.billing.cancel();
        ui.toast("Suscripción cancelada", "success");
        await loadBilling(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    });

    // Compromiso
    bindCommitment();

    // Perfil
    bindProfile();
  }

  function bindCommitment() {
    const save = document.getElementById("save-commitment");
    if (!save) return;

    // Toggles de día (3-estados: activo → descanso → vacío)
    document.querySelectorAll("#active-days .chip").forEach((chip) => {
      chip.onclick = () => {
        const day = chip.dataset.day;
        const c = pendingCommitment;
        c.activeDays = c.activeDays || [];
        c.restDays = c.restDays || [];
        const isActive = c.activeDays.includes(day);
        const isRest = c.restDays.includes(day);
        if (!isActive && !isRest) {
          c.activeDays.push(day);
          c.restDays = c.restDays.filter((d) => d !== day);
        } else if (isActive) {
          c.activeDays = c.activeDays.filter((d) => d !== day);
          c.restDays.push(day);
        } else {
          c.restDays = c.restDays.filter((d) => d !== day);
        }
        render();
      };
    });

    // Vacaciones: añadir
    const addVac = document.getElementById("add-vacation");
    if (addVac) addVac.onclick = () => {
      pendingCommitment.vacationRanges = pendingCommitment.vacationRanges || [];
      pendingCommitment.vacationRanges.push({ from: "", to: "" });
      render();
    };

    // Vacaciones: cambios en cada fila
    document.querySelectorAll("[data-vac]").forEach((row) => {
      const idx = Number(row.dataset.vac);
      row.querySelectorAll("[data-field]").forEach((inp) => {
        inp.oninput = () => {
          pendingCommitment.vacationRanges[idx][inp.dataset.field] = inp.value;
        };
      });
    });

    // Vacaciones: quitar
    document.querySelectorAll("[data-remove-vac]").forEach((b) => {
      b.onclick = () => {
        // Sincronizar valores antes de borrar (los oninput no han disparado para el último cambio si vino del DOM directo)
        document.querySelectorAll("[data-vac]").forEach((row) => {
          const i = Number(row.dataset.vac);
          row.querySelectorAll("[data-field]").forEach((inp) => {
            pendingCommitment.vacationRanges[i][inp.dataset.field] = inp.value;
          });
        });
        const idx = Number(b.dataset.removeVac);
        pendingCommitment.vacationRanges.splice(idx, 1);
        render();
      };
    });

    // Guardar
    save.onclick = async () => {
      const c = pendingCommitment;
      const data = {
        examName: document.getElementById("commit-examName").value,
        examDate: document.getElementById("commit-examDate").value,
        weeklyHours: Number(document.getElementById("commit-weekly").value) || 0,
        dailyHours: Number(document.getElementById("commit-daily").value) || 0,
        activeDays: c.activeDays || [],
        restDays: c.restDays || [],
        vacationRanges: (c.vacationRanges || []).filter((v) => v.from && v.to),
      };
      try {
        await api.opositor.updateCommitment(data);
        ui.toast("Compromiso guardado · plan recalculado", "success");
        pendingCommitment = null;
        await refresh();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };
  }

  function bindProfile() {
    const photoBtn = document.getElementById("upload-photo-btn");
    const photoInput = document.getElementById("photo-input");
    if (photoBtn && photoInput) {
      photoBtn.onclick = () => photoInput.click();
      photoInput.onchange = async () => {
        const file = photoInput.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return ui.toast("La imagen excede 5 MB", "error");
        try {
          const up = await api.files.upload(file, "photo");
          await api.opositor.setPhoto(up.file.id);
          ui.toast("Foto actualizada", "success");
          await refresh();
        } catch (err) { ui.toast(err.error || "Error al subir", "error"); }
      };
    }

    const form = document.getElementById("profile-form");
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = { name: fd.get("name"), phone: fd.get("phone") };
      const password = fd.get("password");
      if (password) data.password = password;
      try {
        await api.opositor.updateProfile(data);
        ui.toast("Perfil actualizado", "success");
        await refresh();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };
  }

  function openTaskModal(taskId) {
    const plan = state.data?.plan;
    if (!plan) return;
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const compliance = task.compliance || (task.done ? "full" : "");
    const observations = task.observations || [];

    const m = ui.modal({
      title: task.title,
      body: `
        <p class="muted text-sm">${ui.esc(task.day)} · ${ui.esc(task.type)} · ${task.minutes} min</p>
        <div class="divider"></div>
        <h3 style="font-size:0.95rem;">¿Cómo te ha ido?</h3>
        <div class="chip-row mt-2" id="task-compliance">
          <button type="button" class="chip ${compliance === "full" ? "active" : ""}" data-c="full">✓ Hecha completa</button>
          <button type="button" class="chip ${compliance === "partial" ? "active" : ""}" data-c="partial">~ Parcial</button>
          <button type="button" class="chip ${compliance === "none" ? "active" : ""}" data-c="none">✗ No cumplida</button>
        </div>
        <label class="mt-4">Observación (para el repaso de 2ª y 3ª vuelta)
          <textarea id="task-notes" rows="3" placeholder="Qué he aprendido / qué me ha costado / qué repasar...">${ui.esc(task.notes || "")}</textarea>
        </label>
        ${observations.length > 0 ? `
          <div class="divider"></div>
          <h3 style="font-size:0.92rem;">Histórico de observaciones</h3>
          <div class="text-sm mt-2">
            ${observations.slice().reverse().map((o) => `
              <div style="padding:8px 12px;background:var(--bg-soft);border-radius:8px;margin-bottom:6px;">
                <small class="muted">${ui.esc(o.at?.slice(0, 10))} · ${complianceLabel(o.compliance)}</small><br/>
                ${ui.esc(o.text)}
              </div>`).join("")}
          </div>` : ""}
      `,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-task">Guardar</button>`,
    });

    let chosen = compliance;
    m.el.querySelectorAll("[data-c]").forEach((b) => {
      b.onclick = () => {
        m.el.querySelectorAll("[data-c]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        chosen = b.dataset.c;
      };
    });
    m.el.querySelector("#save-task").onclick = async () => {
      const notes = m.el.querySelector("#task-notes").value;
      try {
        await api.opositor.updateTask(plan.id, task.id, { compliance: chosen || "full", notes });
        ui.toast("Tarea actualizada", "success");
        m.close();
        await refresh();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };
  }

  async function refresh() {
    await load();
    render();
  }

  // ── Modales Fase 3 (opositor) ──────────────────────────────────────────

  function openExerciseModal(c) {
    let uploadedFileId = null;
    let uploadedFileName = null;
    const canSubmit = c.status === "pendiente" || c.status === "reabierto";
    const isCorrected = c.status === "corregido";

    const m = ui.modal({
      title: c.title,
      body: `
        <p class="muted text-sm">${c.dueDate ? `Fecha límite: <strong>${ui.esc(c.dueDate)}</strong>` : "Sin fecha límite"}</p>
        ${c.instructions ? `<div class="mt-3"><h3 style="font-size:0.95rem;">Instrucciones</h3><p>${ui.esc(c.instructions)}</p></div>` : ""}

        <div class="divider"></div>
        <h3 style="font-size:0.95rem;">Rúbrica de evaluación</h3>
        <p class="help">Tu preparador puntuará cada criterio. La nota total se calcula sobre 10.</p>
        <div>
          ${(c.rubric || []).map((rc) => `
            <div class="rubric-row" style="grid-template-columns: 2fr 80px 80px;">
              <div><strong>${ui.esc(rc.name)}</strong>${rc.description ? `<br/><small class="muted">${ui.esc(rc.description)}</small>` : ""}</div>
              <div style="text-align:center;"><small class="muted">peso</small><br/><strong>${rc.weight}%</strong></div>
              <div style="text-align:center;"><small class="muted">sobre</small><br/><strong>${rc.max}</strong></div>
            </div>`).join("")}
        </div>

        ${canSubmit ? `
          <div class="divider"></div>
          <h3 style="font-size:0.95rem;">Tu entrega</h3>
          ${c.submissionFile ? `
            <p class="muted text-sm mb-2">Entrega anterior:</p>
            <div class="file-pill">
              <div class="icon">${ui.fileIcon(null, c.submissionFile.contentType, c.submissionFile.name)}</div>
              <div class="meta"><strong>${ui.esc(c.submissionFile.name)}</strong><small>${ui.formatBytes(c.submissionFile.size)}</small></div>
              <a class="ghost sm" href="${ui.esc(c.submissionDownloadUrl)}" target="_blank">Abrir</a>
            </div>
            <p class="help mt-2">Si subes un archivo nuevo, sustituirá al anterior.</p>
          ` : ""}
          <div id="ex-dz" class="mt-2"></div>
          <label class="mt-3">Notas para tu preparador (opcional)
            <textarea name="notes" rows="3"></textarea>
          </label>
        ` : ""}

        ${c.submissionFile && !canSubmit ? `
          <div class="divider"></div>
          <h3 style="font-size:0.95rem;">Tu entrega</h3>
          <div class="file-pill">
            <div class="icon">${ui.fileIcon(null, c.submissionFile.contentType, c.submissionFile.name)}</div>
            <div class="meta"><strong>${ui.esc(c.submissionFile.name)}</strong><small>${ui.formatBytes(c.submissionFile.size)} · entregado ${ui.esc((c.submittedAt || "").slice(0,10))}</small></div>
            <a class="ghost sm" href="${ui.esc(c.submissionDownloadUrl)}" target="_blank">Abrir</a>
          </div>
          ${c.submissionNotes ? `<p class="muted text-sm mt-2">Tus notas: ${ui.esc(c.submissionNotes)}</p>` : ""}
        ` : ""}

        ${isCorrected ? `
          <div class="divider"></div>
          <h3 style="font-size:0.95rem;">Resultado de la corrección</h3>
          <div>
            ${(c.rubric || []).map((rc) => {
              const score = c.scores?.[rc.id] ?? 0;
              return `
                <div class="score-cell">
                  <label>
                    <strong>${ui.esc(rc.name)}</strong> <span class="weight">peso ${rc.weight}% · sobre ${rc.max}</span>
                  </label>
                  <strong style="font-size:1.05rem; text-align:center;">${score}/${rc.max}</strong>
                </div>`;
            }).join("")}
          </div>
          ${c.totalScore != null ? `
            <div class="score-summary mt-3">
              <div class="num ${c.totalScore >= 7 ? "" : c.totalScore >= 5 ? "warn" : "danger"}">${c.totalScore}/10</div>
              <small class="muted">Nota total ponderada</small>
            </div>` : ""}
          ${c.feedback ? `
            <div class="mt-3">
              <p class="eyebrow">Feedback de tu preparador</p>
              <p>${ui.esc(c.feedback)}</p>
            </div>` : ""}
        ` : ""}

        ${c.status === "entregado" ? `
          <div class="divider"></div>
          <p class="muted text-sm" style="text-align:center;padding:14px;background:var(--bg-soft);border-radius:8px;">
            ⏳ Entregado. Esperando corrección de tu preparador.
          </p>
        ` : ""}
      `,
      footer: canSubmit
        ? `<button class="ghost" data-close>Cancelar</button><button class="btn" id="submit-ex" disabled>Entregar</button>`
        : `<button class="btn" data-close>Cerrar</button>`,
    });

    if (canSubmit) {
      const dz = ui.dropzone({
        hint: "Arrastra tu entrega aquí o pulsa para seleccionar",
        help: "PDF, audio, vídeo, imagen, documento (hasta 50 MB)",
        accept: ".pdf,audio/*,video/*,image/*,.doc,.docx,.txt",
        onUpload: (file) => api.files.upload(file, "correction"),
        onComplete: (result) => {
          if (result?.file?.id) {
            uploadedFileId = result.file.id;
            uploadedFileName = result.file.originalName;
            const btn = m.el.querySelector("#submit-ex");
            if (btn) btn.disabled = false;
          }
        },
      });
      m.el.querySelector("#ex-dz").innerHTML = dz.html();
      dz.bind(m.el.querySelector("[data-dz]"));

      m.el.querySelector("#submit-ex").onclick = async () => {
        if (!uploadedFileId) return ui.toast("Sube un archivo antes de entregar", "error");
        const notes = m.el.querySelector("[name=notes]").value;
        try {
          await api.corrections.submit(c.id, { fileId: uploadedFileId, notes });
          ui.toast("Ejercicio entregado", "success");
          m.close();
          await loadExercises(); render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    }
  }

  function openAssessmentModal() {
    const types = state.assessmentTypes || [];
    const m = ui.modal({
      title: "Registrar prueba",
      body: `
        <form class="form" id="as-form">
          <div class="grid cols-2">
            <label>Tipo de prueba
              <select name="type" required>
                ${types.map((t) => `<option value="${t.id}">${ui.esc(t.label)}</option>`).join("")}
              </select>
            </label>
            <label>Fecha<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
          </div>
          <label>Título<input name="title" required placeholder="ej. Simulacro Tema 5" /></label>
          <label>Tema relacionado<input name="topic" placeholder="ej. Constitución Española" /></label>
          <div class="grid cols-2">
            <label>Nota obtenida<input name="score" type="number" step="0.1" min="0" placeholder="ej. 7.5" /></label>
            <label>Sobre<input name="maxScore" type="number" min="1" value="10" /></label>
          </div>
          <label>Duración (min)<input name="durationMin" type="number" min="0" placeholder="opcional" /></label>
          <label>Notas<textarea name="notes" rows="3" placeholder="Observaciones, errores frecuentes…"></textarea></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-as">Registrar</button>`,
    });
    m.el.querySelector("#save-as").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#as-form"));
      const data = {
        type: fd.get("type"),
        title: fd.get("title"),
        topic: fd.get("topic") || "",
        date: fd.get("date"),
        score: fd.get("score") !== "" ? Number(fd.get("score")) : null,
        maxScore: Number(fd.get("maxScore")) || 10,
        durationMin: fd.get("durationMin") ? Number(fd.get("durationMin")) : 0,
        notes: fd.get("notes") || "",
      };
      try {
        await api.assessments.create(data);
        ui.toast("Prueba registrada", "success");
        m.close();
        await loadAssessments(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    };
  }

  // ── Modales de trámites (Fase 4) ───────────────────────────────────────

  function openInstallProcedureModal() {
    const cat = state.procedureCatalog || [];
    const installed = new Set((state.procedures || []).map((p) => p.code).filter(Boolean));
    const m = ui.modal({
      title: "Añadir trámite del catálogo",
      body: `
        <p class="muted text-sm mb-3">Selecciona un trámite del catálogo predefinido o crea uno personalizado.</p>
        <div class="grid cols-2" style="gap:8px;">
          ${cat.map((t) => `
            <button type="button" class="topic-card" data-install="${ui.esc(t.code)}" style="text-align:left;cursor:pointer;${installed.has(t.code) ? "opacity:0.5;pointer-events:none;" : ""}">
              <div class="top">
                <div>
                  <strong>${ui.esc(t.icon)} ${ui.esc(t.title)}</strong>
                  <small>${ui.esc(t.description)}</small>
                </div>
              </div>
              ${installed.has(t.code) ? `<span class="pill success">✓ Ya añadido</span>` : ""}
            </button>`).join("")}
        </div>
        <div class="divider"></div>
        <button class="ghost" id="custom-procedure-btn">+ Crear trámite personalizado</button>`,
      footer: `<button class="ghost" data-close>Cerrar</button>`,
    });
    m.el.querySelectorAll("[data-install]").forEach((b) => {
      b.onclick = async () => {
        try {
          await api.procedures.install({ code: b.dataset.install });
          ui.toast("Trámite añadido", "success");
          m.close();
          await loadProcedures(); render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      };
    });
    m.el.querySelector("#custom-procedure-btn").onclick = () => {
      m.close();
      openProcedureModal(null, /* custom */ true);
    };
  }

  function openProcedureModal(p, isCustom = false) {
    const isNew = !p;
    const states = ["pendiente", "en curso", "completado", "urgente"];
    const m = ui.modal({
      title: isNew ? "Nuevo trámite" : `Editar ${p.title}`,
      body: `
        <form class="form" id="proc-form">
          <label>Título<input name="title" required value="${ui.esc(p?.title || "")}" /></label>
          <label>Descripción<textarea name="description" rows="2">${ui.esc(p?.description || "")}</textarea></label>
          <div class="grid cols-2">
            <label>Estado
              <select name="status">
                ${states.map((s) => `<option value="${s}" ${(p?.status || "pendiente") === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </label>
            <label>Fecha límite<input name="deadline" type="date" value="${ui.esc(p?.deadline || "")}" /></label>
          </div>
          <label>Notas<textarea name="notes" rows="2">${ui.esc(p?.notes || "")}</textarea></label>
        </form>`,
      footer: isNew
        ? `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-proc">Crear</button>`
        : `<button class="ghost sm" data-close style="margin-right:auto;">Cerrar</button>
           <button class="ghost sm" id="del-proc" style="color:var(--danger);">Borrar</button>
           <button class="btn" id="save-proc">Guardar</button>`,
    });
    m.el.querySelector("#save-proc").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#proc-form"));
      const data = {
        title: fd.get("title"),
        description: fd.get("description"),
        status: fd.get("status"),
        deadline: fd.get("deadline") || "",
        notes: fd.get("notes") || "",
      };
      try {
        if (isNew) await api.procedures.create(data);
        else await api.procedures.update(p.id, data);
        ui.toast(isNew ? "Trámite creado" : "Trámite actualizado", "success");
        m.close();
        await loadProcedures(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    };
    m.el.querySelector("#del-proc")?.addEventListener("click", async () => {
      if (!confirm("¿Borrar el trámite?")) return;
      try {
        await api.procedures.delete(p.id);
        ui.toast("Trámite borrado", "success");
        m.close();
        await loadProcedures(); render();
      } catch (e) { ui.toast(e.error || "Error", "error"); }
    });
  }

  return {
    show: async () => {
      try { await load(); }
      catch { state.data = { profile: { commitment: {} }, plan: { tasks: [] }, materials: [] }; }
      render();
    },
  };
})();
