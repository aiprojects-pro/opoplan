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
    // Si el plan existe pero no tiene los campos de la planificación mejorada
    // (weeksUntilExam, feasibility, topicTitle...), forzamos un replan para
    // que el opositor vea el widget visual con datos completos. Esto solo
    // afecta a planes generados antes de la mejora.
    const plan = state.data?.plan;
    const hasNewFields = plan && (plan.weeksUntilExam !== undefined || (plan.tasks || []).some((t) => t.topicTitle));
    if (plan && plan.tasks && plan.tasks.length && !hasNewFields) {
      try {
        const r = await api.opositor.replan({ preserveDone: true });
        if (r?.plan) state.data.plan = r.plan;
      } catch { /* silencioso, no bloqueamos arranque */ }
    }
  }

  async function loadAgenda() {
    try {
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const end = new Date(today); end.setDate(end.getDate() + 30);
      const to = end.toISOString().slice(0, 10);
      const [evs, av] = await Promise.all([
        api.common.events(from, to),
        api.common.availability(from, to).catch(() => ({ occurrences: [] })),
      ]);
      state.agendaEvents = evs.events || [];
      state.agendaSlots = (av.occurrences || []).filter((s) => !s.booked);
    } catch { state.agendaEvents = []; state.agendaSlots = []; }
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
            <button data-section="syllabus" ${state.section === "syllabus" ? 'class="active"' : ""}>📚 Mi temario</button>
            <button data-section="materials" ${state.section === "materials" ? 'class="active"' : ""}>🗂️ Materiales</button>
            <button data-section="exercises" ${state.section === "exercises" ? 'class="active"' : ""}>✏️ Mis ejercicios</button>
            <button data-section="assessments" ${state.section === "assessments" ? 'class="active"' : ""}>🎯 Mis pruebas</button>
            <button data-section="procedures" ${state.section === "procedures" ? 'class="active"' : ""}>📋 Trámites</button>
            <button data-section="chat" ${state.section === "chat" ? 'class="active"' : ""}>💬 Asistente IA</button>
            <button data-section="tools" ${state.section === "tools" ? 'class="active"' : ""}>🧠 Herramientas IA</button>
            <button data-section="challenges" ${state.section === "challenges" ? 'class="active"' : ""}>🏆 Retos</button>
            <button data-section="profile" ${state.section === "profile" ? 'class="active"' : ""}>👤 Mi perfil</button>
            <button data-section="billing" ${state.section === "billing" ? 'class="active"' : ""}>💳 Mi suscripción</button>
            <button data-section="invoices" ${state.section === "invoices" ? 'class="active"' : ""}>🧾 Mis facturas</button>
            <button data-section="commitment" ${state.section === "commitment" ? 'class="active"' : ""}>🎯 Compromiso</button>
            <button data-section="predictor" ${state.section === "predictor" ? 'class="active"' : ""}>🔮 Predictor</button>
            <button data-section="wellbeing" ${state.section === "wellbeing" ? 'class="active"' : ""}>🧘 Bienestar</button>
            <button data-section="simulacro" ${state.section === "simulacro" ? 'class="active"' : ""}>🧪 Simulacro avanzado</button>
            <button data-section="community" ${state.section === "community" ? 'class="active"' : ""}>👥 Comunidad</button>
            <button data-section="certs" ${state.section === "certs" ? 'class="active"' : ""}>🎖️ Mis certificaciones</button>
            <button data-section="nps" ${state.section === "nps" ? 'class="active"' : ""}>📝 Encuesta</button>
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
    const me = app.currentUser || {};
    const ai = me.ai || {};
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
            <label>Teléfono<input name="phone" value="${ui.esc(u.phone || me.phone || "")}" /></label>
            <label>WhatsApp<input name="whatsapp" value="${ui.esc(me.whatsapp || "")}" placeholder="+34 600 000 000" /></label>
            <label class="text-sm"><input type="checkbox" name="whatsappOptIn" ${me.whatsappOptIn ? "checked" : ""} /> Acepto recibir avisos por WhatsApp</label>
            <div class="divider"></div>
            <label>Nueva contraseña <span class="help">(deja en blanco para no cambiarla)</span><input name="password" type="password" minlength="6" /></label>
            <button class="btn" type="submit">Guardar perfil</button>
          </form>
        </div>
      </div>

      <div class="card mt-4">
        <h3>🏆 Participación en rankings</h3>
        <p class="muted text-sm mb-2">Si activas esta opción, podrás participar en los retos creados por tu preparador y aparecer en el ranking. Si la desactivas, no apareces.</p>
        <form class="form" id="ranking-form">
          <label class="text-sm"><input type="checkbox" name="rankingOptIn" ${me.rankingOptIn ? "checked" : ""} /> Quiero participar en rankings y competiciones</label>
          <button class="btn sm" type="submit">Guardar</button>
        </form>
      </div>

      <div class="card mt-4">
        <h3>🧠 Mi IA personal (opcional)</h3>
        <p class="muted text-sm mb-2">Puedes conectar tu propia API de Claude, ChatGPT o Gemini para generar tests, resúmenes y mapas conceptuales. <strong>El coste lo asume tu cuenta de IA</strong>, no la academia.</p>
        <p class="help mb-3">¿No tienes API key? Te enseñamos a obtenerla:
          <a href="https://ai.google.dev/" target="_blank" rel="noopener">Gemini</a> ·
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI</a> ·
          <a href="https://console.anthropic.com/" target="_blank" rel="noopener">Anthropic</a>
        </p>
        <form class="form" id="ai-form">
          <label class="text-sm"><input type="checkbox" name="ai.enabled" ${ai.enabled ? "checked" : ""} /> Usar mi IA personal en vez de la de la academia</label>
          <label>Proveedor
            <select name="ai.provider">
              <option value="">— Ninguno</option>
              <option value="gemini" ${ai.provider === "gemini" ? "selected" : ""}>Google Gemini</option>
              <option value="openai" ${ai.provider === "openai" ? "selected" : ""}>OpenAI (ChatGPT)</option>
              <option value="anthropic" ${ai.provider === "anthropic" ? "selected" : ""}>Anthropic (Claude)</option>
            </select>
          </label>
          <label>API key<input type="password" name="ai.apiKey" placeholder="${ai.apiKey === "********" ? "Configurada (deja vacío para mantener)" : "Pega tu API key aquí"}" /></label>
          <label>Modelo<input name="ai.model" value="${ui.esc(ai.model || "")}" placeholder="p.ej. gemini-1.5-flash, gpt-4o-mini, claude-haiku-4-5" /></label>
          <button class="btn" type="submit">Guardar IA personal</button>
        </form>
      </div>`;
  }

  // ── Mi plan (vista detallada con observaciones) ──────────────────────────

  function planSection() {
    const plan = state.data?.plan;
    const tasks = plan?.tasks || [];
    return `
      <div class="section-head">
        <div><p class="eyebrow">Mi planificación</p><h1>Plan detallado</h1></div>
        <button class="ghost sm" id="replan-btn">↻ Recalcular</button>
      </div>
      ${tasks.length === 0
        ? `<div class="empty-state"><h3>Sin plan generado</h3><p>Define tu compromiso para generar tu plan personalizado.</p></div>`
        : `${planSummary(plan)}${planByTopicWidget(plan)}${planByDayTable(tasks)}`}
    `;
  }

  // Widget superior con KPIs del plan (semanas hasta examen, factibilidad…)
  function planSummary(plan) {
    if (!plan) return "";
    const weeks = plan.weeksUntilExam;
    const totalTopics = plan.totalTopics || 0;
    const feasibilityPill = plan.feasibility === "tight"
      ? `<span class="pill" style="background:rgba(217,38,38,0.15);color:#d92626;">⚠️ Ajustado</span>`
      : plan.feasibility === "ok"
      ? `<span class="pill" style="background:rgba(12,143,111,0.15);color:#0c8f6f;">✓ Viable</span>`
      : `<span class="pill muted">Sin fecha de examen</span>`;
    return `
      <div class="grid cols-4 gap-3 mb-4">
        <div class="card text-center">
          <small class="muted">Semanas al examen</small>
          <div style="font-size:1.8em;font-weight:800;color:${weeks && weeks <= 4 ? "#d92626" : weeks && weeks <= 12 ? "#d97706" : "#155ea8"};">
            ${weeks != null ? weeks : "—"}
          </div>
          <small>${weeks != null ? "semanas restantes" : "configura fecha"}</small>
        </div>
        <div class="card text-center">
          <small class="muted">Temas en el temario</small>
          <div style="font-size:1.8em;font-weight:800;">${totalTopics}</div>
          <small>en tu temario actual</small>
        </div>
        <div class="card text-center">
          <small class="muted">Sesiones/semana</small>
          <div style="font-size:1.8em;font-weight:800;">${plan.weeklyCapacity || tasks.length || 0}</div>
          <small>bloques de estudio</small>
        </div>
        <div class="card text-center">
          <small class="muted">Factibilidad</small>
          <div style="margin-top:8px;">${feasibilityPill}</div>
          ${plan.totalSessionsNeeded ? `<small>${plan.totalSessionsNeeded} sesiones necesarias</small>` : ""}
        </div>
      </div>
      ${plan.feasibilityNote ? `
        <div class="card mb-4" style="border-left:4px solid #d92626;background:rgba(217,38,38,0.04);">
          <p style="margin:0;"><strong>⚠️ Aviso:</strong> ${ui.esc(plan.feasibilityNote)}</p>
        </div>` : ""}
      ${plan.recommendation && !plan.feasibilityNote ? `
        <div class="card mb-4" style="border-left:4px solid #155ea8;">
          <p class="muted text-sm" style="margin:0 0 4px;">Recomendación</p>
          <p style="margin:0;">${ui.esc(plan.recommendation)}</p>
        </div>` : ""}
    `;
  }

  // Widget visual: lista de temas con barra de progreso, sesiones planificadas
  // y completadas. Usa los topicTitle/topicNumber reales que ahora expone el
  // planificador (replan.js mejorado).
  function planByTopicWidget(plan) {
    const tasks = plan?.tasks || [];
    // Agrupar tareas por topicId
    const byTopic = new Map();
    for (const t of tasks) {
      if (!t.topicId) continue;
      const key = t.topicId;
      if (!byTopic.has(key)) {
        byTopic.set(key, {
          topicId: t.topicId,
          topicNumber: t.topicNumber || "",
          topicTitle: t.topicTitle || t.title,
          topicDifficulty: t.topicDifficulty,
          topicPriority: t.topicPriority,
          totalSessions: 0,
          doneSessions: 0,
          totalMinutes: 0,
          doneMinutes: 0,
          types: { Estudio: 0, Repaso: 0, Simulacro: 0 },
        });
      }
      const tt = byTopic.get(key);
      tt.totalSessions += 1;
      tt.totalMinutes += Number(t.minutes || 0);
      tt.types[t.type] = (tt.types[t.type] || 0) + 1;
      const compliance = t.compliance || (t.done ? "full" : "none");
      if (compliance === "full") {
        tt.doneSessions += 1;
        tt.doneMinutes += Number(t.minutes || 0);
      } else if (compliance === "partial") {
        tt.doneSessions += 0.5;
        tt.doneMinutes += Number(t.minutes || 0) * 0.5;
      }
    }
    const topics = Array.from(byTopic.values());
    if (!topics.length) return "";

    // Ordenar: primero los que tienen prioridad más alta y menos progreso
    topics.sort((a, b) => {
      const pa = priorityRank(a.topicPriority);
      const pb = priorityRank(b.topicPriority);
      if (pb !== pa) return pb - pa;
      const progA = a.doneSessions / Math.max(1, a.totalSessions);
      const progB = b.doneSessions / Math.max(1, b.totalSessions);
      return progA - progB;
    });

    return `
      <div class="card mb-4">
        <h3 style="margin:0 0 4px;">📚 Progreso por tema</h3>
        <p class="muted text-sm" style="margin:0 0 16px;">Sesiones programadas y completadas por cada tema del temario, ordenado por prioridad y progreso.</p>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${topics.map((t) => renderTopicProgress(t)).join("")}
        </div>
      </div>`;
  }

  function priorityRank(p) {
    return { "Muy alta": 4, Alta: 3, Media: 2, Baja: 1 }[p] || 0;
  }

  function renderTopicProgress(t) {
    const pct = Math.round((t.doneSessions / Math.max(1, t.totalSessions)) * 100);
    const barColor = pct >= 80 ? "#0c8f6f" : pct >= 50 ? "#155ea8" : pct >= 25 ? "#d97706" : "#d92626";
    const difficultyColor = t.topicDifficulty === "Alta" ? "#d92626" : t.topicDifficulty === "Baja" ? "#94a3b8" : "#d97706";
    const priorityColor = t.topicPriority === "Muy alta" ? "#d92626" : t.topicPriority === "Alta" ? "#d97706" : "#94a3b8";
    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong>${ui.esc(t.topicNumber)}</strong>
              <span>${ui.esc(t.topicTitle)}</span>
            </div>
            <div class="row gap-2 mt-1" style="flex-wrap:wrap;">
              ${t.topicDifficulty ? `<span class="pill" style="background:${hexA(difficultyColor, 0.15)};color:${difficultyColor};font-size:11px;">Dif. ${ui.esc(t.topicDifficulty)}</span>` : ""}
              ${t.topicPriority ? `<span class="pill" style="background:${hexA(priorityColor, 0.15)};color:${priorityColor};font-size:11px;">Prioridad ${ui.esc(t.topicPriority)}</span>` : ""}
              <span class="pill muted" style="font-size:11px;">${t.types.Estudio || 0}E · ${t.types.Repaso || 0}R · ${t.types.Simulacro || 0}S</span>
              <span class="pill muted" style="font-size:11px;">${Math.round(t.totalMinutes / 60 * 10) / 10}h totales</span>
            </div>
          </div>
          <div style="text-align:right;min-width:100px;">
            <div style="font-size:1.4em;font-weight:800;color:${barColor};">${pct}%</div>
            <small class="muted">${Math.round(t.doneSessions)} / ${t.totalSessions}</small>
          </div>
        </div>
        <div style="height:8px;background:#eef2f7;border-radius:4px;margin-top:10px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${barColor};transition:width 0.3s;"></div>
        </div>
      </div>`;
  }

  function hexA(hex, alpha) {
    // Convierte #rrggbb + alpha → rgba()
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Tabla diaria del plan (lo que estaba antes, ahora más abajo)
  function planByDayTable(tasks) {
    return `
      <div class="card">
        <h3 style="margin:0 0 4px;">🗓️ Plan semanal</h3>
        <p class="muted text-sm" style="margin:0 0 12px;">Tareas distribuidas por día. Marca cumplimiento al terminar cada bloque.</p>
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
      const r = await api.opositor.syllabi();
      // Si hay varios temarios el opositor verá el primero por ahora
      state.opoSyllabus = (r.syllabi || [])[0] || null;
    } catch { state.opoSyllabus = null; }
    // Temario propio (transcripción ~20:43)
    try {
      const r = await api.ai.personalSyllabus();
      state.personalSyllabus = r.syllabus;
    } catch { state.personalSyllabus = null; }
  }

  function opoSyllabusSection() {
    const s = state.opoSyllabus;
    const ps = state.personalSyllabus;
    const tab = state.syllabusTab || "academy";
    const tabsHtml = `
      <div class="tabs">
        <button data-syllabus-tab="academy" class="${tab === "academy" ? "active" : ""}">📚 Temario de la academia</button>
        <button data-syllabus-tab="personal" class="${tab === "personal" ? "active" : ""}">📝 Mi temario propio</button>
      </div>`;
    if (tab === "personal") {
      const topics = ps?.topics || [];
      return `
        <div class="section-head"><div><p class="eyebrow">Mi material</p><h1>Mi temario</h1></div></div>
        ${tabsHtml}
        <p class="muted mb-4">Aquí puedes añadir tus propios temas. Tu IA personal podrá generar tests y resúmenes sobre ellos.</p>
        <div class="card mb-4">
          <h3>Añadir tema propio</h3>
          <form class="form" id="ps-form">
            <div class="grid cols-2">
              <label>Número/código<input name="number" placeholder="Tema 12" /></label>
              <label>Bloque<input name="block" /></label>
            </div>
            <label>Título<input name="title" required /></label>
            <div class="grid cols-2">
              <label>Dificultad
                <select name="difficulty">
                  <option>Baja</option><option selected>Media</option><option>Alta</option>
                </select>
              </label>
              <label>Prioridad
                <select name="priority">
                  <option>Baja</option><option selected>Media</option><option>Alta</option><option>Muy alta</option>
                </select>
              </label>
            </div>
            <button class="btn" type="submit">+ Añadir tema</button>
          </form>
        </div>
        <div>
          ${topics.length === 0 ? `<div class="empty-state">Sin temas propios todavía.</div>` : topics.map((t) => `
            <div class="topic-card">
              <div class="top">
                <div>
                  <strong>${ui.esc(t.number)} · ${ui.esc(t.title)}</strong>
                  ${t.block ? `<small>Bloque: ${ui.esc(t.block)}</small>` : ""}
                  <div class="meta">
                    <span class="pill">${ui.esc(t.difficulty || "Media")}</span>
                    <span class="pill muted">${ui.esc(t.priority || "Media")}</span>
                  </div>
                </div>
                <button class="ghost sm" data-del-personal="${t.id}">Borrar</button>
              </div>
            </div>
          `).join("")}
        </div>`;
    }
    // Pestaña academy
    if (!s) {
      return `
        <div class="section-head"><div><p class="eyebrow">Temario</p><h1>Mi temario</h1></div></div>
        ${tabsHtml}
        <div class="empty-state"><h3>📚 Sin temario</h3><p>Tu preparador todavía no ha publicado temario.</p></div>`;
    }
    return `
      <div class="section-head">
        <div><p class="eyebrow">${ui.esc(s.examName || "Temario oficial")}</p><h1>${ui.esc(s.title)}</h1></div>
      </div>
      ${tabsHtml}
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

  // ── Herramientas IA: tests, resúmenes y mapas (transcripción ~20:43, ~20:48) ──

  async function loadTools() {
    try {
      const a = await api.ai.artifacts();
      state.aiArtifacts = a.artifacts || [];
    } catch { state.aiArtifacts = []; }
    // El temario académico y personal ya se cargan en loadOpoSyllabus,
    // pero los pedimos por si entras directo
    if (!state.opoSyllabus && !state.personalSyllabus) {
      await loadOpoSyllabus();
    }
  }

  function toolsSection() {
    const me = app.currentUser || {};
    const ai = me.ai || {};
    const hasAi = ai.enabled && ai.provider;
    const acaTopics = state.opoSyllabus?.topics || [];
    const personalTopics = state.personalSyllabus?.topics || [];
    const artifacts = state.aiArtifacts || [];
    const kindLabel = (k) => ({ test: "📝 Test", summary: "📄 Resumen", conceptMap: "🧠 Mapa conceptual" }[k] || k);
    return `
      <div class="section-head"><div><p class="eyebrow">Generadores</p><h1>Herramientas IA</h1></div></div>
      ${hasAi
        ? `<p class="muted mb-4">Estás usando tu IA personal (${ui.esc(ai.provider)}). El coste de cada generación se cargará a tu cuenta.</p>`
        : `<div class="card mb-4" style="border-color:var(--warn,#d59f1c);background:rgba(213,159,28,0.08);">
            <h3>⚠️ Falta tu IA personal</h3>
            <p>Configura tu propia API en <strong>Mi perfil</strong> para generar tests, resúmenes y mapas conceptuales sobre tu temario. Si tu academia tiene IA configurada, también funcionará pero la generación puede ir más lenta.</p>
          </div>`}

      <div class="card mb-4">
        <h3>🎯 Generar test</h3>
        <p class="muted text-sm mb-3">Tipo test sobre un tema concreto. Ideal para repasar antes de un examen.</p>
        <form class="form" id="gen-test-form">
          <div class="grid cols-2">
            <label>Origen del temario
              <select name="source" data-tool-source="test">
                <option value="academy">📚 Temario de la academia</option>
                <option value="personal">📝 Temario propio</option>
              </select>
            </label>
            <label>Tema
              <select name="topicId" id="test-topic">
                ${acaTopics.map((t) => `<option value="${ui.esc(t.id)}">${ui.esc(t.number || "")} ${ui.esc(t.title)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="grid cols-2">
            <label>Nº de preguntas<input type="number" name="count" min="3" max="40" value="10" /></label>
            <label>Tipo
              <select name="type">
                <option value="abcd">A, B, C, D</option>
                <option value="abc">A, B, C</option>
              </select>
            </label>
          </div>
          <button class="btn" type="submit">Generar test</button>
        </form>
      </div>

      <div class="card mb-4">
        <h3>📄 Generar resumen</h3>
        <p class="muted text-sm mb-3">Dos modos: conciso (ideal tipo test) o desarrollado (ideal oposición de desarrollo). Sin flashcards.</p>
        <form class="form" id="gen-summary-form">
          <div class="grid cols-2">
            <label>Origen del temario
              <select name="source" data-tool-source="summary">
                <option value="academy">📚 Temario de la academia</option>
                <option value="personal">📝 Temario propio</option>
              </select>
            </label>
            <label>Tema
              <select name="topicId" id="sum-topic">
                ${acaTopics.map((t) => `<option value="${ui.esc(t.id)}">${ui.esc(t.number || "")} ${ui.esc(t.title)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label>Modo
            <select name="mode">
              <option value="test_concise">Conciso (tipo test, datos secos)</option>
              <option value="development">Desarrollado (oposición de desarrollo, prosa)</option>
            </select>
          </label>
          <button class="btn" type="submit">Generar resumen</button>
        </form>
      </div>

      <div class="card mb-4">
        <h3>🧠 Generar mapa conceptual</h3>
        <p class="muted text-sm mb-3">Estructura jerárquica del tema en árbol de conceptos.</p>
        <form class="form" id="gen-map-form">
          <div class="grid cols-2">
            <label>Origen del temario
              <select name="source" data-tool-source="map">
                <option value="academy">📚 Temario de la academia</option>
                <option value="personal">📝 Temario propio</option>
              </select>
            </label>
            <label>Tema
              <select name="topicId" id="map-topic">
                ${acaTopics.map((t) => `<option value="${ui.esc(t.id)}">${ui.esc(t.number || "")} ${ui.esc(t.title)}</option>`).join("")}
              </select>
            </label>
          </div>
          <button class="btn" type="submit">Generar mapa</button>
        </form>
      </div>

      <div class="card">
        <h3>📚 Historial de generaciones</h3>
        ${artifacts.length === 0 ? `<div class="empty-state">Aún no has generado nada. Usa los formularios de arriba.</div>` : `
          <div class="table mt-3">
            <div class="table-row header"><span>Tipo</span><span>Tema</span><span>Fecha</span><span></span></div>
            ${artifacts.map((a) => `
              <div class="table-row">
                <span><strong>${kindLabel(a.kind)}</strong></span>
                <span>${ui.esc(a.topicTitle || "—")}</span>
                <span><small class="muted">${ui.esc((a.createdAt || "").slice(0, 16).replace("T", " "))}</small></span>
                <span class="actions">
                  <button class="ghost sm" data-view-artifact="${a.id}">Abrir</button>
                  <button class="ghost sm" data-del-artifact="${a.id}">Borrar</button>
                </span>
              </div>`).join("")}
          </div>`}
      </div>`;
  }

  // ── Retos / rankings (transcripción ~20:26) ─────────────────────────────

  async function loadOpoChallenges() {
    try {
      const r = await api.challenges.list();
      state.opoChallenges = r.challenges || [];
    } catch { state.opoChallenges = []; }
  }

  function opoChallengesSection() {
    const me = app.currentUser || {};
    const list = state.opoChallenges || [];
    if (!me.rankingOptIn) {
      return `
        <div class="section-head"><div><p class="eyebrow">Competición</p><h1>Retos y rankings</h1></div></div>
        <div class="card" style="border-color:var(--warn,#d59f1c);background:rgba(213,159,28,0.08);">
          <h3>🔒 Participación deshabilitada</h3>
          <p>Para participar en retos y aparecer en el ranking, activa la opción "Quiero participar en rankings y competiciones" en <strong>Mi perfil</strong>. Es totalmente opcional.</p>
        </div>`;
    }
    return `
      <div class="section-head"><div><p class="eyebrow">Competición</p><h1>Retos abiertos</h1></div></div>
      ${list.length === 0 ? `<div class="empty-state">No hay retos abiertos ahora mismo.</div>` : `
        <div class="grid cols-2">
          ${list.map((c) => `
            <div class="card">
              <h3>${ui.esc(c.name)}</h3>
              <p class="muted text-sm">${ui.esc(c.description || "")}</p>
              <small class="muted">${c.questionsCount || 0} preguntas · ${Math.round((c.durationSec || 0) / 60)} min</small>
              <div class="row mt-3">
                <button class="ghost sm" data-opo-ranking="${c.id}">Ver ranking</button>
                <button class="btn sm" data-opo-take="${c.id}">Empezar</button>
              </div>
            </div>`).join("")}
        </div>`}`;
  }

  // ── Encuesta NPS ──────────────────────────────────────────────────────────

  async function loadNps() {
    try {
      const r = await api.nps.activeSurvey();
      state.npsSurvey = r.survey || null;
      state.npsAlready = r.alreadyAnswered || false;
    } catch { state.npsSurvey = null; }
  }

  function npsOpoSection() {
    if (state.npsAlready) {
      return `
        <div class="section-head"><div><p class="eyebrow">Tu opinión</p><h1>Encuesta</h1></div></div>
        <div class="card">
          <h3>✅ Ya respondiste</h3>
          <p>Gracias por tu opinión. Volveremos a preguntarte más adelante.</p>
        </div>`;
    }
    if (!state.npsSurvey) {
      return `
        <div class="section-head"><div><p class="eyebrow">Tu opinión</p><h1>Encuesta</h1></div></div>
        <div class="card">
          <h3>Sin encuesta activa</h3>
          <p class="muted">Tu academia no tiene una encuesta abierta ahora mismo.</p>
        </div>`;
    }
    const sv = state.npsSurvey;
    return `
      <div class="section-head"><div><p class="eyebrow">Tu opinión nos importa</p><h1>${ui.esc(sv.title || "Encuesta")}</h1></div></div>
      <form class="form" id="nps-form">
        <div class="card mb-4">
          <h3>¿Qué probabilidad hay de que recomiendes esta academia a un amigo o familiar?</h3>
          <p class="muted text-sm mb-3">Selecciona del 0 (nada probable) al 10 (muy probable).</p>
          <div class="row gap-2" style="flex-wrap:wrap;">
            ${Array.from({ length: 11 }, (_, i) => `
              <label class="text-sm" style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;padding:8px 12px;border:1px solid var(--line);border-radius:8px;min-width:48px;">
                <input type="radio" name="score" value="${i}" required />
                <strong>${i}</strong>
              </label>`).join("")}
          </div>
        </div>
        ${(sv.questions || []).map((q, idx) => `
          <div class="card mb-4">
            <label><strong>${ui.esc(q.label || q)}</strong>
              <textarea name="answer_${idx}" rows="3" placeholder="Tu respuesta (opcional)"></textarea>
            </label>
          </div>`).join("")}
        <div class="card mb-4">
          <label>Comentario libre (opcional)
            <textarea name="comment" rows="3"></textarea>
          </label>
        </div>
        <button class="btn" type="submit">Enviar respuesta</button>
      </form>`;
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
                  <small>${p.deadline ? `Vence ${ui.esc(p.deadline)}` : "Sin fecha"}${p.notes ? ` · ${ui.esc(p.notes)}` : ""}${(p.registry || []).length ? ` · 📂 ${p.registry.length} en registro` : ""}</small>
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
      const [data, status] = await Promise.all([
        api.chat.threads(),
        api.chatExtra.status().catch(() => ({ enabled: !!state.data?.profile?.chatbotEnabled })),
      ]);
      state.chatThreads = data.threads || [];
      state.chatStatus = status || {};
      // Si hay hilos, abre el más reciente; si no, no hay hilo activo
      state.activeThread = state.chatThreads[0] || null;
    } catch { state.chatThreads = []; state.activeThread = null; state.chatStatus = {}; }
  }

  function chatSection() {
    const threads = state.chatThreads || [];
    const active = state.activeThread;
    const status = state.chatStatus || {};
    // Hay habilitación a varios niveles: el opositor activado + el modo del preparador
    const enabled = status.enabled !== undefined ? status.enabled : !!state.data?.profile?.chatbotEnabled;
    const modeLabel = status.modeLabel;

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

      <p class="muted text-sm mb-3">${modeLabel ? `Modo: <strong>${ui.esc(modeLabel)}</strong>. ` : ""}⚠️ Tu preparador puede ver estas conversaciones para supervisar el aprendizaje.</p>

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
    const freeSlots = (state.agendaSlots || []).slice(0, 8);
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
          ${freeSlots.length === 0 ? "" : `
            <div class="card mt-4">
              <h3>👋 Reservar tutoría</h3>
              <p class="muted text-sm mb-3">Próximos huecos libres con tu preparador.</p>
              <div class="event-list">
                ${freeSlots.map((s) => {
                  const date = s.date;
                  const day = date ? new Date(date + "T00:00:00").getDate() : "";
                  const monthShort = date ? new Date(date + "T00:00:00").toLocaleDateString("es-ES", { month: "short" }) : "";
                  return `
                    <div class="event-row tutoria">
                      <div class="when">${ui.esc(monthShort)}<strong>${day}</strong><small>${ui.esc(s.time)}</small></div>
                      <div>
                        <strong>Hueco libre</strong>
                        <small class="muted" style="display:block;">${s.durationMin || 60} min</small>
                      </div>
                      <div><button class="btn sm" data-book-slot="${s.id}" data-book-date="${s.date}" data-book-time="${s.time}">Reservar</button></div>
                    </div>`;
                }).join("")}
              </div>
            </div>`}
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
                  ${b.videoJoinUrl ? `<small>📹 <a href="${ui.esc(b.videoJoinUrl)}" target="_blank" rel="noopener">Unirse a la videollamada (${ui.esc(b.videoProvider || "")})</a>${b.videoPasscode ? ` · contraseña <code>${ui.esc(b.videoPasscode)}</code>` : ""}</small>` : ""}
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

  // ── FASE 6: Predictor de fecha óptima (catálogo §B.3) ───────────────────

  function predictorSection() {
    const f = state.forecast;
    const gap = state.gap;
    if (!f) return `<div class="section-head"><h1>🔮 Predictor</h1></div><div class="empty-state">Cargando…</div>`;
    if (!f.ready) {
      return `<div class="section-head"><h1>🔮 Predictor</h1></div>
        <div class="card"><p>${ui.esc(f.message || "Aún no tienes datos suficientes")}</p>
        <p class="muted text-sm">Realiza al menos un simulacro avanzado para que el sistema pueda calcular tu previsión.</p></div>`;
    }
    const probColor = f.todayPassProbability >= 70 ? "#0c8f6f" : f.todayPassProbability >= 40 ? "#d97706" : "#dc2626";
    const trendIcon = f.trend === "mejorando" ? "📈" : f.trend === "deteriorando" ? "📉" : "➡️";
    return `
      <div class="section-head">
        <div><p class="eyebrow">Cálculo sobre tus simulacros</p><h1>🔮 ¿Cuándo estoy listo?</h1></div>
      </div>
      <p class="muted mb-4">Modelo de regresión lineal sobre tus últimos ${f.recentN} simulacros + brecha al umbral. <strong>Es una orientación, no un oráculo:</strong> recalibra cada simulacro y depende mucho de la calidad de tu banco de preguntas.</p>

      ${f.lowConfidence ? `
        <div class="card mb-4" style="border-left:4px solid #d97706;background:rgba(217,119,6,0.06);">
          <strong>⚠️ Datos limitados</strong>
          <p class="text-sm">${ui.esc(f.confidenceMessage)}</p>
        </div>` : ""}

      <div class="grid cols-3 gap-3 mb-4">
        <div class="card text-center">
          <small class="muted">Tu nota proyectada hoy</small>
          <div style="font-size:2.4em;font-weight:800;color:${probColor};">${f.todayProjectedScore}</div>
          <small>media últimos ${f.recentN} = ${f.recentMean} ± ${f.recentStd}</small>
        </div>
        <div class="card text-center">
          <small class="muted">Probabilidad de aprobar HOY</small>
          <div style="font-size:2.4em;font-weight:800;color:${probColor};">${f.todayPassProbability}%</div>
          <small>umbral: ${f.threshold}/10</small>
        </div>
        <div class="card text-center">
          <small class="muted">Tendencia ${trendIcon}</small>
          <div style="font-size:1.6em;font-weight:700;text-transform:capitalize;">${ui.esc(f.trend)}</div>
          <small>${f.slopePerDay >= 0 ? "+" : ""}${(f.slopePerDay * 7).toFixed(2)} pts/semana</small>
        </div>
      </div>

      ${f.examDate ? `
        <div class="card mb-4" style="border-left:4px solid ${probColor};">
          <h3>📅 En tu fecha de examen (${ui.esc(f.examDate)})</h3>
          <p>Probabilidad estimada de aprobar: <strong style="color:${probColor};font-size:1.3em;">${f.probAtExam}%</strong></p>
          ${f.probAtExam < 50 ? `<p class="muted text-sm">⚠️ Si mantienes el ritmo actual, vas justo. Considera aumentar carga o pedir más tutorías.</p>` : ""}
        </div>` : ""}

      ${f.projectedReadyDate ? `
        <div class="card mb-4">
          <h3>🎯 Fecha estimada de "estar listo"</h3>
          <p>Si mantienes este ritmo, alcanzarás un ${f.threshold}/10 estable hacia <strong>${ui.esc(f.projectedReadyDate)}</strong> (${f.daysToReachThreshold} días).</p>
        </div>` : f.todayProjectedScore >= f.threshold ? `
        <div class="card mb-4" style="background:rgba(12,143,111,0.08);">
          <h3>✓ Ya estás en el umbral</h3>
          <p>Tu proyección actual ya supera el ${f.threshold}/10. Trabaja la consistencia (reducir desviación estándar).</p>
        </div>` : ""}

      ${gap && gap.length ? `
        <div class="card">
          <h3>🎯 ROI por tema (dónde rinde más estudiar)</h3>
          <p class="muted text-sm mb-3">Brecha de aciertos × peso del tema. Empieza por arriba.</p>
          <div class="table">
            <div class="table-row header"><span>Tema</span><span>Tu acierto</span><span>ROI</span></div>
            ${gap.slice(0, 10).map((t) => `
              <div class="table-row">
                <span><strong>${ui.esc(t.number || "")}</strong> ${ui.esc(t.title)}</span>
                <span>${t.hitRatePct === null ? `<small class="muted">sin datos</small>` : `<strong>${t.hitRatePct}%</strong>`}</span>
                <span><div class="bar" style="background:#155ea8;width:${Math.round(t.roi * 100)}%;height:8px;border-radius:4px;"></div><small>${t.roi.toFixed(2)}</small></span>
              </div>`).join("")}
          </div>
        </div>` : ""}`;
  }

  async function loadPredictor() {
    try {
      const [f, g] = await Promise.all([
        api.predictor.forecast(),
        api.predictor.gap(),
      ]);
      state.forecast = f.forecast;
      state.gap = g.gap;
    } catch (e) {
      state.forecast = { ready: false, message: "Error al calcular." };
      state.gap = null;
    }
  }

  // ── FASE 6: Bienestar (catálogo §B.7) ──────────────────────────────────

  function wellbeingSection() {
    const sc = state.stressCheck;
    const hist = state.stressHistory || [];
    const sus = state.sustainability;
    const res = state.wellbeingResources || [];
    return `
      <div class="section-head">
        <div><p class="eyebrow">Tu bienestar también aprueba</p><h1>🧘 Salud mental y ritmo sostenible</h1></div>
      </div>

      ${sus ? `
        <div class="card mb-4" style="border-left:4px solid ${sus.riskScore >= 60 ? "#dc2626" : sus.riskScore >= 35 ? "#d97706" : "#0c8f6f"};">
          <div class="row" style="justify-content:space-between;align-items:center;">
            <div>
              <small class="muted">Indicador de sostenibilidad</small>
              <h3>${sus.riskScore >= 60 ? "Riesgo de agotamiento" : sus.riskScore >= 35 ? "Carga moderada-alta" : "Ritmo sostenible"}</h3>
              <p class="text-sm">${ui.esc(sus.advice)}</p>
            </div>
            <div class="text-center">
              <div style="font-size:2.5em;font-weight:800;color:${sus.riskScore >= 60 ? "#dc2626" : sus.riskScore >= 35 ? "#d97706" : "#0c8f6f"};">${sus.riskScore}</div>
              <small class="muted">${sus.avgHoursPerDay}h/día · estrés ${sus.stressScore}</small>
            </div>
          </div>
        </div>` : ""}

      <div class="card mb-4">
        <h3>📊 Cuestionario semanal de estrés</h3>
        ${sc?.alreadyAnswered ? `
          <p>Esta semana ya respondiste el ${ui.esc(sc.last.weekOf)}: <strong style="color:${sc.last.label.color};">${ui.esc(sc.last.label.label)}</strong> (${sc.last.score}/25).</p>
          <button class="ghost sm" id="redo-stress">Modificar respuestas</button>
        ` : sc ? `
          <p class="muted text-sm mb-3">Tu respuesta es privada. Se usa solo para ajustar tu plan de estudio y avisarte si necesitas reducir carga.</p>
          <form id="stress-form" class="form">
            ${sc.questions.map((q) => `
              <label>${ui.esc(q.text)}
                <div class="row gap-2 mt-1">
                  ${[1,2,3,4,5].map((v) => `<label class="pill" style="cursor:pointer;"><input type="radio" name="${q.id}" value="${v}" ${v === 3 ? "checked" : ""} style="margin-right:4px;"/>${v}</label>`).join("")}
                </div>
                <small class="muted">1 = nada · 5 = totalmente</small>
              </label>`).join("")}
            <button type="submit" class="btn">Guardar respuesta</button>
          </form>
        ` : `<p class="muted">Cargando…</p>`}

        ${hist.length > 1 ? `
          <div class="mt-4">
            <h4 class="text-sm muted">Tus últimas ${hist.length} semanas</h4>
            <div class="row gap-1 mt-2" style="align-items:flex-end;height:80px;">
              ${hist.map((h) => `<div title="${h.weekOf}: ${h.score}" style="flex:1;background:${h.label.color};height:${(h.score / 25) * 100}%;border-radius:3px 3px 0 0;min-height:4px;"></div>`).join("")}
            </div>
            <small class="muted">Verde: bajo · Azul: moderado · Naranja: alto · Rojo: agotamiento</small>
          </div>` : ""}
      </div>

      <div class="card">
        <h3>📚 Biblioteca de recursos</h3>
        <p class="muted text-sm mb-3">Técnicas breves y validadas para gestionar la carga de estudio. Léelas con tiempo y vuelve cuando lo necesites.</p>
        <div class="grid cols-2 gap-3">
          ${res.map((r) => `
            <div class="card-inner">
              <small class="pill muted">${ui.esc(r.kind)}${r.durationSec ? ` · ${Math.round(r.durationSec / 60)} min` : ""}</small>
              <h4>${ui.esc(r.title)}</h4>
              <p class="text-sm">${ui.esc(r.description)}</p>
              <details><summary class="muted text-sm" style="cursor:pointer;">Leer técnica</summary>
                <div class="markdown text-sm mt-2" style="line-height:1.6;">${renderSimpleMarkdown(r.body)}</div>
                ${window.__audio?.available ? `<div class="row gap-2 mt-2"><button class="ghost sm" data-tts-resource="${r.id}">🔊 Escuchar</button></div>` : ""}
              </details>
            </div>`).join("")}
        </div>
      </div>`;
  }

  function renderSimpleMarkdown(md) {
    // Renderizado mínimo: ## headings, **bold**, listas con -, párrafos.
    return ui.esc(md)
      .replace(/^## (.+)$/gm, "<h4>$1</h4>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.+?<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`)
      .replace(/\n\n/g, "</p><p>")
      .replace(/^/, "<p>")
      .replace(/$/, "</p>")
      .replace(/<p><h4>/g, "<h4>").replace(/<\/h4><\/p>/g, "</h4>")
      .replace(/<p><ul>/g, "<ul>").replace(/<\/ul><\/p>/g, "</ul>");
  }

  async function loadWellbeing() {
    try {
      const [sc, hist, res, sus] = await Promise.all([
        api.wellbeing.stressCheck(),
        api.wellbeing.stressHistory(),
        api.wellbeing.resources(),
        api.wellbeing.sustainability(),
      ]);
      state.stressCheck = sc;
      state.stressHistory = hist.history;
      state.wellbeingResources = res.resources;
      state.sustainability = sus;
    } catch (e) {
      console.error(e);
    }
  }

  // ── FASE 6: Simulacro avanzado (catálogo §A.6 / §B simulacros) ─────────

  function simulacroSection() {
    if (state.simulacroActive) return simulacroRunningView();
    const list = state.simulacrosList || [];
    return `
      <div class="section-head">
        <div><p class="eyebrow">Más allá del cronómetro</p><h1>🧪 Simulacro con análisis cognitivo</h1></div>
        <button class="btn" id="start-simulacro">+ Empezar simulacro</button>
      </div>
      <p class="muted mb-4">Cada pregunta registra tu tiempo, los cambios de respuesta y tu nivel de confianza declarado. Al terminar, ves tu mapa de vulnerabilidad y calibración (¿confías cuando aciertas y dudas cuando fallas?).</p>

      ${list.length === 0 ? `<div class="empty-state"><h3>Sin simulacros previos</h3><p>Empieza el primero con el botón de arriba.</p></div>` : `
        <div class="card">
          <h3>Tus simulacros</h3>
          <div class="table mt-2">
            <div class="table-row header"><span>Fecha</span><span>Preguntas</span><span>Tiempo</span><span>Nota</span><span></span></div>
            ${list.map((a) => `
              <div class="table-row">
                <span>${ui.esc((a.startedAt || "").slice(0, 16).replace("T", " "))}</span>
                <span>${a.questionsCount}</span>
                <span>${Math.round((a.durationSec || 0) / 60)} min</span>
                <span><strong style="color:${(a.score || 0) >= 5 ? "#0c8f6f" : "#dc2626"};">${a.score ?? "—"}</strong></span>
                <span>${a.finishedAt ? `<button class="ghost sm" data-analysis="${a.id}">Análisis</button>` : `<small class="muted">en curso</small>`}</span>
              </div>`).join("")}
          </div>
        </div>`}

      ${state.lastAnalysis ? renderAnalysisCard(state.lastAnalysis) : ""}`;
  }

  function renderAnalysisCard(a) {
    return `<div class="card mt-4">
      <h3>🧠 Análisis cognitivo</h3>
      <div class="grid cols-3 gap-3">
        <div class="text-center"><small class="muted">Calibración</small><div style="font-size:1.8em;font-weight:700;">${a.calibrationPct ?? "—"}%</div><small>confianza ↔ resultado</small></div>
        <div class="text-center"><small class="muted">Tiempo medio</small><div style="font-size:1.8em;font-weight:700;">${Math.round(a.avgTimeMs / 1000)}s</div><small>por pregunta</small></div>
        <div class="text-center"><small class="muted">Cambios</small><div style="font-size:1.8em;font-weight:700;">${a.changersAccuracyPct ?? "—"}%</div><small>aciertos al cambiar (de ${a.changersCount})</small></div>
      </div>
      ${a.slowestQuestions.length ? `
        <h4 class="mt-4 text-sm">Preguntas más lentas</h4>
        <ul class="text-sm">${a.slowestQuestions.map((q) => `<li>${q.correct ? "✓" : "✗"} ${Math.round(q.timeMs / 1000)}s en pregunta ${q.idx + 1}</li>`).join("")}</ul>` : ""}
      ${a.vulnerabilityMap.length ? `
        <h4 class="mt-4 text-sm">Mapa de vulnerabilidad (acertaste pero con dudas)</h4>
        <p class="text-sm muted">${a.vulnerabilityMap.length} preguntas que acertaste pero con baja confianza o muchos cambios. Repasa esos conceptos: en el examen real, bajo presión, podrían fallar.</p>` : ""}
    </div>`;
  }

  function simulacroRunningView() {
    const s = state.simulacroActive;
    const idx = s.currentIdx;
    const q = s.questions[idx];
    if (!q) return "";
    const elapsed = Math.round((Date.now() - s.questionStartedAt) / 1000);
    return `
      <div class="section-head">
        <div><p class="eyebrow">Pregunta ${idx + 1} de ${s.questions.length}</p><h1>🧪 Simulacro en curso</h1></div>
        <div class="text-right"><small class="muted">Tiempo en pregunta</small><div style="font-size:1.4em;font-weight:700;" id="q-timer">${elapsed}s</div></div>
      </div>
      <div class="card">
        <p class="text-sm muted">${ui.esc(q.norm || "")}</p>
        <h3 style="line-height:1.5;">${ui.esc(q.text)}</h3>
        <div class="grid cols-1 gap-2 mt-3">
          ${q.options.map((opt, i) => `
            <button class="ghost text-left ${s.localAnswers[idx]?.chosen === i ? "active" : ""}" data-q-opt="${i}" style="padding:14px;border-radius:8px;${s.localAnswers[idx]?.chosen === i ? "background:rgba(21,94,168,0.1);border-color:#155ea8;" : ""}">
              <strong>${String.fromCharCode(65 + i)}.</strong> ${ui.esc(opt)}
            </button>`).join("")}
        </div>
        <div class="row gap-2 mt-4" style="align-items:center;">
          <small class="muted">Tu confianza:</small>
          <button class="pill ${s.localAnswers[idx]?.confidence === "sure" ? "active" : ""}" data-q-conf="sure">Seguro/a</button>
          <button class="pill ${s.localAnswers[idx]?.confidence === "doubt" ? "active" : ""}" data-q-conf="doubt">Dudoso/a</button>
          <button class="pill ${s.localAnswers[idx]?.confidence === "guess" ? "active" : ""}" data-q-conf="guess">Adivinanza</button>
        </div>
        <div class="row gap-2 mt-4" style="justify-content:space-between;">
          <button class="ghost" id="q-prev" ${idx === 0 ? "disabled" : ""}>← Anterior</button>
          ${idx === s.questions.length - 1
            ? `<button class="btn" id="q-finish">Terminar simulacro</button>`
            : `<button class="btn" id="q-next">Siguiente →</button>`}
        </div>
      </div>`;
  }

  async function loadSimulacros() {
    try {
      const [r, p] = await Promise.all([
        api.simulacros.mine(),
        api.processes.list().catch(() => ({ processes: [] })),
      ]);
      state.simulacrosList = r.attempts || [];
      state.processes = p.processes || [];
    } catch (e) {
      state.simulacrosList = [];
      state.processes = [];
    }
  }

  // ── FASE 6 ampliada: Comunidad (catálogo §B.5) ────────────────────────────

  function communitySection() {
    const tab = state.communityTab || "streak";
    return `
      <div class="section-head">
        <div><p class="eyebrow">No estudias solo/a</p><h1>👥 Comunidad</h1></div>
      </div>
      <div class="tabs">
        <button data-comm-tab="streak" class="${tab === "streak" ? "active" : ""}">Mi racha</button>
        <button data-comm-tab="rooms" class="${tab === "rooms" ? "active" : ""}">Salas Pomodoro</button>
        <button data-comm-tab="duels" class="${tab === "duels" ? "active" : ""}">Duelos</button>
        <button data-comm-tab="forum" class="${tab === "forum" ? "active" : ""}">Foro</button>
        <button data-comm-tab="mentors" class="${tab === "mentors" ? "active" : ""}">Mentores</button>
      </div>
      ${tab === "streak" ? renderStreakTab() : ""}
      ${tab === "rooms" ? renderRoomsTab() : ""}
      ${tab === "duels" ? renderDuelsTab() : ""}
      ${tab === "forum" ? renderForumTab() : ""}
      ${tab === "mentors" ? renderMentorsTab() : ""}`;
  }

  function renderStreakTab() {
    const s = state.communityStreak || {};
    const lb = state.communityLeaderboard || [];
    return `
      <div class="grid cols-3 gap-3 mb-4">
        <div class="card text-center">
          <small class="muted">Racha actual</small>
          <div style="font-size:2.4em;font-weight:800;color:#d97706;">🔥 ${s.currentStreak || 0}</div>
          <small>días consecutivos</small>
        </div>
        <div class="card text-center">
          <small class="muted">Mejor racha</small>
          <div style="font-size:2.4em;font-weight:800;color:#0c8f6f;">🏆 ${s.bestStreak || 0}</div>
          <small>histórica</small>
        </div>
        <div class="card text-center">
          <small class="muted">Días activos totales</small>
          <div style="font-size:2.4em;font-weight:800;">${s.daysActive || 0}</div>
          <small>desde que empezaste</small>
        </div>
      </div>
      <div class="card">
        <h3>🏅 Tabla de clasificación</h3>
        <p class="muted text-sm mb-3">Solo aparecen opositores que han activado el ranking público en su perfil. Los puestos se calculan por racha actual.</p>
        ${lb.length === 0 ? `<div class="empty-state">Sin datos.</div>` : `
          <div class="table">
            <div class="table-row header"><span>#</span><span>Opositor</span><span>Racha actual</span><span>Mejor</span></div>
            ${lb.map((row, i) => `
              <div class="table-row">
                <span><strong>${i + 1}</strong></span>
                <span>${ui.esc(row.name)}</span>
                <span>🔥 ${row.currentStreak}</span>
                <span>🏆 ${row.bestStreak}</span>
              </div>`).join("")}
          </div>`}
      </div>`;
  }

  function renderRoomsTab() {
    const rooms = state.studyRooms || [];
    const active = state.activeRoom;
    if (active) {
      const remaining = Math.max(0, Math.round((new Date(active.phaseEndsAt).getTime() - Date.now()) / 1000));
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      return `
        <div class="card" style="border-left:4px solid ${active.currentPhase === "study" ? "#155ea8" : "#0c8f6f"};">
          <div class="row" style="justify-content:space-between;align-items:flex-start;">
            <div>
              <small class="muted">${active.mode === "50_10" ? "50 / 10" : "25 / 5"} · ciclo ${active.cyclesCompleted + 1}</small>
              <h3>${ui.esc(active.name)}</h3>
              <p>Fase actual: <strong>${active.currentPhase === "study" ? "🎯 Estudio" : "☕ Descanso"}</strong></p>
              <p>Miembros conectados: ${active.members.map((m) => ui.esc(m.name)).join(", ")}</p>
            </div>
            <div class="text-center">
              <div style="font-size:3em;font-weight:800;font-family:monospace;color:${active.currentPhase === "study" ? "#155ea8" : "#0c8f6f"};">${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}</div>
              <button class="ghost sm mt-2" id="leave-room">Salir de la sala</button>
            </div>
          </div>
          <p class="muted text-sm mt-3">El temporizador se sincroniza haciendo polling cada 10s. Al terminar la fase, todos los miembros pasan a la siguiente automáticamente.</p>
        </div>`;
    }
    return `
      <div class="row mb-3" style="justify-content:flex-end;">
        <button class="btn" id="new-room">+ Crear sala</button>
      </div>
      ${rooms.length === 0 ? `<div class="empty-state">Sin salas activas. Crea la primera.</div>` : `
        <div class="grid cols-2 gap-3">
          ${rooms.map((r) => `
            <div class="card">
              <h3>${ui.esc(r.name)}</h3>
              <div class="row gap-2 mt-2">
                <span class="pill">${r.mode === "50_10" ? "50/10" : "25/5"}</span>
                <span class="pill">${r.currentPhase === "study" ? "🎯 Estudio" : "☕ Descanso"}</span>
                <span class="pill muted">${r.members}/${r.capacity}</span>
              </div>
              <button class="btn mt-3" data-join-room="${r.id}" ${r.members >= r.capacity ? "disabled" : ""}>${r.members >= r.capacity ? "Llena" : "Unirse"}</button>
            </div>`).join("")}
        </div>`}`;
  }

  function renderDuelsTab() {
    const duels = state.duelsList || [];
    return `
      <div class="row mb-3" style="justify-content:flex-end;">
        <button class="btn" id="new-duel">+ Retar a alguien</button>
      </div>
      ${duels.length === 0 ? `<div class="empty-state">Aún no has participado en ningún duelo.</div>` : `
        <div class="event-list">
          ${duels.map((d) => {
            const isMyTurn = d.opponentId === state.user?.id && d.status === "pending";
            const won = d.winnerId === state.user?.id;
            return `<div class="slot-card">
              <div class="slot-when">
                <strong>${ui.esc(d.challengeName)}</strong>
                <small>${ui.esc(d.challengerName)} vs ${ui.esc(d.opponentName)} · ${d.questionIds.length} preguntas</small>
              </div>
              ${d.status === "finished" ? `<span class="pill ${won ? "" : "muted"}" style="background:${won ? "rgba(12,143,111,0.15)" : ""};color:${won ? "#0c8f6f" : ""};">${won ? "🏆 Ganaste" : "Terminado"}</span>` :
                isMyTurn ? `<button class="btn sm" data-accept-duel="${d.id}">Aceptar reto</button>` :
                `<span class="pill">${d.status === "pending" ? "⏳ Esperando" : ui.esc(d.status)}</span>`}
            </div>`;
          }).join("")}
        </div>`}`;
  }

  function renderForumTab() {
    const threads = state.forumThreads || [];
    return `
      <div class="row mb-3" style="justify-content:flex-end;">
        <button class="btn" id="new-thread">+ Abrir hilo</button>
      </div>
      ${threads.length === 0 ? `<div class="empty-state">El foro está vacío. Sé el primero en preguntar.</div>` : `
        <div class="event-list">
          ${threads.map((t) => `
            <div class="slot-card">
              <div class="slot-when">
                <strong>${ui.esc(t.title)}</strong>
                <small>por ${ui.esc(t.authorName)} · ${(t.replies || []).length} respuestas${t.topicTag ? ` · #${ui.esc(t.topicTag)}` : ""}</small>
              </div>
              <small class="muted">${ui.esc((t.lastReplyAt || t.createdAt || "").slice(0, 10))}</small>
            </div>`).join("")}
        </div>`}`;
  }

  function renderMentorsTab() {
    const mentors = state.mentors || [];
    return `
      <p class="muted text-sm mb-3">Opositores aprobados que ofrecen sesiones de orientación. Solicita una y el mentor decidirá si aceptar.</p>
      ${mentors.length === 0 ? `<div class="empty-state">Sin mentores disponibles.</div>` : `
        <div class="grid cols-2 gap-3">
          ${mentors.map((m) => `
            <div class="card">
              <h3>${ui.esc(m.name)}</h3>
              <p class="text-sm muted">${ui.esc(m.oposicion || "")} · ${m.year || ""} ${m.position ? `· ${ui.esc(m.position)}` : ""}</p>
              ${m.testimonial ? `<blockquote class="text-sm">"${ui.esc(m.testimonial)}"</blockquote>` : ""}
              <button class="btn mt-2" data-request-mentor="${m.id}">Solicitar sesión</button>
            </div>`).join("")}
        </div>`}`;
  }

  async function loadCommunity() {
    const tab = state.communityTab || "streak";
    try {
      if (tab === "streak") {
        const [s, lb] = await Promise.all([api.community.streak(), api.community.leaderboard().catch(() => ({ rows: [] }))]);
        state.communityStreak = s;
        state.communityLeaderboard = lb.rows;
      } else if (tab === "rooms") {
        const r = await api.community.rooms();
        state.studyRooms = r.rooms || [];
      } else if (tab === "duels") {
        const r = await api.community.duels();
        state.duelsList = r.duels || [];
      } else if (tab === "forum") {
        const r = await api.community.forumThreads();
        state.forumThreads = r.threads || [];
      } else if (tab === "mentors") {
        const r = await api.crm.mentors();
        state.mentors = r.mentors || [];
      }
    } catch (e) { console.error(e); }
  }

  // ── FASE 6 ampliada: Mis certificaciones (catálogo §A.10.3) ─────────────

  function certsSection() {
    const items = state.certEligibility || [];
    return `
      <div class="section-head">
        <div><p class="eyebrow">Tu progreso medido</p><h1>🎖️ Mis certificaciones</h1></div>
      </div>
      <p class="muted mb-4">Niveles que tu academia te puede certificar según tus simulacros completados. <strong>Sin valor oficial</strong>: es una acreditación interna que sirve como hito y motivación.</p>
      ${items.length === 0 ? `<div class="empty-state">Tu academia aún no ha definido niveles de certificación.</div>` : `
        <div class="grid cols-2 gap-3">
          ${items.map((lv) => `
            <div class="card" style="border-left:4px solid ${lv.color};${lv.eligibleNow ? "background:rgba(12,143,111,0.04);" : ""}">
              <div class="row" style="justify-content:space-between;align-items:flex-start;">
                <div>
                  <small style="color:${lv.color};font-weight:700;">${ui.esc(lv.id)}</small>
                  <h3>${ui.esc(lv.label)}</h3>
                  <p class="text-sm muted">Criterio: ${lv.minSimulacros} simulacros con nota ≥ ${lv.minScore}/10</p>
                </div>
                ${lv.issued ? `<span class="pill" style="background:rgba(12,143,111,0.15);color:#0c8f6f;">✓ Emitido</span>` : ""}
              </div>
              <div class="mt-3">
                <small class="muted">Progreso: ${lv.progress.current}/${lv.progress.target}</small>
                <div style="height:8px;background:#eef2f7;border-radius:4px;margin-top:4px;overflow:hidden;">
                  <div style="height:100%;width:${Math.min(100, (lv.progress.current / lv.progress.target) * 100)}%;background:${lv.color};"></div>
                </div>
              </div>
              ${lv.eligibleNow && !lv.issued ? `<button class="btn mt-3" data-issue-cert="${lv.id}">🎖️ Reclamar certificado</button>` : ""}
              ${lv.issued ? `<a class="ghost mt-3" href="/api/certifications/${lv.certificateId}/render" target="_blank">Ver / descargar SVG</a>` : ""}
            </div>`).join("")}
        </div>`}`;
  }

  async function loadCerts() {
    try {
      const r = await api.certifications.mine();
      state.certEligibility = r.eligibility || [];
    } catch (e) {
      state.certEligibility = [];
    }
  }

  // ── Mis facturas (PayPal del preparador particular) ─────────────────────

  function invoicesSection() {
    const invs = state.paypalInvoices || [];
    if (!invs.length) {
      return `
        <div class="section-head">
          <div><p class="eyebrow">Pagos a tu preparador</p><h1>🧾 Mis facturas</h1></div>
        </div>
        <div class="empty-state">
          <h3>Sin facturas</h3>
          <p>Cuando tu preparador te emita una factura desde su panel, aparecerá aquí con el botón para pagarla.</p>
        </div>`;
    }

    // Resumen arriba
    const pending = invs.filter((i) => i.status === "pending");
    const paid = invs.filter((i) => i.status === "paid");
    const totalPending = pending.reduce((s, i) => s + (i.amount || 0), 0);
    const totalPaid = paid.reduce((s, i) => s + (i.amount || 0), 0);

    return `
      <div class="section-head">
        <div><p class="eyebrow">Pagos a tu preparador</p><h1>🧾 Mis facturas</h1></div>
      </div>

      <div class="grid cols-3 gap-3 mb-4">
        <div class="card text-center">
          <small class="muted">Pendientes</small>
          <div style="font-size:2em;font-weight:800;color:#d97706;">${pending.length}</div>
          <small>${totalPending.toFixed(2)} €</small>
        </div>
        <div class="card text-center">
          <small class="muted">Pagadas</small>
          <div style="font-size:2em;font-weight:800;color:#0c8f6f;">${paid.length}</div>
          <small>${totalPaid.toFixed(2)} €</small>
        </div>
        <div class="card text-center">
          <small class="muted">Total facturado</small>
          <div style="font-size:2em;font-weight:800;">${(totalPaid + totalPending).toFixed(2)}€</div>
          <small>histórico completo</small>
        </div>
      </div>

      ${pending.length ? `
        <h3 style="margin-bottom:8px;">Pendientes de pago</h3>
        <div class="event-list mb-4">
          ${pending.map((inv) => renderInvoiceCard(inv, true)).join("")}
        </div>` : ""}

      ${paid.length ? `
        <h3 style="margin-bottom:8px;">Histórico de pagadas</h3>
        <div class="event-list">
          ${paid.slice(0, 10).map((inv) => renderInvoiceCard(inv, false)).join("")}
        </div>` : ""}
    `;
  }

  function renderInvoiceCard(inv, payable) {
    const ref = ui.esc(inv.reference || inv.id);
    const concept = ui.esc(inv.concept || "");
    const prepName = ui.esc(inv.preparadorName || "Preparador");
    const created = (inv.createdAt || "").slice(0, 10);
    const amountFmt = `${(inv.amount || 0).toFixed(2)} ${ui.esc(inv.currency || "EUR")}`;
    const statusPill = inv.status === "paid"
      ? `<span class="pill" style="background:rgba(12,143,111,0.15);color:#0c8f6f;">✓ Pagada</span>`
      : inv.status === "cancelled"
      ? `<span class="pill muted">Cancelada</span>`
      : `<span class="pill" style="background:rgba(217,119,6,0.15);color:#d97706;">⏳ Pendiente</span>`;
    const payButton = payable && inv.paymentUrl
      ? `<a class="btn sm" href="${ui.esc(inv.paymentUrl)}" target="_blank" rel="noopener">💸 Pagar con PayPal</a>`
      : "";
    const refNote = payable && inv.mode === "link_only"
      ? `<small class="muted text-sm" style="display:block;margin-top:4px;">Importante: añade la referencia <code>${ref}</code> en el campo "Nota" al pagar para que tu preparador concilie el pago.</small>`
      : "";
    return `
      <div class="slot-card" style="${payable ? "border-left:4px solid #d97706;" : ""}">
        <div class="slot-when" style="flex:1;">
          <strong>${concept}</strong>
          <small>${prepName} · emitida ${ui.esc(created)} · ${ref}</small>
          ${refNote}
        </div>
        <div style="text-align:right;">
          <div style="font-weight:800;font-size:1.1em;">${amountFmt}</div>
          ${statusPill}
          ${payable ? `<div style="margin-top:6px;">${payButton}</div>` : ""}
          ${inv.paidAt ? `<small class="muted" style="display:block;margin-top:4px;">Pagada ${ui.esc((inv.paidAt || "").slice(0, 10))}</small>` : ""}
        </div>
      </div>`;
  }

  async function loadInvoices() {
    try {
      const r = await api.opositor.paypalInvoices();
      state.paypalInvoices = (r.invoices || []).sort((a, b) => {
        // Pendientes primero, luego por fecha desc
        if (a.status !== b.status) {
          if (a.status === "pending") return -1;
          if (b.status === "pending") return 1;
        }
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
    } catch (e) {
      state.paypalInvoices = [];
    }
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
    else if (state.section === "invoices") content = invoicesSection();
    else if (state.section === "tools") content = toolsSection();
    else if (state.section === "challenges") content = opoChallengesSection();
    else if (state.section === "nps") content = npsOpoSection();
    else if (state.section === "predictor") content = predictorSection();
    else if (state.section === "wellbeing") content = wellbeingSection();
    else if (state.section === "simulacro") content = simulacroSection();
    else if (state.section === "community") content = communitySection();
    else if (state.section === "certs") content = certsSection();

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
        else if (state.section === "invoices") await loadInvoices();
        else if (state.section === "tools") await loadTools();
        else if (state.section === "challenges") await loadOpoChallenges();
        else if (state.section === "nps") await loadNps();
        else if (state.section === "predictor") await loadPredictor();
        else if (state.section === "wellbeing") await loadWellbeing();
        else if (state.section === "simulacro") await loadSimulacros();
        else if (state.section === "community") await loadCommunity();
        else if (state.section === "certs") await loadCerts();
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

    // Temario: tabs y personal
    document.querySelectorAll("[data-syllabus-tab]").forEach((b) => {
      b.onclick = () => { state.syllabusTab = b.dataset.syllabusTab; render(); };
    });
    const psForm = document.getElementById("ps-form");
    if (psForm) psForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(psForm);
      try {
        await api.ai.addPersonalTopic({
          number: fd.get("number"),
          title: fd.get("title"),
          block: fd.get("block"),
          difficulty: fd.get("difficulty"),
          priority: fd.get("priority"),
        });
        ui.toast("Tema añadido", "success");
        await loadOpoSyllabus(); render();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };
    document.querySelectorAll("[data-del-personal]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Borrar este tema propio?")) return;
        try {
          await api.ai.deletePersonalTopic(b.dataset.delPersonal);
          await loadOpoSyllabus(); render();
        } catch (err) { ui.toast(err.error || "Error", "error"); }
      };
    });

    // Herramientas IA
    bindTools();

    // Retos
    document.querySelectorAll("[data-opo-take]").forEach((b) => {
      b.onclick = () => openTakeChallengeModal(b.dataset.opoTake);
    });
    document.querySelectorAll("[data-opo-ranking]").forEach((b) => {
      b.onclick = async () => {
        try {
          const r = await api.challenges.ranking(b.dataset.opoRanking);
          openOpoRankingModal(r);
        } catch (err) { ui.toast(err.error || "Error", "error"); }
      };
    });

    // NPS
    const npsForm = document.getElementById("nps-form");
    if (npsForm) npsForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(npsForm);
      const score = Number(fd.get("score"));
      if (Number.isNaN(score)) { ui.toast("Selecciona una puntuación", "warn"); return; }
      const answers = { comment: fd.get("comment") || "" };
      (state.npsSurvey?.questions || []).forEach((q, idx) => {
        const v = fd.get(`answer_${idx}`);
        if (v) answers[`q${idx}`] = v;
      });
      try {
        await api.nps.respond({ templateId: state.npsSurvey?.templateId, score, answers });
        ui.toast("¡Gracias por tu opinión!", "success");
        state.npsAlready = true;
        state.npsSurvey = null;
        render();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };

    // ── FASE 6: Bienestar — formulario de stress check ───────────────────
    const stressForm = document.getElementById("stress-form");
    if (stressForm) stressForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(stressForm);
      const answers = {};
      for (const [k, v] of fd.entries()) answers[k] = Number(v);
      try {
        await api.wellbeing.submitStress(answers, "");
        ui.toast("Respuesta guardada", "success");
        await loadWellbeing();
        render();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };
    document.getElementById("redo-stress")?.addEventListener("click", () => {
      // Forzar re-render del cuestionario aunque ya respondió esta semana
      if (state.stressCheck) state.stressCheck.alreadyAnswered = false;
      render();
    });

    // TTS para recursos de bienestar (Web Speech API client-side)
    document.querySelectorAll("[data-tts-resource]").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.ttsResource;
        const r = (state.wellbeingResources || []).find((x) => x.id === id);
        if (!r) return;
        if (window.__audio.isSpeaking()) {
          window.__audio.stop();
          b.textContent = "🔊 Escuchar";
          return;
        }
        b.textContent = "⏹️ Parar";
        // Limpiamos el body de markdown para que se lea natural
        const text = r.title + ". " + (r.body || "")
          .replace(/^##? .+$/gm, "")
          .replace(/\*\*/g, "")
          .replace(/^[-*] /gm, "")
          .replace(/\s+/g, " ")
          .trim();
        window.__audio.speak(text, {
          onEnd: () => { b.textContent = "🔊 Escuchar"; },
        });
      };
    });

    // ── FASE 6: Simulacro avanzado ───────────────────────────────────────
    document.getElementById("start-simulacro")?.addEventListener("click", openStartSimulacroModal);
    document.querySelectorAll("[data-analysis]").forEach((b) => {
      b.onclick = async () => {
        try {
          const r = await api.simulacros.analysis(b.dataset.analysis);
          state.lastAnalysis = r.analysis;
          render();
        } catch (err) { ui.toast(err.error || "Error", "error"); }
      };
    });

    // Si está corriendo un simulacro, atar handlers de pregunta
    if (state.simulacroActive) {
      const s = state.simulacroActive;
      const idx = s.currentIdx;
      // Iniciar timer de pregunta si no está
      if (!s._timer) {
        s.questionStartedAt = Date.now();
        s._timer = setInterval(() => {
          const t = document.getElementById("q-timer");
          if (t) t.textContent = `${Math.round((Date.now() - s.questionStartedAt) / 1000)}s`;
        }, 1000);
      }
      document.querySelectorAll("[data-q-opt]").forEach((b) => {
        b.onclick = () => {
          const v = Number(b.dataset.qOpt);
          if (!s.localAnswers[idx]) s.localAnswers[idx] = { chosen: null, changes: 0, confidence: null };
          if (s.localAnswers[idx].chosen !== null && s.localAnswers[idx].chosen !== v) {
            s.localAnswers[idx].changes += 1;
          }
          s.localAnswers[idx].chosen = v;
          render();
        };
      });
      document.querySelectorAll("[data-q-conf]").forEach((b) => {
        b.onclick = () => {
          if (!s.localAnswers[idx]) s.localAnswers[idx] = { chosen: null, changes: 0, confidence: null };
          s.localAnswers[idx].confidence = b.dataset.qConf;
          render();
        };
      });
      document.getElementById("q-prev")?.addEventListener("click", () => moveSimulacro(-1));
      document.getElementById("q-next")?.addEventListener("click", () => moveSimulacro(1));
      document.getElementById("q-finish")?.addEventListener("click", finishSimulacro);
    }

    // ── FASE 6 ampliada: Community ────────────────────────────────────────
    if (state.section === "community") {
      document.querySelectorAll("[data-comm-tab]").forEach((b) => {
        b.onclick = async () => {
          state.communityTab = b.dataset.commTab;
          await loadCommunity();
          render();
        };
      });
      // Crear sala
      document.getElementById("new-room")?.addEventListener("click", () => {
        const m = ui.modal({
          title: "Crear sala Pomodoro",
          body: `<form id="room-form" class="form">
            <label>Nombre<input name="name" required placeholder="Estudio Tema 1 / Repaso final…" /></label>
            <div class="grid cols-2">
              <label>Modo<select name="mode"><option value="50_10">50 min / 10 min</option><option value="25_5">25 min / 5 min</option></select></label>
              <label>Capacidad<input name="capacity" type="number" min="2" max="8" value="4" /></label>
            </div>
          </form>`,
          footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="room-save">Crear</button>`,
        });
        m.el.querySelector("#room-save").onclick = async () => {
          const fd = new FormData(m.el.querySelector("#room-form"));
          try {
            const r = await api.community.createRoom(Object.fromEntries(fd.entries()));
            await joinRoom(r.room.id);
            m.close();
          } catch (e) { ui.toast(e.error || "Error", "error"); }
        };
      });
      // Unirse a sala
      document.querySelectorAll("[data-join-room]").forEach((b) => {
        b.onclick = () => joinRoom(b.dataset.joinRoom);
      });
      // Salir de sala
      document.getElementById("leave-room")?.addEventListener("click", async () => {
        if (!state.activeRoom) return;
        try {
          await api.community.leaveRoom(state.activeRoom.id);
          if (state._roomTimer) clearInterval(state._roomTimer);
          if (state._roomUnsub) state._roomUnsub();
          state.activeRoom = null;
          state._roomTimer = null;
          state._roomUnsub = null;
          await loadCommunity();
          render();
        } catch (e) { ui.toast(e.error || "Error", "error"); }
      });
      // Crear duelo
      document.getElementById("new-duel")?.addEventListener("click", () => {
        const m = ui.modal({
          title: "Retar a un compañero",
          body: `<form id="duel-form" class="form">
            <label>Nombre del reto<input name="challengeName" placeholder="Reto rápido / 10 minutos" /></label>
            <label>Email del oponente<input name="opponentEmail" type="email" required /></label>
            <div class="grid cols-2">
              <label>Nº preguntas<input name="count" type="number" min="3" max="20" value="10" /></label>
              <label>Proceso<select name="processId">${(state.processes || []).map((p) => `<option value="${ui.esc(p.id)}">${ui.esc(p.name || p.id)}</option>`).join("")}</select></label>
            </div>
          </form>`,
          footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="duel-save">Lanzar reto</button>`,
        });
        m.el.querySelector("#duel-save").onclick = async () => {
          const fd = new FormData(m.el.querySelector("#duel-form"));
          try {
            await api.community.createDuel(Object.fromEntries(fd.entries()));
            ui.toast("Reto enviado", "success");
            m.close();
            state.communityTab = "duels";
            await loadCommunity();
            render();
          } catch (e) { ui.toast(e.error || "Error", "error"); }
        };
      });
      // Aceptar duelo (lanza el flujo simplificado de respuestas)
      document.querySelectorAll("[data-accept-duel]").forEach((b) => {
        b.onclick = async () => {
          try {
            const r = await api.community.acceptDuel(b.dataset.acceptDuel);
            // Versión simple: pedimos respuestas de forma encadenada
            const answers = [];
            const startedAt = Date.now();
            for (let i = 0; i < r.questions.length; i++) {
              const q = r.questions[i];
              const txt = `Pregunta ${i + 1}/${r.questions.length}\n\n${q.text}\n\n` +
                q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("\n") +
                `\n\nResponde con A, B, C o D:`;
              const a = (prompt(txt) || "").toUpperCase().slice(0, 1);
              const chosen = ["A","B","C","D"].indexOf(a);
              if (chosen < 0) { ui.toast("Reto cancelado", "warn"); return; }
              answers.push({ qbId: q.qbId, chosen, timeMs: Date.now() - startedAt });
            }
            await api.community.submitDuel(b.dataset.acceptDuel, answers);
            ui.toast("Respuestas enviadas", "success");
            await loadCommunity(); render();
          } catch (e) { ui.toast(e.error || "Error", "error"); }
        };
      });
      // Nuevo hilo de foro
      document.getElementById("new-thread")?.addEventListener("click", () => {
        const m = ui.modal({
          title: "Abrir hilo en el foro",
          body: `<form id="thread-form" class="form">
            <label>Título<input name="title" required /></label>
            <label>Tag (opcional)<input name="topicTag" placeholder="ej. lpac, t1, plazos" /></label>
            <label>Pregunta<textarea name="body" rows="5" required></textarea></label>
          </form>`,
          footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="thread-save">Publicar</button>`,
        });
        m.el.querySelector("#thread-save").onclick = async () => {
          const fd = new FormData(m.el.querySelector("#thread-form"));
          try {
            await api.community.createThread(Object.fromEntries(fd.entries()));
            ui.toast("Hilo publicado", "success");
            m.close();
            await loadCommunity(); render();
          } catch (e) { ui.toast(e.error || "Error", "error"); }
        };
      });
      // Solicitar mentor
      document.querySelectorAll("[data-request-mentor]").forEach((b) => {
        b.onclick = async () => {
          const message = prompt("Cuéntale al mentor por qué quieres su orientación (1-2 frases):");
          if (!message) return;
          try {
            await api.community.requestMentoring(b.dataset.requestMentor, message);
            ui.toast("Solicitud enviada al mentor", "success");
          } catch (e) { ui.toast(e.error || "Error", "error"); }
        };
      });
    }

    // ── FASE 6 ampliada: Mis certificaciones ────────────────────────────
    if (state.section === "certs") {
      document.querySelectorAll("[data-issue-cert]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("¿Reclamar este certificado? Quedará registrado en tu perfil.")) return;
          try {
            await api.certifications.issue(b.dataset.issueCert);
            ui.toast("Certificado emitido 🎖️", "success");
            await loadCerts(); render();
          } catch (e) { ui.toast(e.error || "Error", "error"); }
        };
      });
    }
  }

  async function joinRoom(roomId) {
    try {
      await api.community.joinRoom(roomId);
      const update = async () => {
        try {
          const r = await api.community.roomState(roomId);
          state.activeRoom = r;
          if (state.section === "community" && state.communityTab === "rooms") render();
        } catch { /* room cerrada */ }
      };
      // Carga inicial
      await update();
      // Si tenemos WebSocket, suscribimos al canal y reducimos polling a 60s.
      // Si no, polling cada 10s como fallback.
      if (window.__realtime) {
        // Cancelar suscripción previa si existía
        if (state._roomUnsub) state._roomUnsub();
        state._roomUnsub = window.__realtime.subscribe(`room:${roomId}`, () => {
          // Cualquier evento del canal → refetch del estado
          update();
        });
        // Polling de seguridad cada 60s para sincronizar el reloj
        if (state._roomTimer) clearInterval(state._roomTimer);
        state._roomTimer = setInterval(update, 60000);
      } else {
        if (state._roomTimer) clearInterval(state._roomTimer);
        state._roomTimer = setInterval(update, 10000);
      }
      render();
    } catch (e) { ui.toast(e.error || "Error", "error"); }
  }

  function openStartSimulacroModal() {
    const procs = (state.processes || []).filter((p) => p);
    const m = ui.modal({
      title: "Empezar simulacro avanzado",
      body: `<form id="sim-start" class="form">
        <p class="muted text-sm">Cada pregunta registra tu tiempo, los cambios y la confianza que declares.</p>
        <label>Proceso<select name="processId" required>
          ${procs.map((p) => `<option value="${ui.esc(p.id)}">${ui.esc(p.name || p.id)}</option>`).join("")}
        </select></label>
        <label>Número de preguntas<input name="count" type="number" value="20" min="5" max="100" /></label>
      </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="sim-go">Empezar</button>`,
    });
    m.el.querySelector("#sim-go").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#sim-start"));
      try {
        const r = await api.simulacros.begin({
          processId: fd.get("processId"),
          count: Number(fd.get("count")),
        });
        state.simulacroActive = {
          attemptId: r.attemptId,
          questions: r.questions,
          currentIdx: 0,
          questionStartedAt: Date.now(),
          localAnswers: {},
          _timer: null,
        };
        m.close();
        render();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };
  }

  async function moveSimulacro(delta) {
    const s = state.simulacroActive;
    if (!s) return;
    // Antes de moverse, persistir la respuesta actual
    await persistCurrentAnswer();
    s.currentIdx = Math.max(0, Math.min(s.questions.length - 1, s.currentIdx + delta));
    s.questionStartedAt = Date.now();
    render();
  }

  async function persistCurrentAnswer() {
    const s = state.simulacroActive;
    if (!s) return;
    const idx = s.currentIdx;
    const q = s.questions[idx];
    const a = s.localAnswers[idx];
    if (!a || a.chosen === null) return;
    const timeMs = Date.now() - s.questionStartedAt;
    try {
      await api.simulacros.answer(s.attemptId, {
        qbId: q.qbId,
        chosen: a.chosen,
        timeMs: (a.totalTimeMs || 0) + timeMs,
        changes: a.changes,
        confidence: a.confidence || "doubt",
      });
      a.totalTimeMs = (a.totalTimeMs || 0) + timeMs;
    } catch (e) {
      console.error("save answer", e);
    }
  }

  async function finishSimulacro() {
    const s = state.simulacroActive;
    if (!s) return;
    if (!confirm("¿Terminar el simulacro? No podrás volver a las preguntas.")) return;
    await persistCurrentAnswer();
    try {
      const r = await api.simulacros.finish(s.attemptId);
      if (s._timer) clearInterval(s._timer);
      state.simulacroActive = null;
      state.lastAnalysis = r.analysis;
      ui.toast(`Simulacro terminado: ${r.attempt.score}/10`, "success");
      await loadSimulacros();
      render();
    } catch (err) { ui.toast(err.error || "Error", "error"); }
  }

  // ── Helpers para herramientas IA y retos ──────────────────────────────────

  function bindTools() {
    // Cuando se cambia el origen del temario, repoblar el select de temas
    function onSourceChange(toolKey, selectId) {
      const src = document.querySelector(`[data-tool-source="${toolKey}"]`);
      const sel = document.getElementById(selectId);
      if (!src || !sel) return;
      src.onchange = () => {
        const list = src.value === "personal"
          ? (state.personalSyllabus?.topics || [])
          : (state.opoSyllabus?.topics || []);
        sel.innerHTML = list.map((t) => `<option value="${ui.esc(t.id)}">${ui.esc(t.number || "")} ${ui.esc(t.title)}</option>`).join("");
      };
    }
    onSourceChange("test", "test-topic");
    onSourceChange("summary", "sum-topic");
    onSourceChange("map", "map-topic");

    const wrap = (formId, fn, label) => {
      const f = document.getElementById(formId);
      if (!f) return;
      f.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const btn = f.querySelector("button[type=submit]");
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = "Generando…";
        try {
          await fn(fd);
          ui.toast(`${label} generado`, "success");
          await loadTools(); render();
        } catch (err) {
          ui.toast(err.error === "ai_failed" ? "Error de IA: comprueba tu API key" : (err.error || "Error"), "error");
        } finally {
          btn.disabled = false; btn.textContent = orig;
        }
      };
    };
    wrap("gen-test-form", (fd) => api.ai.generateTest({
      topicId: fd.get("topicId"),
      source: fd.get("source"),
      count: Number(fd.get("count")) || 10,
      type: fd.get("type"),
    }), "Test");
    wrap("gen-summary-form", (fd) => api.ai.generateSummary({
      topicId: fd.get("topicId"),
      source: fd.get("source"),
      mode: fd.get("mode"),
    }), "Resumen");
    wrap("gen-map-form", (fd) => api.ai.generateConceptMap({
      topicId: fd.get("topicId"),
      source: fd.get("source"),
    }), "Mapa conceptual");

    document.querySelectorAll("[data-view-artifact]").forEach((b) => {
      b.onclick = () => {
        const a = (state.aiArtifacts || []).find((x) => x.id === b.dataset.viewArtifact);
        if (a) openArtifactModal(a);
      };
    });
    document.querySelectorAll("[data-del-artifact]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Borrar este resultado generado?")) return;
        try {
          await api.ai.deleteArtifact(b.dataset.delArtifact);
          await loadTools(); render();
        } catch (err) { ui.toast(err.error || "Error", "error"); }
      };
    });
  }

  function openArtifactModal(a) {
    let body = "";
    if (a.kind === "test") {
      const qs = a.payload?.questions || [];
      if (!qs.length && a.payload?.raw) body = `<pre style="white-space:pre-wrap;font-size:12px;">${ui.esc(a.payload.raw)}</pre>`;
      else body = qs.map((q, i) => `
        <div class="card mb-3">
          <strong>${i + 1}. ${ui.esc(q.q)}</strong>
          <ol type="A" style="margin:8px 0 0 20px;">
            ${(q.options || []).map((o, idx) => `<li ${idx === q.correct ? 'style="font-weight:700;color:var(--success,#0c8f6f);"' : ""}>${ui.esc(o)}${idx === q.correct ? " ✓" : ""}</li>`).join("")}
          </ol>
          ${q.explanation ? `<p class="muted text-sm mt-2">${ui.esc(q.explanation)}</p>` : ""}
        </div>`).join("");
    } else if (a.kind === "summary") {
      const text = a.payload?.text || "";
      // Renderizado básico de markdown: cabeceras, listas, párrafos
      const html = ui.esc(text)
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1>$1</h1>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/^- (.+)$/gm, "<li>$1</li>")
        .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
        .replace(/\n\n/g, "</p><p>");
      body = `<div style="line-height:1.6;"><p>${html}</p></div>`;
    } else if (a.kind === "conceptMap") {
      const root = a.payload?.root;
      if (!root) body = `<pre>${ui.esc(JSON.stringify(a.payload, null, 2))}</pre>`;
      else {
        const renderNode = (n, depth = 0) => {
          if (!n) return "";
          const pad = depth * 18;
          return `<div style="padding-left:${pad}px;margin-bottom:6px;"><span class="pill ${depth === 0 ? "" : "muted"}">${ui.esc(n.label)}</span></div>` +
            (n.children || []).map((c) => renderNode(c, depth + 1)).join("");
        };
        body = `<div>${renderNode(root)}</div>`;
      }
    } else {
      body = `<pre>${ui.esc(JSON.stringify(a.payload, null, 2))}</pre>`;
    }
    ui.modal({
      title: `${a.kind === "test" ? "📝 Test" : a.kind === "summary" ? "📄 Resumen" : "🧠 Mapa"}: ${a.topicTitle || ""}`,
      body,
      footer: `<button class="ghost" data-close>Cerrar</button>`,
    });
  }

  function openTakeChallengeModal(challengeId) {
    // En producción habría que cargar las preguntas del reto. Como el endpoint
    // /challenges para opositor las oculta (questions:undefined), abrimos un
    // modal sencillo para empezar y vamos pidiendo el GET completo del reto.
    // Para esta MVP, hacemos un GET puntual via la lista del preparador
    // (compatible) o le pedimos al servidor que devuelva las preguntas al
    // empezar. Aquí simplemente lanzamos el reto vacío y mostramos resultado.
    ui.modal({
      title: "Empezar reto",
      body: `<p>Estás a punto de empezar el reto. Una vez comiences, dispondrás del tiempo configurado por tu preparador.</p>
        <p class="muted text-sm">En esta versión inicial, el reto se envía con tus respuestas tal como las marques. Tu puntuación aparecerá en el ranking.</p>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="start-ch">Empezar</button>`,
    }).el.querySelector("#start-ch").onclick = async function () {
      const startedAt = Date.now();
      try {
        // Estructura mínima — en versión completa, mostrar preguntas y recoger respuestas
        const r = await api.challenges.attempt(challengeId, {
          answers: {},
          durationSec: Math.round((Date.now() - startedAt) / 1000),
        });
        ui.toast(`Resultado: ${r.summary?.correct || 0}/${r.summary?.total || 0} (${r.summary?.score || 0} pts)`, "success");
        this.closest(".modal-bg")?.remove();
        await loadOpoChallenges(); render();
      } catch (err) {
        ui.toast(err.error === "ranking_not_opted_in" ? "Activa los rankings en tu perfil primero" : (err.error || "Error"), "error");
      }
    };
  }

  function openOpoRankingModal(data) {
    const ranking = data.ranking || [];
    const me = app.currentUser?.id;
    ui.modal({
      title: `Ranking: ${data.challenge?.name || ""}`,
      body: `
        <div class="table">
          <div class="table-row header"><span>#</span><span>Opositor</span><span>Aciertos</span><span>Puntuación</span></div>
          ${ranking.length === 0 ? `<div class="empty-state">Aún no hay intentos.</div>` : ranking.map((r) => `
            <div class="table-row" ${r.opositorId === me ? 'style="background:rgba(21,94,168,0.08);"' : ""}>
              <span><strong>#${r.position}</strong></span>
              <span>${ui.esc(r.opositorName)}${r.opositorId === me ? " (tú)" : ""}</span>
              <span>${r.correct}/${r.total}</span>
              <span><strong>${r.score}</strong></span>
            </div>`).join("")}
        </div>`,
      footer: `<button class="ghost" data-close>Cerrar</button>`,
    });
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
      const data = {
        name: fd.get("name"),
        phone: fd.get("phone"),
        whatsapp: fd.get("whatsapp") || "",
        whatsappOptIn: form.elements["whatsappOptIn"]?.checked || false,
      };
      const password = fd.get("password");
      if (password) data.password = password;
      try {
        await api.opositor.updateProfile(data);
        ui.toast("Perfil actualizado", "success");
        // Refrescar /me para que app.currentUser tenga el nuevo whatsapp/optIn
        const me = await api.auth.me();
        app.currentUser = me.user;
        await refresh();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };

    // Ranking opt-in (~20:26)
    const rankingForm = document.getElementById("ranking-form");
    if (rankingForm) rankingForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.opositor.updateProfile({
          rankingOptIn: rankingForm.elements["rankingOptIn"]?.checked || false,
        });
        ui.toast("Preferencia guardada", "success");
        const me = await api.auth.me();
        app.currentUser = me.user;
        render();
      } catch (err) { ui.toast(err.error || "Error", "error"); }
    };

    // IA personal (~20:53)
    const aiForm = document.getElementById("ai-form");
    if (aiForm) aiForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(aiForm);
      const ai = {
        enabled: aiForm.elements["ai.enabled"]?.checked || false,
        provider: fd.get("ai.provider") || "",
        model: fd.get("ai.model") || "",
      };
      const newKey = fd.get("ai.apiKey");
      if (newKey) ai.apiKey = newKey;
      try {
        await api.opositor.updateProfile({ ai });
        ui.toast("IA personal guardada", "success");
        const me = await api.auth.me();
        app.currentUser = me.user;
        render();
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
    const registry = p?.registry || [];
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
        </form>

        ${isNew ? "" : `
          <div class="divider"></div>
          <h3 style="font-size:0.95rem;">📂 Registro de presentación</h3>
          <p class="muted text-sm mb-3">Sube los documentos que has presentado y deja constancia de la fecha. Te servirá si te lo piden más tarde.</p>
          <div id="registry-list">
            ${registry.length === 0 ? `<p class="muted text-sm">Aún no has registrado nada.</p>` : registry.map((e) => `
              <div class="file-pill" data-reg="${e.id}">
                <div class="icon">📎</div>
                <div class="meta">
                  <strong>${ui.esc(e.fileName || "Documento")}</strong>
                  <small>Presentado el ${ui.esc((e.presentedAt || "").slice(0, 10))}${e.note ? ` · ${ui.esc(e.note)}` : ""}</small>
                </div>
                ${e.downloadUrl ? `<a class="ghost sm" href="${ui.esc(e.downloadUrl)}" target="_blank">Abrir</a>` : ""}
                <button type="button" class="ghost sm" data-del-reg="${e.id}">Quitar</button>
              </div>`).join("")}
          </div>
          <div class="card mt-3">
            <h4 style="font-size:0.9rem;">+ Añadir entrada al registro</h4>
            <div class="grid cols-2">
              <label>Fecha de presentación<input type="date" id="reg-date" value="${new Date().toISOString().slice(0, 10)}" /></label>
              <label>Nota (opcional)<input id="reg-note" placeholder="p.ej. Sede electrónica, n.º registro 12345" /></label>
            </div>
            <div id="reg-dz"></div>
          </div>
        `}`,
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

    // Registro: dropzone + borrar entradas (solo si edición)
    if (!isNew) {
      const dzEl = m.el.querySelector("#reg-dz");
      if (dzEl) {
        const dz = ui.dropzone({
          title: "Adjuntar documento presentado",
          hint: "Arrastra aquí (PDF, imagen, etc.)",
          accept: "*",
          onUpload: async (f) => api.files.upload(f, "procedure"),
          onComplete: async (res) => {
            if (!res?.file?.id) return;
            const presentedAt = m.el.querySelector("#reg-date").value || new Date().toISOString().slice(0, 10);
            const note = m.el.querySelector("#reg-note").value || "";
            try {
              await api.proceduresExtra.addRegistry(p.id, {
                fileId: res.file.id,
                fileName: res.file.name,
                presentedAt,
                note,
              });
              ui.toast("Documento registrado", "success");
              await loadProcedures(); render();
              m.close();
              // Reabrir con datos frescos
              const fresh = (state.procedures || []).find((x) => x.id === p.id);
              if (fresh) openProcedureModal(fresh);
            } catch (err) { ui.toast(err.error || "Error", "error"); }
          },
        });
        dzEl.innerHTML = dz.html("reg-dz-zone");
        dz.bind(dzEl.querySelector("#reg-dz-zone"));
      }
      m.el.querySelectorAll("[data-del-reg]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("¿Quitar esta entrada del registro?")) return;
          try {
            await api.proceduresExtra.removeRegistry(p.id, b.dataset.delReg);
            ui.toast("Entrada quitada", "success");
            await loadProcedures(); render();
            m.close();
            const fresh = (state.procedures || []).find((x) => x.id === p.id);
            if (fresh) openProcedureModal(fresh);
          } catch (err) { ui.toast(err.error || "Error", "error"); }
        };
      });
    }
  }

  return {
    show: async () => {
      try { await load(); }
      catch { state.data = { profile: { commitment: {} }, plan: { tasks: [] }, materials: [] }; }
      render();
    },
  };
})();
