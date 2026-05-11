// ─────────────────────────────────────────────────────────────────────────────
// Vista del administrador de academia. Personaliza completamente su entorno:
//   - Marca: logo, colores, lema (con preview en vivo)
//   - Contacto y datos fiscales
//   - Integraciones: Stripe, Email, Storage, IA, Moodle, Redsys, Legal
//   - Usuarios y roles (alta, edición, activar/desactivar)
//   - Asignaciones preparador ↔ opositor con histórico
//   - Planes propios y suscripciones
//   - Avisos generales
// ─────────────────────────────────────────────────────────────────────────────

const adminView = (() => {
  let state = {
    section: "dashboard",
    org: null,
    dashboard: null,
    users: [],
    assignments: [],
    history: [],
    plans: { global: [], own: [] },
    subs: [],
    configTab: "branding",
  };

  async function load() {
    try {
      const [o, d, u, a, p] = await Promise.all([
        api.admin.org(),
        api.admin.dashboard(),
        api.admin.users(),
        api.admin.assignments(),
        api.admin.plans(),
      ]);
      state.org = o.organization;
      state.dashboard = d;
      state.users = u.users;
      state.assignments = a.assignments;
      state.history = a.history;
      state.plans = p;
      try {
        const s = await api.admin.subscriptions();
        state.subs = s.subscriptions;
      } catch {
        state.subs = [];
      }
    } catch (e) {
      console.error(e);
      ui.toast("Error cargando datos de la academia", "error");
    }
  }

  function shell(content) {
    const orgName = state.org?.name || "Academia";
    const initials = state.org?.branding?.initials || ui.initials(orgName);
    const color = state.org?.branding?.primaryColor || "#155ea8";
    return `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand-row">
            <div class="brand-mark" style="background:${ui.esc(color)};color:white;">${ui.esc(initials)}</div>
            <div><strong style="color:white;">${ui.esc(orgName)}</strong><small>${ui.esc(state.org?.branding?.tagline || "Panel de administración")}</small></div>
          </div>
          <div class="org-badge"><strong>${ui.esc(app.currentUser.name)}</strong>Administradora · ${ui.esc(app.currentUser.email)}</div>
          <button data-section="config" class="ghost sm" style="margin:0 14px 12px;width:calc(100% - 28px);${state.section === "config" ? "border-color:var(--brand);color:var(--brand);" : ""}">⚙️ Configuración</button>
          <nav class="nav">
            <button data-section="dashboard" ${state.section === "dashboard" ? 'class="active"' : ""}>📊 Resumen</button>
            <button data-section="users" ${state.section === "users" ? 'class="active"' : ""}>👥 Usuarios y roles</button>
            <button data-section="assignments" ${state.section === "assignments" ? 'class="active"' : ""}>🔗 Asignaciones</button>
            <button data-section="plans" ${state.section === "plans" ? 'class="active"' : ""}>💳 Planes y suscripciones</button>
            <button data-section="nps" ${state.section === "nps" ? 'class="active"' : ""}>📊 Encuesta NPS</button>
          </nav>
          <div class="sidebar-footer">
            <button class="ghost" id="logout-btn">Cerrar sesión</button>
          </div>
        </aside>
        <main class="main">${content}</main>
      </div>`;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  function dashboardSection() {
    const t = state.dashboard?.totals || {};
    const load = state.dashboard?.loadByPreparador || [];
    return `
      <div class="section-head">
        <div><p class="eyebrow">Operación</p><h1>Resumen de ${ui.esc(state.org?.name || "")}</h1></div>
      </div>
      <div class="grid cols-4 mb-4">
        <div class="card metric"><span class="label">Usuarios</span><strong>${t.users || 0}</strong><span class="muted text-xs">${t.opositores || 0} opositores · ${t.preparadores || 0} preparadores</span></div>
        <div class="card metric"><span class="label">Cuentas activas</span><strong>${t.activeAccounts ?? t.activeSubscriptions ?? 0}</strong><span class="muted text-xs">${t.activeSubscriptions || 0} suscripciones + admin</span></div>
        <div class="card metric"><span class="label">Ingresos mensuales</span><strong>${ui.formatEUR(t.monthlyRevenue)}</strong></div>
        <div class="card metric"><span class="label">Correcciones pendientes</span><strong>${t.pendingCorrections || 0}</strong></div>
      </div>
      <div class="card">
        <h2>Carga por preparador</h2>
        <p class="muted text-sm mb-4">Número de opositores asignados, interacciones del mes y correcciones pendientes.</p>
        <div class="table">
          <div class="table-row header"><span>Preparador</span><span>Opositores</span><span>Interacciones</span><span>Pendientes</span><span></span></div>
          ${load
            .map(
              (l) => `
            <div class="table-row">
              <span><strong>${ui.esc(l.name)}</strong></span>
              <span><span class="pill">${l.opositoresAssigned}</span></span>
              <span>${l.interactionsThisMonth}</span>
              <span><span class="pill ${l.pendingCorrections ? "warn" : "muted"}">${l.pendingCorrections}</span></span>
              <span class="actions"><button class="ghost sm" disabled>Ver detalle</button></span>
            </div>`,
            )
            .join("") || `<div class="empty-state">Sin preparadores aún.</div>`}
        </div>
      </div>`;
  }

  // ── Usuarios ───────────────────────────────────────────────────────────────

  function usersSection() {
    const byRole = (r) => state.users.filter((u) => u.role === r);
    return `
      <div class="section-head">
        <div><p class="eyebrow">Equipo y alumnos</p><h1>Usuarios y roles</h1></div>
        <div class="row gap-2">
          <button class="ghost" id="bulk-users">📥 Carga masiva CSV</button>
          <button class="btn" id="new-user">+ Nuevo usuario</button>
        </div>
      </div>
      ${["admin", "preparador", "opositor"]
        .map(
          (role) => `
        <div class="card mb-4">
          <h2 style="text-transform: capitalize;">${role}s <span class="pill muted">${byRole(role).length}</span></h2>
          <div class="table mt-4">
            <div class="table-row header">
              <span>Nombre</span><span>Email</span>
              <span>${role === "preparador" ? "Carga" : role === "opositor" ? "Plan" : "Rol"}</span>
              <span>Estado</span><span></span>
            </div>
            ${byRole(role)
              .map(
                (u) => `
              <div class="table-row">
                <span><strong>${ui.esc(u.name)}</strong>${u.preparadorName ? `<br/><small class="muted">Preparador: ${ui.esc(u.preparadorName)}</small>` : ""}</span>
                <span><small>${ui.esc(u.email)}</small></span>
                <span>${
                  role === "preparador"
                    ? `<span class="pill">${u.opositoresAssigned || 0} opositores</span>`
                    : role === "opositor"
                    ? `<span class="pill muted">${ui.esc(u.subscriptionPlanId || "free")}</span>`
                    : `<span class="pill muted">${ui.esc(u.role)}</span>`
                }</span>
                <span><span class="pill ${u.status === "active" ? "success" : "muted"}">${u.status}</span></span>
                <span class="actions">
                  <button class="ghost sm" data-edit-user="${u.id}">Editar</button>
                  <button class="ghost sm" data-toggle-user="${u.id}">${u.status === "active" ? "Desactivar" : "Activar"}</button>
                </span>
              </div>`,
              )
              .join("") || `<div class="empty-state">Sin ${role}s todavía.</div>`}
          </div>
        </div>`,
        )
        .join("")}
    `;
  }

  // ── Asignaciones ───────────────────────────────────────────────────────────

  function assignmentsSection() {
    const active = state.assignments.filter((a) => a.active);
    const usersById = Object.fromEntries(state.users.map((u) => [u.id, u]));

    return `
      <div class="section-head">
        <div><p class="eyebrow">Relaciones</p><h1>Asignaciones preparador ↔ opositor</h1></div>
        <button class="btn" id="new-assignment">+ Nueva asignación</button>
      </div>
      <div class="card mb-4">
        <h2>Activas <span class="pill muted">${active.length}</span></h2>
        <div class="table mt-4">
          <div class="table-row header"><span>Opositor</span><span>Preparador</span><span>Desde</span><span>Estado</span><span></span></div>
          ${active
            .map(
              (a) => `
            <div class="table-row">
              <span><strong>${ui.esc(usersById[a.opositorId]?.name || "—")}</strong></span>
              <span>${ui.esc(usersById[a.preparadorId]?.name || "—")}</span>
              <span>${ui.esc(a.since)}</span>
              <span><span class="pill success">activa</span></span>
              <span class="actions"><button class="ghost sm" data-reassign="${a.opositorId}">Reasignar</button></span>
            </div>`,
            )
            .join("")}
        </div>
      </div>
      <div class="card">
        <h2>Histórico de cambios <span class="pill muted">${state.history.length}</span></h2>
        <p class="muted text-sm">Toda reasignación queda registrada con fecha, motivo y autor.</p>
        <div class="table mt-4">
          ${state.history.length === 0 ? `<div class="empty-state">Sin cambios registrados todavía.</div>` : ""}
          ${state.history
            .map(
              (h) => `
            <div class="table-row">
              <span><strong>${ui.esc(usersById[h.opositorId]?.name || "—")}</strong></span>
              <span>${ui.esc(usersById[h.previousPreparadorId]?.name || "—")} → <strong>${ui.esc(usersById[h.newPreparadorId]?.name || "—")}</strong></span>
              <span>${ui.esc((h.changedAt || "").slice(0, 10))}</span>
              <span><small class="muted">${ui.esc(h.reason || "—")}</small></span>
              <span class="actions"><small class="muted">por ${ui.esc(usersById[h.changedBy]?.name || "—")}</small></span>
            </div>`,
            )
            .join("")}
        </div>
      </div>`;
  }

  // ── Planes y suscripciones ────────────────────────────────────────────────

  function plansSection() {
    return `
      <div class="section-head">
        <div><p class="eyebrow">Catálogo</p><h1>Planes y suscripciones</h1></div>
        <button class="btn" id="new-plan">+ Plan propio</button>
      </div>

      <div class="card mb-4">
        <h2>Planes globales (plataforma)</h2>
        <p class="muted text-sm mb-4">Disponibles para todas las academias. Puedes activar u ocultar cada plan globalmente desde aquí.</p>
        <div class="grid cols-3">
          ${state.plans.global
            .map(
              (p) => {
                const enabled = p.enabledForOrg !== false;
                const subs = p.activeSubscribers || 0;
                return `
            <div class="card" style="border-color: var(--line-soft); ${enabled ? "" : "opacity:0.55;"}">
              <div class="row">
                <p class="eyebrow">${ui.esc(p.line || "oposiciones")} · ${ui.esc(p.target)}</p>
                <button class="ghost sm" data-toggle-global="${p.id}">${enabled ? "Ocultar" : "Activar"}</button>
              </div>
              <h3>${ui.esc(p.name)}</h3>
              <div style="font-size: 1.4rem; font-weight: 800; margin: 8px 0;">${ui.formatEUR(p.price)}<small class="muted" style="font-weight:500;">/mes</small></div>
              ${subs ? `<div class="pill success" style="margin-bottom:8px;">${subs} suscriptor${subs === 1 ? "" : "es"}</div>` : ""}
              <ul style="padding-left: 18px; font-size: 0.82rem; color: var(--muted); margin: 0;">
                ${(p.features || []).map((f) => `<li>${ui.esc(f)}</li>`).join("")}
              </ul>
            </div>`;
              },
            )
            .join("")}
        </div>
      </div>

      <div class="card mb-4">
        <h2>Mis planes <span class="pill muted">${state.plans.own.length}</span></h2>
        <p class="muted text-sm mb-4">Planes propios de tu academia. Suman a los globales.</p>
        <div class="grid cols-3">
          ${state.plans.own
            .map(
              (p) => `
            <div class="card">
              <p class="eyebrow">${ui.esc(p.target)}</p>
              <h3>${ui.esc(p.name)}</h3>
              <div style="font-size: 1.4rem; font-weight: 800; margin: 8px 0;">${ui.formatEUR(p.price)}<small class="muted" style="font-weight:500;">/mes</small></div>
              <ul style="padding-left: 18px; font-size: 0.82rem; color: var(--muted); margin: 0 0 12px;">
                ${(p.features || []).map((f) => `<li>${ui.esc(f)}</li>`).join("")}
              </ul>
              <button class="ghost sm" data-edit-plan="${p.id}">Editar</button>
            </div>`,
            )
            .join("") || `<div class="empty-state">Aún no tienes planes propios.</div>`}
        </div>
      </div>

      <div class="card">
        <h2>Suscripciones activas <span class="pill muted">${state.subs.length}</span></h2>
        <div class="table mt-4">
          <div class="table-row header"><span>Usuario</span><span>Plan</span><span>Importe</span><span>Renovación</span><span></span></div>
          ${state.subs
            .map(
              (s) => `
            <div class="table-row">
              <span><strong>${ui.esc(s.userName)}</strong><br/><small class="muted">${ui.esc(s.userEmail)}</small></span>
              <span>${ui.esc(s.planName)}</span>
              <span><strong>${ui.formatEUR(s.amount)}</strong></span>
              <span>${ui.esc(s.renewalDate || "—")}</span>
              <span><span class="pill success">${s.status}</span></span>
            </div>`,
            )
            .join("") || `<div class="empty-state">Sin suscripciones todavía.</div>`}
        </div>
      </div>`;
  }

  // ── Configuración (con tabs) ──────────────────────────────────────────────

  function configSection() {
    // Reorganizado según transcripción ~20:02
    const tabs = [
      { id: "branding", label: "Marca" },
      { id: "contact", label: "Contacto" },
      { id: "billing", label: "Datos fiscales" },
      { id: "comms", label: "Email y Moodle" },
      { id: "payments", label: "Pagos" },
      { id: "ai_storage", label: "Almacenamiento e IA" },
      { id: "videoconf", label: "Videoconferencia" },
      { id: "defaults", label: "Avisos y defaults" },
      { id: "legal", label: "Legal" },
    ];
    return `
      <div class="section-head">
        <div><p class="eyebrow">Mi academia</p><h1>Configuración</h1></div>
      </div>
      <div class="tabs">
        ${tabs.map((t) => `<button data-config-tab="${t.id}" class="${state.configTab === t.id ? "active" : ""}">${t.label}</button>`).join("")}
      </div>
      <div id="config-content">${configTabContent()}</div>`;
  }

  function configTabContent() {
    if (state.configTab === "branding") return configBranding();
    if (state.configTab === "contact") return configContact();
    if (state.configTab === "billing") return configBilling();
    if (state.configTab === "comms") return configComms();
    if (state.configTab === "payments") return configPayments();
    if (state.configTab === "ai_storage") return configAiStorage();
    if (state.configTab === "videoconf") return configVideoconf();
    if (state.configTab === "defaults") return configDefaults();
    if (state.configTab === "legal") return configLegal();
    // Compatibilidad con el viejo tab integrations
    if (state.configTab === "integrations") return configIntegrations();
    return "";
  }

  function configBranding() {
    const b = state.org?.branding || {};
    return `
      <form class="form" id="branding-form">
        <div class="grid cols-2">
          <div class="card">
            <h3>Identidad</h3>
            <label>Nombre comercial<input name="name" value="${ui.esc(state.org?.name || "")}" /></label>
            <label>Lema<input name="tagline" value="${ui.esc(b.tagline || "")}" /></label>
            <label>Iniciales (badge)<input name="initials" maxlength="3" value="${ui.esc(b.initials || "")}" /></label>
            <div class="grid cols-3">
              <label>Color principal<input class="color-input" name="primary" type="color" value="${ui.esc(b.primaryColor || "#155ea8")}"/></label>
              <label>Color oscuro<input class="color-input" name="secondary" type="color" value="${ui.esc(b.secondaryColor || "#08264a")}"/></label>
              <label>Acento<input class="color-input" name="accent" type="color" value="${ui.esc(b.accentColor || "#0c8f6f")}"/></label>
            </div>
            <label>URL del logo<input name="logo" value="${ui.esc(b.logo || "")}" placeholder="https://..." /></label>
            <label>URL del favicon<input name="favicon" value="${ui.esc(b.favicon || "")}" placeholder="https://..." /></label>
            <p class="help">Próximamente: subida directa de archivos al storage de la plataforma.</p>
          </div>
          <div class="card">
            <h3>Vista previa</h3>
            <p class="muted text-sm mb-4">Así se verá tu academia en el panel y en el login.</p>
            <div class="card" id="brand-preview" style="border:1px solid var(--line); padding: 18px;">
              <div class="brand-row">
                <div class="brand-mark" id="prev-mark" style="background: ${ui.esc(b.primaryColor || "#155ea8")}; color: white;">${ui.esc(b.initials || "AD")}</div>
                <div><strong id="prev-name" style="font-size: 1.05rem;">${ui.esc(state.org?.name || "")}</strong><br/><small class="muted" id="prev-tag">${ui.esc(b.tagline || "")}</small></div>
              </div>
              <div class="mt-4 flex gap-2">
                <button type="button" class="btn" id="prev-btn-a">Botón principal</button>
                <button type="button" class="ghost" id="prev-btn-b">Secundario</button>
              </div>
            </div>
          </div>
        </div>
        <div class="row mt-4"><span class="muted">Los cambios afectan al login y al panel completo.</span><button class="btn" type="submit">Guardar marca</button></div>
      </form>`;
  }

  function configContact() {
    const c = state.org?.contact || {};
    return `
      <form class="form" id="contact-form">
        <div class="card">
          <h3>Datos de contacto</h3>
          <div class="grid cols-2">
            <label>Email público<input name="email" type="email" value="${ui.esc(c.email || "")}" /></label>
            <label>Teléfono<input name="phone" value="${ui.esc(c.phone || "")}" /></label>
          </div>
          <label>Sitio web<input name="website" value="${ui.esc(c.website || "")}" /></label>
          <label>Dirección<input name="address" value="${ui.esc(c.address || "")}" /></label>
        </div>
        <div class="row mt-4"><span></span><button class="btn" type="submit">Guardar contacto</button></div>
      </form>`;
  }

  function configBilling() {
    const b = state.org?.billing || {};
    return `
      <form class="form" id="billing-form">
        <div class="card">
          <h3>Datos fiscales</h3>
          <p class="muted text-sm mb-4">Aparecerán en facturas y comunicaciones legales.</p>
          <div class="grid cols-2">
            <label>Razón social<input name="legalName" value="${ui.esc(b.legalName || "")}" /></label>
            <label>CIF / NIF<input name="taxId" value="${ui.esc(b.taxId || "")}" /></label>
          </div>
          <label>Dirección fiscal<input name="address" value="${ui.esc(b.address || "")}" /></label>
          <div class="grid cols-2">
            <label>País<input name="country" value="${ui.esc(b.country || "ES")}" /></label>
            <label>IBAN<input name="iban" value="${ui.esc(b.iban || "")}" placeholder="ES__ ____ ____ ____ ____ ____" /></label>
          </div>
        </div>
        <div class="row mt-4"><span></span><button class="btn" type="submit">Guardar datos fiscales</button></div>
      </form>`;
  }

  function configIntegrations() {
    const i = state.org?.integrations || {};
    return `
      <form class="form" id="integrations-form">
        <div class="grid cols-2">
          <div class="card">
            <h3>💳 Stripe (pagos)</h3>
            <label class="text-sm"><input type="checkbox" name="stripe.enabled" ${i.stripe?.enabled ? "checked" : ""} /> Activar Stripe propio para esta academia</label>
            <label>Publishable key<input name="stripe.publishableKey" value="${ui.esc(i.stripe?.publishableKey || "")}" /></label>
            <label>Secret key<input name="stripe.secretKey" type="password" value="${ui.esc(i.stripe?.secretKey || "")}" /></label>
            <label>Webhook secret<input name="stripe.webhookSecret" type="password" value="${ui.esc(i.stripe?.webhookSecret || "")}" /></label>
            <p class="help">Modo test/sandbox: las claves empiezan por <code>sk_test_</code>.</p>
          </div>
          <div class="card">
            <h3>📧 Email</h3>
            <label class="text-sm"><input type="checkbox" name="email.enabled" ${i.email?.enabled ? "checked" : ""} /> Usar mi propio servicio de email</label>
            <label>Proveedor
              <select name="email.provider">
                <option value="resend" ${i.email?.provider === "resend" ? "selected" : ""}>Resend (recomendado)</option>
                <option value="smtp" ${i.email?.provider === "smtp" ? "selected" : ""}>SMTP</option>
              </select>
            </label>
            <label>API key (Resend) o contraseña SMTP<input name="email.apiKey" type="password" value="${ui.esc(i.email?.apiKey || "")}" /></label>
            <label>Remitente "From"<input name="email.from" value="${ui.esc(i.email?.from || "")}" placeholder="Mi Academia &lt;noreply@mi-academia.es&gt;" /></label>
          </div>
          <div class="card">
            <h3>☁️ Almacenamiento</h3>
            <label class="text-sm"><input type="checkbox" name="storage.enabled" ${i.storage?.enabled ? "checked" : ""} /> Usar mi propio bucket</label>
            <label>Proveedor
              <select name="storage.provider">
                <option value="r2" ${i.storage?.provider === "r2" ? "selected" : ""}>Cloudflare R2</option>
                <option value="s3" ${i.storage?.provider === "s3" ? "selected" : ""}>AWS S3</option>
              </select>
            </label>
            <label>Bucket<input name="storage.bucket" value="${ui.esc(i.storage?.bucket || "")}" /></label>
            <label>Endpoint<input name="storage.endpoint" value="${ui.esc(i.storage?.endpoint || "")}" /></label>
            <label>Access key<input name="storage.accessKeyId" value="${ui.esc(i.storage?.accessKeyId || "")}" /></label>
            <label>Secret key<input name="storage.secretAccessKey" type="password" value="${ui.esc(i.storage?.secretAccessKey || "")}" /></label>
          </div>
          <div class="card">
            <h3>🤖 IA (chatbot)</h3>
            <label class="text-sm"><input type="checkbox" name="ai.enabled" ${i.ai?.enabled ? "checked" : ""} /> Usar mi propia API</label>
            <label>Proveedor
              <select name="ai.provider">
                <option value="gemini" ${i.ai?.provider === "gemini" ? "selected" : ""}>Google Gemini (free tier)</option>
              </select>
            </label>
            <label>API key<input name="ai.apiKey" type="password" value="${ui.esc(i.ai?.apiKey || "")}" /></label>
            <label>Modelo<input name="ai.model" value="${ui.esc(i.ai?.model || "gemini-1.5-flash")}" /></label>
          </div>
          <div class="card">
            <h3>🎓 Moodle</h3>
            <label class="text-sm"><input type="checkbox" name="moodle.enabled" ${i.moodle?.enabled ? "checked" : ""} /> Sincronizar con Moodle</label>
            <label>URL base<input name="moodle.baseUrl" value="${ui.esc(i.moodle?.baseUrl || "")}" /></label>
            <label>Client ID<input name="moodle.clientId" value="${ui.esc(i.moodle?.clientId || "")}" /></label>
            <label>Client Secret<input name="moodle.clientSecret" type="password" value="${ui.esc(i.moodle?.clientSecret || "")}" /></label>
          </div>
          <div class="card">
            <h3>🇪🇸 Redsys (TPV)</h3>
            <label class="text-sm"><input type="checkbox" name="redsys.enabled" ${i.redsys?.enabled ? "checked" : ""} /> Activar Redsys</label>
            <label>Código comercio<input name="redsys.merchantCode" value="${ui.esc(i.redsys?.merchantCode || "")}" /></label>
            <label>Terminal<input name="redsys.terminal" value="${ui.esc(i.redsys?.terminal || "1")}" /></label>
            <label>Clave secreta<input name="redsys.secretKey" type="password" value="${ui.esc(i.redsys?.secretKey || "")}" /></label>
            <label>Entorno
              <select name="redsys.environment">
                <option value="sandbox" ${i.redsys?.environment === "sandbox" ? "selected" : ""}>Sandbox</option>
                <option value="production" ${i.redsys?.environment === "production" ? "selected" : ""}>Producción</option>
              </select>
            </label>
          </div>
        </div>
        <div class="row mt-4"><span class="muted">Si dejas alguna integración desactivada, se usa la global de la plataforma.</span><button class="btn" type="submit">Guardar integraciones</button></div>
      </form>`;
  }

  function configLegal() {
    const l = state.org?.integrations?.legal || {};
    return `
      <form class="form" id="legal-form">
        <div class="card">
          <h3>Páginas y responsable</h3>
          <p class="muted text-sm mb-4">Estas URLs aparecerán en el footer y en los emails legales.</p>
          <label>URL Política de privacidad<input name="legal.privacyUrl" value="${ui.esc(l.privacyUrl || "")}" /></label>
          <label>URL Términos y condiciones<input name="legal.termsUrl" value="${ui.esc(l.termsUrl || "")}" /></label>
          <label>Responsable del tratamiento<input name="legal.dataController" value="${ui.esc(l.dataController || "")}" /></label>
          <label>Email de soporte<input name="legal.supportEmail" type="email" value="${ui.esc(l.supportEmail || "")}" /></label>
        </div>
        <div class="row mt-4"><span></span><button class="btn" type="submit">Guardar legal</button></div>
      </form>`;
  }

  // ── Sub-secciones de configuración (transcripción ~20:02) ──────────────────

  // Email + Moodle: mensajería con el alumno
  function configComms() {
    const i = state.org?.integrations || {};
    return `
      <form class="form" id="comms-form">
        <div class="grid cols-2">
          <div class="card">
            <h3>📧 Email</h3>
            <p class="muted text-sm mb-2">Si lo activas, los emails de la plataforma se envían desde tu dominio.</p>
            <label class="text-sm"><input type="checkbox" name="email.enabled" ${i.email?.enabled ? "checked" : ""} /> Usar mi propio servicio de email</label>
            <label>Proveedor
              <select name="email.provider">
                <option value="resend" ${i.email?.provider === "resend" ? "selected" : ""}>Resend (recomendado)</option>
                <option value="smtp" ${i.email?.provider === "smtp" ? "selected" : ""}>SMTP</option>
              </select>
            </label>
            <label>API key (Resend) o contraseña SMTP<input name="email.apiKey" type="password" value="${ui.esc(i.email?.apiKey || "")}" /></label>
            <label>Remitente "From"<input name="email.from" value="${ui.esc(i.email?.from || "")}" placeholder="Mi Academia &lt;noreply@mi-academia.es&gt;" /></label>
          </div>
          <div class="card">
            <h3>🎓 Moodle</h3>
            <p class="muted text-sm mb-2">Sincronización con tu instancia Moodle (alumnos, cursos, materiales).</p>
            <label class="text-sm"><input type="checkbox" name="moodle.enabled" ${i.moodle?.enabled ? "checked" : ""} /> Sincronizar con Moodle</label>
            <label>URL base<input name="moodle.baseUrl" value="${ui.esc(i.moodle?.baseUrl || "")}" placeholder="https://campus.mi-academia.es" /></label>
            <label>Client ID<input name="moodle.clientId" value="${ui.esc(i.moodle?.clientId || "")}" /></label>
            <label>Client Secret<input name="moodle.clientSecret" type="password" value="${ui.esc(i.moodle?.clientSecret || "")}" /></label>
          </div>
        </div>
        <div class="row mt-4"><span class="muted">Si dejas algo desactivado se usa la configuración global.</span><button class="btn" type="submit">Guardar email y Moodle</button></div>
      </form>`;
  }

  // Pagos: Stripe + Redsys
  function configPayments() {
    const i = state.org?.integrations || {};
    return `
      <form class="form" id="payments-form">
        <div class="grid cols-2">
          <div class="card">
            <h3>💳 Stripe</h3>
            <p class="muted text-sm mb-2">Pasarela internacional, recomendada para suscripciones.</p>
            <label class="text-sm"><input type="checkbox" name="stripe.enabled" ${i.stripe?.enabled ? "checked" : ""} /> Activar Stripe propio</label>
            <label>Publishable key<input name="stripe.publishableKey" value="${ui.esc(i.stripe?.publishableKey || "")}" placeholder="pk_test_…" /></label>
            <label>Secret key<input name="stripe.secretKey" type="password" value="${ui.esc(i.stripe?.secretKey || "")}" placeholder="sk_test_…" /></label>
            <label>Webhook secret<input name="stripe.webhookSecret" type="password" value="${ui.esc(i.stripe?.webhookSecret || "")}" placeholder="whsec_…" /></label>
            <p class="help">Modo test: las claves empiezan por <code>sk_test_</code>.</p>
          </div>
          <div class="card">
            <h3>🇪🇸 Redsys (TPV)</h3>
            <p class="muted text-sm mb-2">TPV virtual para academias en España.</p>
            <label class="text-sm"><input type="checkbox" name="redsys.enabled" ${i.redsys?.enabled ? "checked" : ""} /> Activar Redsys</label>
            <label>Código comercio<input name="redsys.merchantCode" value="${ui.esc(i.redsys?.merchantCode || "")}" /></label>
            <label>Terminal<input name="redsys.terminal" value="${ui.esc(i.redsys?.terminal || "1")}" /></label>
            <label>Clave secreta<input name="redsys.secretKey" type="password" value="${ui.esc(i.redsys?.secretKey || "")}" /></label>
            <label>Entorno
              <select name="redsys.environment">
                <option value="sandbox" ${i.redsys?.environment === "sandbox" ? "selected" : ""}>Sandbox</option>
                <option value="production" ${i.redsys?.environment === "production" ? "selected" : ""}>Producción</option>
              </select>
            </label>
          </div>
        </div>
        <div class="row mt-4"><span class="muted">Puedes activar ambas pasarelas; el opositor elige al pagar.</span><button class="btn" type="submit">Guardar pagos</button></div>
      </form>`;
  }

  // Almacenamiento + Chatbot (van juntos: ambos son backend "infraestructura")
  function configAiStorage() {
    const i = state.org?.integrations || {};
    return `
      <form class="form" id="ai-storage-form">
        <div class="grid cols-2">
          <div class="card">
            <h3>☁️ Almacenamiento</h3>
            <p class="muted text-sm mb-2">Bucket donde se guardan PDF, audios, vídeos y adjuntos.</p>
            <label class="text-sm"><input type="checkbox" name="storage.enabled" ${i.storage?.enabled ? "checked" : ""} /> Usar mi propio bucket</label>
            <label>Proveedor
              <select name="storage.provider">
                <option value="r2" ${i.storage?.provider === "r2" ? "selected" : ""}>Cloudflare R2 (recomendado)</option>
                <option value="s3" ${i.storage?.provider === "s3" ? "selected" : ""}>AWS S3</option>
              </select>
            </label>
            <label>Bucket<input name="storage.bucket" value="${ui.esc(i.storage?.bucket || "")}" /></label>
            <label>Endpoint<input name="storage.endpoint" value="${ui.esc(i.storage?.endpoint || "")}" /></label>
            <label>Access key<input name="storage.accessKeyId" value="${ui.esc(i.storage?.accessKeyId || "")}" /></label>
            <label>Secret key<input name="storage.secretAccessKey" type="password" value="${ui.esc(i.storage?.secretAccessKey || "")}" /></label>
          </div>
          <div class="card">
            <h3>🤖 Chatbot de academia</h3>
            <p class="muted text-sm mb-2">IA que responde dudas a los opositores. El coste de la API lo asume la academia.</p>
            <label class="text-sm"><input type="checkbox" name="ai.enabled" ${i.ai?.enabled ? "checked" : ""} /> Usar mi propia API</label>
            <label>Proveedor
              <select name="ai.provider">
                <option value="gemini" ${i.ai?.provider === "gemini" ? "selected" : ""}>Google Gemini (free tier)</option>
                <option value="openai" ${i.ai?.provider === "openai" ? "selected" : ""}>OpenAI (ChatGPT)</option>
                <option value="anthropic" ${i.ai?.provider === "anthropic" ? "selected" : ""}>Anthropic (Claude)</option>
              </select>
            </label>
            <label>API key<input name="ai.apiKey" type="password" value="${ui.esc(i.ai?.apiKey || "")}" /></label>
            <label>Modelo<input name="ai.model" value="${ui.esc(i.ai?.model || "gemini-1.5-flash")}" /></label>
            <p class="help">Cada preparador puede además forzar un modo (supervisado / automático) en sus alumnos.</p>
          </div>
        </div>
        <div class="row mt-4"><span class="muted">El opositor también puede conectar su propia IA en su perfil.</span><button class="btn" type="submit">Guardar almacenamiento e IA</button></div>
      </form>`;
  }

  // Videoconferencia (~20:11)
  function configVideoconf() {
    const v = state.org?.integrations?.videoconference || {};
    return `
      <form class="form" id="videoconf-form">
        <div class="card">
          <h3>📹 Videoconferencia para tutorías</h3>
          <p class="muted text-sm mb-3">Se generará automáticamente un enlace al confirmar cada tutoría.</p>
          <label>Proveedor
            <select name="videoconference.provider">
              <option value="" ${!v.provider ? "selected" : ""}>— Sin integración (enlace manual)</option>
              <option value="zoom" ${v.provider === "zoom" ? "selected" : ""}>Zoom</option>
              <option value="meet" ${v.provider === "meet" ? "selected" : ""}>Google Meet</option>
              <option value="teams" ${v.provider === "teams" ? "selected" : ""}>Microsoft Teams</option>
              <option value="jitsi" ${v.provider === "jitsi" ? "selected" : ""}>Jitsi (auto-hospedado)</option>
            </select>
          </label>
          <label>API key / Client ID<input name="videoconference.apiKey" type="password" value="${ui.esc(v.apiKey || "")}" /></label>
          <label>Client secret / API secret<input name="videoconference.clientSecret" type="password" value="${ui.esc(v.clientSecret || "")}" /></label>
          <label>Cuenta / dominio<input name="videoconference.accountId" value="${ui.esc(v.accountId || "")}" placeholder="opcional, p.ej. mi-empresa.zoom.us" /></label>
        </div>
        <div class="row mt-4"><span></span><button class="btn" type="submit">Guardar videoconferencia</button></div>
      </form>`;
  }

  // Avisos automáticos por defecto: inactividad, compromiso, tutoría no consumida (~20:30, ~20:32, ~20:38)
  function configDefaults() {
    const d = state.org?.defaults || {};
    const inactivity = d.inactivityReminder || { preset: "normal" };
    const broken = d.brokenCommitmentEmail || { enabled: true, daysInARow: 3 };
    const unconsumed = d.unconsumedTutoringEmail || { enabled: true };
    return `
      <form class="form" id="defaults-form">
        <div class="card">
          <h3>⏰ Recordatorio por inactividad</h3>
          <p class="muted text-sm mb-3">Cada preparador puede luego ajustar el preset por opositor según fecha de examen.</p>
          <label>Preset por defecto
            <select name="inactivity.preset">
              <option value="intensive" ${inactivity.preset === "intensive" ? "selected" : ""}>Intensivo — avisar a los 2 días</option>
              <option value="normal" ${inactivity.preset === "normal" ? "selected" : ""}>Normal — avisar a los 7 días</option>
              <option value="calm" ${inactivity.preset === "calm" ? "selected" : ""}>Tranquilo — avisar a los 15 días</option>
              <option value="off" ${inactivity.preset === "off" ? "selected" : ""}>Desactivado</option>
            </select>
          </label>
        </div>
        <div class="card mt-4">
          <h3>📉 Compromiso roto</h3>
          <p class="muted text-sm mb-3">Avisa al preparador cuando un opositor lleva varios días seguidos sin cumplir.</p>
          <label class="text-sm"><input type="checkbox" name="broken.enabled" ${broken.enabled ? "checked" : ""} /> Activado</label>
          <label>Días seguidos sin cumplir<input type="number" name="broken.daysInARow" min="1" max="30" value="${broken.daysInARow || 3}" /></label>
        </div>
        <div class="card mt-4">
          <h3>📅 Tutoría mensual sin consumir</h3>
          <p class="muted text-sm mb-3">Aviso a fin de mes si el plan incluye tutoría y no se reservó ninguna.</p>
          <label class="text-sm"><input type="checkbox" name="unconsumed.enabled" ${unconsumed.enabled ? "checked" : ""} /> Activado</label>
        </div>
        <div class="row mt-4"><span></span><button class="btn" type="submit">Guardar avisos</button></div>
      </form>`;
  }

  // ── Encuesta NPS ───────────────────────────────────────────────────────────

  function npsSection() {
    const data = state.npsData || { responses: [], stats: {} };
    const { stats, responses } = data;
    const cat = (c) => ({ promoter: "Promotor", passive: "Pasivo", detractor: "Detractor" }[c] || c);
    const catColor = (c) => ({ promoter: "success", passive: "muted", detractor: "warn" }[c] || "muted");
    return `
      <div class="section-head">
        <div><p class="eyebrow">Voz del cliente</p><h1>Encuesta NPS</h1></div>
        <div class="row gap-2">
          <button class="ghost" id="nps-config">Configurar</button>
          <button class="btn" id="nps-send">Enviar a opositores</button>
        </div>
      </div>
      <div class="grid cols-4 mb-4">
        <div class="card metric"><span class="label">Score NPS</span><strong style="color:${(stats.score || 0) >= 30 ? "var(--success, #0c8f6f)" : (stats.score || 0) < 0 ? "var(--danger, #c73c3c)" : "var(--muted)"};">${stats.score ?? "—"}</strong><span class="muted text-xs">${stats.total || 0} respuestas</span></div>
        <div class="card metric"><span class="label">Promotores</span><strong>${stats.promoters || 0}</strong><span class="muted text-xs">9–10</span></div>
        <div class="card metric"><span class="label">Pasivos</span><strong>${stats.passives || 0}</strong><span class="muted text-xs">7–8</span></div>
        <div class="card metric"><span class="label">Detractores</span><strong>${stats.detractors || 0}</strong><span class="muted text-xs">0–6</span></div>
      </div>
      <div class="card">
        <h2>Respuestas recibidas</h2>
        <div class="table mt-4">
          <div class="table-row header"><span>Opositor</span><span>Score</span><span>Categoría</span><span>Fecha</span><span>Comentario</span></div>
          ${(responses || [])
            .map(
              (r) => `
            <div class="table-row">
              <span><strong>${ui.esc(r.opositorName || "(anónimo)")}</strong></span>
              <span><strong>${r.score}/10</strong></span>
              <span><span class="pill ${catColor(r.category)}">${cat(r.category)}</span></span>
              <span><small class="muted">${ui.esc((r.respondedAt || "").slice(0, 10))}</small></span>
              <span><small>${ui.esc(r.answers?.comment || "—")}</small></span>
            </div>`,
            )
            .join("") || `<div class="empty-state">Aún no hay respuestas. Envíala a tus opositores.</div>`}
        </div>
      </div>`;
  }

  function render() {
    let content = "";
    if (state.section === "dashboard") content = dashboardSection();
    else if (state.section === "users") content = usersSection();
    else if (state.section === "assignments") content = assignmentsSection();
    else if (state.section === "plans") content = plansSection();
    else if (state.section === "config") content = configSection();
    else if (state.section === "nps") content = npsSection();
    ui.root().innerHTML = shell(content);
    bind();
  }

  function bind() {
    const main = document.querySelector(".main");
    document.querySelectorAll("[data-section]").forEach((b) => {
      b.onclick = () => {
        state.section = b.dataset.section;
        render();
      };
    });
    document.getElementById("logout-btn").onclick = () => app.logout();

    // Usuarios
    document.getElementById("new-user")?.addEventListener("click", openNewUserModal);
    document.getElementById("bulk-users")?.addEventListener("click", openBulkUsersModal);
    main.querySelectorAll("[data-edit-user]").forEach((b) => {
      const u = state.users.find((x) => x.id === b.dataset.editUser);
      b.addEventListener("click", () => openEditUserModal(u));
    });
    main.querySelectorAll("[data-toggle-user]").forEach((b) => {
      const u = state.users.find((x) => x.id === b.dataset.toggleUser);
      b.addEventListener("click", async () => {
        const newStatus = u.status === "active" ? "inactive" : "active";
        await api.admin.setUserStatus(u.id, newStatus);
        await refresh();
        ui.toast(`Usuario ${newStatus === "active" ? "activado" : "desactivado"}`, "success");
      });
    });

    // Asignaciones
    document.getElementById("new-assignment")?.addEventListener("click", () => openAssignmentModal(null));
    main.querySelectorAll("[data-reassign]").forEach((b) =>
      b.addEventListener("click", () => openAssignmentModal(b.dataset.reassign)),
    );

    // Planes
    document.getElementById("new-plan")?.addEventListener("click", () => openPlanModal(null));
    main.querySelectorAll("[data-edit-plan]").forEach((b) => {
      const p = state.plans.own.find((x) => x.id === b.dataset.editPlan);
      b.addEventListener("click", () => openPlanModal(p));
    });
    main.querySelectorAll("[data-toggle-global]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await api.adminExtra.togglePlanForOrg(b.dataset.toggleGlobal);
          await refresh();
        } catch (err) {
          ui.toast(err.error || "Error", "error");
        }
      }),
    );

    // Configuración: tabs
    main.querySelectorAll("[data-config-tab]").forEach((b) => {
      b.onclick = () => {
        state.configTab = b.dataset.configTab;
        render();
      };
    });

    // NPS
    if (state.section === "nps") {
      // Carga perezosa
      if (!state.npsData) {
        api.adminExtra.npsResponses().then((d) => {
          state.npsData = d;
          render();
        }).catch(() => { state.npsData = { responses: [], stats: {} }; render(); });
      }
      document.getElementById("nps-config")?.addEventListener("click", openNpsConfigModal);
      document.getElementById("nps-send")?.addEventListener("click", openNpsSendModal);
    }

    // Configuración: forms
    bindConfigForms();
  }

  function bindConfigForms() {
    const branding = document.getElementById("branding-form");
    if (branding) {
      // Vista previa en vivo
      const updatePreview = () => {
        const fd = new FormData(branding);
        const mark = document.getElementById("prev-mark");
        if (mark) {
          mark.style.background = fd.get("primary");
          mark.textContent = (fd.get("initials") || "AD").slice(0, 3);
        }
        document.getElementById("prev-name").textContent = fd.get("name") || "";
        document.getElementById("prev-tag").textContent = fd.get("tagline") || "";
        const btnA = document.getElementById("prev-btn-a");
        if (btnA) btnA.style.background = fd.get("primary");
      };
      branding.addEventListener("input", updatePreview);
      branding.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(branding);
        try {
          await api.admin.updateOrg({
            name: fd.get("name"),
            branding: {
              ...(state.org.branding || {}),
              tagline: fd.get("tagline"),
              initials: fd.get("initials"),
              primaryColor: fd.get("primary"),
              secondaryColor: fd.get("secondary"),
              accentColor: fd.get("accent"),
              logo: fd.get("logo"),
              favicon: fd.get("favicon"),
            },
          });
          ui.toast("Marca actualizada", "success");
          await refresh();
          ui.applyBranding(state.org.branding);
        } catch (err) {
          ui.toast(err.error || "Error", "error");
        }
      };
    }

    const contact = document.getElementById("contact-form");
    if (contact) {
      contact.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(contact);
        await api.admin.updateOrg({
          contact: { email: fd.get("email"), phone: fd.get("phone"), website: fd.get("website"), address: fd.get("address") },
        });
        ui.toast("Contacto actualizado", "success");
        await refresh();
      };
    }

    const billing = document.getElementById("billing-form");
    if (billing) {
      billing.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(billing);
        await api.admin.updateOrg({
          billing: {
            legalName: fd.get("legalName"),
            taxId: fd.get("taxId"),
            address: fd.get("address"),
            country: fd.get("country"),
            iban: fd.get("iban"),
          },
        });
        ui.toast("Datos fiscales actualizados", "success");
        await refresh();
      };
    }

    const integrations = document.getElementById("integrations-form");
    if (integrations) {
      integrations.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(integrations);
        const out = {};
        for (const [k, v] of fd.entries()) {
          const [section, field] = k.split(".");
          if (!out[section]) out[section] = {};
          if (integrations.elements[k].type === "checkbox") {
            out[section][field] = integrations.elements[k].checked;
          } else {
            out[section][field] = v;
          }
        }
        // Asegura que los enabled false se envíen aunque el checkbox no esté en el form data
        for (const sec of ["stripe", "email", "storage", "ai", "moodle", "redsys"]) {
          if (out[sec] && integrations.elements[`${sec}.enabled`]) {
            out[sec].enabled = integrations.elements[`${sec}.enabled`].checked;
          }
        }
        await api.admin.updateOrg({ integrations: out });
        ui.toast("Integraciones actualizadas", "success");
        await refresh();
      };
    }

    const legal = document.getElementById("legal-form");
    if (legal) {
      legal.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(legal);
        await api.admin.updateOrg({
          integrations: {
            legal: {
              privacyUrl: fd.get("legal.privacyUrl"),
              termsUrl: fd.get("legal.termsUrl"),
              dataController: fd.get("legal.dataController"),
              supportEmail: fd.get("legal.supportEmail"),
            },
          },
        });
        ui.toast("Datos legales actualizados", "success");
        await refresh();
      };
    }

    // Helper genérico para los nuevos formularios de integraciones por secciones
    function bindIntegrationsForm(formId, sections) {
      const form = document.getElementById(formId);
      if (!form) return;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const out = {};
        for (const [k, v] of fd.entries()) {
          const [section, field] = k.split(".");
          if (!out[section]) out[section] = {};
          const el = form.elements[k];
          if (el && el.type === "checkbox") out[section][field] = el.checked;
          else out[section][field] = v;
        }
        for (const sec of sections) {
          if (out[sec] && form.elements[`${sec}.enabled`]) {
            out[sec].enabled = form.elements[`${sec}.enabled`].checked;
          }
        }
        try {
          await api.admin.updateOrg({ integrations: out });
          ui.toast("Cambios guardados", "success");
          await refresh();
        } catch (err) {
          ui.toast(err.error || "Error", "error");
        }
      };
    }

    bindIntegrationsForm("comms-form", ["email", "moodle"]);
    bindIntegrationsForm("payments-form", ["stripe", "redsys"]);
    bindIntegrationsForm("ai-storage-form", ["storage", "ai"]);
    bindIntegrationsForm("videoconf-form", ["videoconference"]);

    // Avisos por defecto (no van bajo "integrations" sino bajo "defaults")
    const defaults = document.getElementById("defaults-form");
    if (defaults) {
      defaults.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(defaults);
        try {
          await api.admin.updateOrg({
            defaults: {
              inactivityReminder: { preset: fd.get("inactivity.preset") },
              brokenCommitmentEmail: {
                enabled: defaults.elements["broken.enabled"].checked,
                daysInARow: Number(fd.get("broken.daysInARow")) || 3,
              },
              unconsumedTutoringEmail: {
                enabled: defaults.elements["unconsumed.enabled"].checked,
              },
            },
          });
          ui.toast("Avisos guardados", "success");
          await refresh();
        } catch (err) {
          ui.toast(err.error || "Error", "error");
        }
      };
    }
  }

  async function refresh() {
    await load();
    render();
  }

  // ── Modales ────────────────────────────────────────────────────────────────

  function openNewUserModal() {
    const m = ui.modal({
      title: "Nuevo usuario",
      body: `
        <form class="form" id="user-form">
          <label>Rol
            <select name="role" required>
              <option value="opositor">Opositor</option>
              <option value="preparador">Preparador</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <label>Nombre completo<input name="name" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Teléfono<input name="phone" /></label>
          <label>Contraseña<input name="password" type="password" required minlength="6" /></label>
          <label>Especialidad (solo preparador)<input name="specialty" /></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save">Crear</button>`,
    });
    m.el.querySelector("#save").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#user-form"));
      try {
        await api.admin.createUser(Object.fromEntries(fd));
        ui.toast("Usuario creado", "success");
        m.close();
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error", "error");
      }
    };
  }

  function openEditUserModal(u) {
    const m = ui.modal({
      title: `Editar ${u.name}`,
      body: `
        <form class="form" id="user-form">
          <label>Nombre<input name="name" value="${ui.esc(u.name)}" required /></label>
          <label>Email<input name="email" type="email" value="${ui.esc(u.email)}" required /></label>
          <label>Teléfono<input name="phone" value="${ui.esc(u.phone || "")}" /></label>
          ${u.role === "preparador" ? `<label>Especialidad<input name="specialty" value="${ui.esc(u.specialty || "")}" /></label>` : ""}
          <label>Nueva contraseña <span class="help">(deja en blanco para no cambiarla)</span><input name="password" type="password" minlength="6" /></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save">Guardar</button>`,
    });
    m.el.querySelector("#save").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#user-form"));
      const data = Object.fromEntries(fd);
      if (!data.password) delete data.password;
      try {
        await api.admin.updateUser(u.id, data);
        ui.toast("Usuario actualizado", "success");
        m.close();
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error", "error");
      }
    };
  }

  function openAssignmentModal(opositorId) {
    const opositores = state.users.filter((u) => u.role === "opositor" && u.status === "active");
    const preparadores = state.users.filter((u) => u.role === "preparador" && u.status === "active");
    const m = ui.modal({
      title: opositorId ? "Reasignar opositor" : "Nueva asignación",
      body: `
        <form class="form" id="ass-form">
          <label>Opositor
            <select name="opositorId" required ${opositorId ? "disabled" : ""}>
              <option value="">— selecciona —</option>
              ${opositores.map((o) => `<option value="${o.id}" ${o.id === opositorId ? "selected" : ""}>${ui.esc(o.name)}</option>`).join("")}
            </select>
          </label>
          <label>Preparador
            <select name="preparadorId" required>
              <option value="">— selecciona —</option>
              ${preparadores.map((p) => `<option value="${p.id}">${ui.esc(p.name)} (${p.opositoresAssigned || 0} opositores)</option>`).join("")}
            </select>
          </label>
          <label>Motivo del cambio<textarea name="reason" rows="3" placeholder="Por qué se realiza esta reasignación..."></textarea></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save">Confirmar</button>`,
    });
    if (opositorId) m.el.querySelector("[name=opositorId]").value = opositorId;
    m.el.querySelector("#save").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#ass-form"));
      const data = Object.fromEntries(fd);
      if (opositorId) data.opositorId = opositorId;
      try {
        await api.admin.createAssignment(data);
        ui.toast("Asignación guardada", "success");
        m.close();
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error", "error");
      }
    };
  }

  function openPlanModal(plan) {
    const isNew = !plan;
    const m = ui.modal({
      title: isNew ? "Nuevo plan propio" : `Editar ${plan.name}`,
      body: `
        <form class="form" id="plan-form">
          <label>Nombre<input name="name" required value="${ui.esc(plan?.name || "")}" /></label>
          <div class="grid cols-2">
            <label>Dirigido a
              <select name="target">
                <option value="opositor" ${plan?.target === "opositor" ? "selected" : ""}>Opositor</option>
                <option value="preparador" ${plan?.target === "preparador" ? "selected" : ""}>Preparador</option>
              </select>
            </label>
            <label>Precio (€/mes)<input type="number" name="price" min="0" step="1" required value="${plan?.price ?? 0}" /></label>
          </div>
          <label>Días de prueba<input type="number" name="trialDays" min="0" value="${plan?.trialDays || 0}" /></label>
          <label>Características (una por línea)<textarea name="features" rows="4">${ui.esc((plan?.features || []).join("\n"))}</textarea></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save">${isNew ? "Crear" : "Guardar"}</button>`,
    });
    m.el.querySelector("#save").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#plan-form"));
      const data = {
        name: fd.get("name"),
        target: fd.get("target"),
        price: Number(fd.get("price")),
        trialDays: Number(fd.get("trialDays")),
        features: String(fd.get("features") || "").split("\n").map((s) => s.trim()).filter(Boolean),
      };
      try {
        if (isNew) await api.admin.createPlan(data);
        else await api.admin.updatePlan(plan.id, data);
        ui.toast("Plan guardado", "success");
        m.close();
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error", "error");
      }
    };
  }

  // ── Encuesta NPS: modales ──────────────────────────────────────────────────

  function openNpsConfigModal() {
    const nps = state.org?.nps || { enabled: false, template: "nps_classic", cooldownDays: 90 };
    const m = ui.modal({
      title: "Configurar encuesta NPS",
      body: `
        <form class="form" id="nps-config-form">
          <label class="text-sm"><input type="checkbox" name="enabled" ${nps.enabled ? "checked" : ""} /> Activar encuesta NPS para esta academia</label>
          <label>Plantilla
            <select name="template">
              <option value="nps_classic" ${nps.template === "nps_classic" ? "selected" : ""}>Clásica (1 pregunta + comentario)</option>
              <option value="nps_extended" ${nps.template === "nps_extended" ? "selected" : ""}>Extendida (con sub-preguntas)</option>
            </select>
          </label>
          <label>Periodo entre envíos (días)<input type="number" name="cooldownDays" min="7" max="365" value="${nps.cooldownDays || 90}" /></label>
          <p class="help">Si un opositor ya respondió, no recibirá otra hasta que pasen estos días.</p>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save">Guardar</button>`,
    });
    m.el.querySelector("#save").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#nps-config-form"));
      try {
        await api.admin.updateOrg({
          nps: {
            enabled: m.el.querySelector("[name=enabled]").checked,
            template: fd.get("template"),
            cooldownDays: Number(fd.get("cooldownDays")) || 90,
          },
        });
        ui.toast("Configuración guardada", "success");
        m.close();
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error", "error");
      }
    };
  }

  function openNpsSendModal() {
    if (!state.org?.nps?.enabled) {
      ui.toast("Activa primero la encuesta NPS en Configurar", "warn");
      return;
    }
    const opositores = state.users.filter((u) => u.role === "opositor" && u.status === "active");
    const m = ui.modal({
      title: "Enviar encuesta NPS",
      body: `
        <form class="form" id="nps-send-form">
          <p class="muted text-sm mb-3">Se enviará un email con un enlace para responder. Los que ya respondieron recientemente serán excluidos.</p>
          <label>Audiencia
            <select name="audience">
              <option value="all">Todos los opositores activos (${opositores.length})</option>
              <option value="recent">Solo los inscritos en los últimos 90 días</option>
            </select>
          </label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="send">Enviar</button>`,
    });
    m.el.querySelector("#send").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#nps-send-form"));
      try {
        const r = await api.adminExtra.npsSend({ audience: fd.get("audience") });
        ui.toast(`Enviada a ${r?.sent || 0} opositores`, "success");
        m.close();
        state.npsData = null; // refrescar
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error al enviar", "error");
      }
    };
  }

  // ── Bulk upload de opositores (CSV) — transcripción ~20:06 ────────────────

  function openBulkUsersModal() {
    const m = ui.modal({
      title: "Carga masiva de opositores (CSV)",
      body: `
        <div>
          <p class="muted text-sm mb-3">Sube un CSV con cabeceras <code>name,email,phone,password</code>. Si no incluyes la contraseña, se generará una temporal.</p>
          <textarea id="csv-data" rows="10" class="input" style="width:100%;font-family:monospace;font-size:12px;" placeholder="name,email,phone,password
Lucía Martín,lucia@correo.es,+34600000001,
Álvaro Ruiz,alvaro@correo.es,+34600000002,Cambiame123"></textarea>
          <div class="row mt-3 gap-2">
            <input type="file" accept=".csv,text/csv" id="csv-file" />
            <small class="muted">o pega el CSV arriba</small>
          </div>
          <div id="bulk-result" class="mt-3"></div>
        </div>`,
      footer: `<button class="ghost" data-close>Cerrar</button><button class="btn" id="bulk-import">Importar</button>`,
    });
    m.el.querySelector("#csv-file").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { m.el.querySelector("#csv-data").value = String(reader.result || ""); };
      reader.readAsText(f);
    };
    m.el.querySelector("#bulk-import").onclick = async () => {
      const csv = m.el.querySelector("#csv-data").value.trim();
      if (!csv) { ui.toast("Pega un CSV o selecciona un archivo", "warn"); return; }
      try {
        const r = await api.adminExtra.bulkUsers({ csv, role: "opositor" });
        m.el.querySelector("#bulk-result").innerHTML = `
          <div class="card" style="border-color:var(--success, #0c8f6f);">
            <strong>✓ Importados: ${r.created || 0}</strong>
            ${r.errors?.length ? `<br/><small class="muted">${r.errors.length} errores: ${ui.esc(r.errors.slice(0, 3).map((e) => e.email + ": " + e.error).join("; "))}</small>` : ""}
          </div>`;
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error al importar", "error");
      }
    };
  }

  return {
    show: async () => {
      await load();
      render();
    },
  };
})();
