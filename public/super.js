// ─────────────────────────────────────────────────────────────────────────────
// Vista del super-administrador. Gestiona academias y planes globales.
// ─────────────────────────────────────────────────────────────────────────────

const superView = (() => {
  let state = {
    section: "dashboard",
    dashboard: null,
    organizations: [],
    plans: [],
  };

  async function load() {
    try {
      const [d, o, p] = await Promise.all([api.super.dashboard(), api.super.orgs(), api.super.plans()]);
      state.dashboard = d;
      state.organizations = o.organizations;
      state.plans = p.plans;
    } catch (e) {
      ui.toast("Error cargando datos del super-admin", "error");
    }
  }

  function shell(content) {
    return `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand-row">
            <div class="brand-mark">OP</div>
            <div><strong style="color:white;">OpoPlan</strong><small>Super-administrador</small></div>
          </div>
          <div class="org-badge"><strong>${ui.esc(app.currentUser.name)}</strong>Plataforma global</div>
          <nav class="nav">
            <button data-section="dashboard" ${state.section === "dashboard" ? 'class="active"' : ""}>📊 Resumen plataforma</button>
            <button data-section="orgs" ${state.section === "orgs" ? 'class="active"' : ""}>🏛️ Academias</button>
            <button data-section="plans" ${state.section === "plans" ? 'class="active"' : ""}>💳 Planes globales</button>
          </nav>
          <div class="sidebar-footer">
            <button class="ghost" id="logout-btn">Cerrar sesión</button>
          </div>
        </aside>
        <main class="main">${content}</main>
      </div>`;
  }

  function dashboardSection() {
    const t = state.dashboard?.totals || {};
    return `
      <div class="section-head">
        <div>
          <p class="eyebrow">Visión general</p>
          <h1>Plataforma OpoPlan</h1>
        </div>
      </div>
      <div class="grid cols-4 mb-4">
        <div class="card metric"><span class="label">Academias activas</span><strong>${t.activeOrganizations || 0}</strong><span class="muted text-xs">${t.organizations || 0} totales</span></div>
        <div class="card metric"><span class="label">Usuarios totales</span><strong>${t.users || 0}</strong><span class="muted text-xs">${t.opositores || 0} opositores · ${t.preparadores || 0} preparadores</span></div>
        <div class="card metric"><span class="label">Cuentas activas</span><strong>${t.totalActiveAccounts ?? t.activeSubscriptions ?? 0}</strong><span class="muted text-xs">${t.activeSubscriptions || 0} suscripciones · ${t.activeOrganizations || 0} academias</span></div>
        <div class="card metric"><span class="label">Ingresos mensuales</span><strong>${ui.formatEUR(t.monthlyRevenue)}</strong></div>
      </div>
      <div class="card">
        <h2>Academias</h2>
        <div class="table mt-4">
          <div class="table-row header"><span>Academia</span><span>Estado</span><span>Usuarios</span><span>MRR</span><span></span></div>
          ${(state.dashboard?.organizations || [])
            .map(
              (o) => `
            <div class="table-row">
              <span><strong>${ui.esc(o.name)}</strong><br/><small class="muted">/${ui.esc(o.slug)}</small></span>
              <span><span class="pill ${o.status === "active" ? "success" : "muted"}">${o.status}</span></span>
              <span>${o.users}</span>
              <span><strong>${ui.formatEUR(o.monthlyRevenue)}</strong></span>
              <span class="actions"><button class="ghost sm" data-edit-org="${o.id}">Editar</button></span>
            </div>`,
            )
            .join("")}
        </div>
      </div>`;
  }

  function orgsSection() {
    return `
      <div class="section-head">
        <div><p class="eyebrow">Multi-tenant</p><h1>Academias</h1></div>
        <button class="btn" id="new-org">+ Nueva academia</button>
      </div>
      <div class="grid cols-2">
        ${state.organizations
          .map(
            (o) => `
          <div class="card">
            <div class="row" style="margin-bottom: 12px;">
              <div class="flex items-center gap-3">
                <div class="brand-mark" style="background:${ui.esc(o.branding?.primaryColor || "#155ea8")}; color:white;">${ui.esc(o.branding?.initials || ui.initials(o.name))}</div>
                <div>
                  <strong style="font-size: 1.05rem;">${ui.esc(o.name)}</strong><br/>
                  <small class="muted">/${ui.esc(o.slug)} · ${ui.esc(o.contact?.email || "—")}</small>
                </div>
              </div>
              <span class="pill ${o.status === "active" ? "success" : "muted"}">${o.status}</span>
            </div>
            <div class="grid cols-3 tight">
              <div><small class="muted">Usuarios</small><br/><strong>${o.userCount}</strong></div>
              <div><small class="muted">Admins</small><br/><strong>${o.adminCount}</strong></div>
              <div><small class="muted">Creada</small><br/><strong>${ui.esc(o.createdAt || "—")}</strong></div>
            </div>
            <div class="row mt-4">
              <button class="ghost sm" data-edit-org="${o.id}">Editar</button>
              ${
                o.status === "active"
                  ? `<button class="ghost sm" data-deactivate="${o.id}">Desactivar</button>`
                  : `<button class="ghost sm" data-activate="${o.id}">Reactivar</button>`
              }
            </div>
          </div>`,
          )
          .join("")}
      </div>`;
  }

  function plansSection() {
    const lines = [...new Set(state.plans.map((p) => p.line || "oposiciones"))];
    const currentLine = state.planLine || "all";
    const filtered = currentLine === "all" ? state.plans : state.plans.filter((p) => (p.line || "oposiciones") === currentLine);
    const lineLabel = (l) => ({
      oposiciones: "Oposiciones",
      universidad: "Universidad",
      ebau: "EBAU",
      preparador_independiente: "Preparador independiente",
      academia: "Academia",
    }[l] || l);
    return `
      <div class="section-head">
        <div><p class="eyebrow">Catálogo</p><h1>Planes globales de la plataforma</h1></div>
        <button class="btn" id="new-plan">+ Nuevo plan</button>
      </div>
      <p class="muted mb-4">Estos planes están disponibles para todas las academias. Cada admin puede además crear los suyos propios.</p>
      <div class="row mb-4 gap-2" style="flex-wrap:wrap;gap:6px;">
        <button class="ghost sm ${currentLine === "all" ? "active" : ""}" data-line="all">Todas las líneas</button>
        ${lines.map((l) => `<button class="ghost sm ${currentLine === l ? "active" : ""}" data-line="${ui.esc(l)}">${ui.esc(lineLabel(l))}</button>`).join("")}
      </div>
      <div class="grid cols-3">
        ${filtered
          .map(
            (p) => `
          <div class="card">
            <div class="row">
              <div>
                <p class="eyebrow">${ui.esc(lineLabel(p.line || "oposiciones"))} · ${ui.esc(p.target || "opositor")}</p>
                <h3>${ui.esc(p.name)}</h3>
              </div>
              <span class="pill ${p.active ? "success" : "muted"}">${p.active ? "activo" : "oculto"}</span>
            </div>
            <div style="font-size: 1.8rem; font-weight: 800; margin: 10px 0;">${ui.formatEUR(p.price)}<span class="muted text-sm" style="font-weight:500;">/mes</span></div>
            ${p.activeSubscribers ? `<div class="pill success" style="margin-bottom:8px;">${p.activeSubscribers} suscriptor${p.activeSubscribers === 1 ? "" : "es"}</div>` : `<div class="pill muted" style="margin-bottom:8px;">Sin suscriptores</div>`}
            <ul style="padding-left: 18px; margin: 0 0 14px; font-size: 0.88rem; color: var(--muted);">
              ${(p.features || []).map((f) => `<li>${ui.esc(f)}</li>`).join("")}
            </ul>
            ${p.quota?.maxOpositores ? `<small class="muted">Cuota: ${p.quota.maxOpositores} opositores · ${p.quota.maxProcesses || "∞"} procesos</small><br/>` : ""}
            ${p.trialDays ? `<small class="muted">${p.trialDays} días de prueba</small><br/>` : ""}
            <div class="row mt-3">
              <button class="ghost sm" data-edit-plan="${p.id}">Editar</button>
              <button class="ghost sm" data-delete-plan="${p.id}">${p.deletable === false ? "Ocultar" : "Borrar"}</button>
            </div>
          </div>`,
          )
          .join("")}
      </div>`;
  }

  function render() {
    let content = "";
    if (state.section === "dashboard") content = dashboardSection();
    else if (state.section === "orgs") content = orgsSection();
    else if (state.section === "plans") content = plansSection();
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

    // Acciones organizaciones
    document.getElementById("new-org")?.addEventListener("click", openNewOrgModal);
    main.querySelectorAll("[data-edit-org]").forEach((b) =>
      b.addEventListener("click", () => openEditOrgModal(b.dataset.editOrg)),
    );
    main.querySelectorAll("[data-deactivate]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("¿Desactivar academia? Los usuarios no podrán acceder.")) return;
        await api.super.deleteOrg(b.dataset.deactivate);
        await refresh();
      }),
    );
    main.querySelectorAll("[data-activate]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api.super.activateOrg(b.dataset.activate);
        await refresh();
      }),
    );

    // Acciones planes
    document.getElementById("new-plan")?.addEventListener("click", () => openPlanModal(null));
    main.querySelectorAll("[data-edit-plan]").forEach((b) => {
      const p = state.plans.find((x) => x.id === b.dataset.editPlan);
      b.addEventListener("click", () => openPlanModal(p));
    });
    main.querySelectorAll("[data-delete-plan]").forEach((b) => {
      const p = state.plans.find((x) => x.id === b.dataset.deletePlan);
      b.addEventListener("click", async () => {
        try {
          await api.super.deletePlan(b.dataset.deletePlan);
          ui.toast("Plan ocultado", "success");
          await refresh();
        } catch (err) {
          if (err.status === 409 && err.error === "has_subscribers") {
            const force = confirm(`Este plan tiene ${err.activeSubscribers} suscriptor(es) activos. ¿Seguro que quieres FORZAR el borrado? Las suscripciones quedarán huérfanas.`);
            if (force) {
              await api.superExtra.forceDeletePlan(b.dataset.deletePlan);
              ui.toast("Plan borrado", "success");
              await refresh();
            }
          } else {
            ui.toast(err.error || "Error", "error");
          }
        }
      });
    });
    // Filtro por línea
    main.querySelectorAll("[data-line]").forEach((b) =>
      b.addEventListener("click", () => {
        state.planLine = b.dataset.line;
        render();
      }),
    );
  }

  async function refresh() {
    await load();
    render();
  }

  function openNewOrgModal() {
    const m = ui.modal({
      title: "Nueva academia",
      body: `
        <form class="form" id="org-form">
          <label>Nombre comercial<input name="name" required /></label>
          <label>Slug (URL) <span class="help">solo minúsculas, números y guiones</span><input name="slug" required pattern="[a-z0-9-]+" /></label>
          <label>Tipo de cuenta
            <select name="type">
              <option value="academia">Academia</option>
              <option value="preparador_independiente">Preparador independiente</option>
              <option value="universidad">Universidad / EBAU</option>
            </select>
          </label>
          <div class="divider"></div>
          <h3>Administrador inicial</h3>
          <label>Nombre<input name="adminName" required /></label>
          <label>Email<input name="adminEmail" type="email" required /></label>
          <label>Contraseña<input name="adminPassword" type="password" required minlength="6" /></label>
          <div class="divider"></div>
          <h3>Marca</h3>
          <div class="grid cols-3">
            <label>Color principal<input class="color-input" name="primary" type="color" value="#155ea8"/></label>
            <label>Color oscuro<input class="color-input" name="secondary" type="color" value="#08264a"/></label>
            <label>Color acento<input class="color-input" name="accent" type="color" value="#0c8f6f"/></label>
          </div>
          <label>Lema<input name="tagline" /></label>
          <div id="logo-uploader-new"></div>
          <input type="hidden" name="logoUrl" />
          <input type="hidden" name="faviconUrl" />
          <div id="favicon-uploader-new"></div>
        </form>
      `,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save-org">Crear academia</button>`,
    });
    // Drop-zones para logo/favicon
    const setupUploader = (containerId, hint, fieldName) => {
      const el = m.el.querySelector(`#${containerId}`);
      const dz = ui.dropzone({
        title: hint,
        hint: "PNG, SVG, JPG (máx 2MB)",
        accept: "image/*",
        onUpload: async (f) => api.files.upload(f, "branding"),
        onComplete: (res) => {
          if (res?.file?.url || res?.file?.id) {
            const url = res.file.url || `/api/files/download/${res.file.id}`;
            m.el.querySelector(`input[name="${fieldName}"]`).value = url;
          }
        },
      });
      el.innerHTML = dz.html(`${containerId}-dz`);
      dz.bind(el.querySelector(`#${containerId}-dz`));
    };
    setupUploader("logo-uploader-new", "Subir logo", "logoUrl");
    setupUploader("favicon-uploader-new", "Subir favicon (opcional)", "faviconUrl");

    m.el.querySelector("#save-org").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#org-form"));
      try {
        await api.super.createOrg({
          name: fd.get("name"),
          slug: fd.get("slug"),
          type: fd.get("type") || "academia",
          adminName: fd.get("adminName"),
          adminEmail: fd.get("adminEmail"),
          adminPassword: fd.get("adminPassword"),
          branding: {
            primaryColor: fd.get("primary"),
            secondaryColor: fd.get("secondary"),
            accentColor: fd.get("accent"),
            tagline: fd.get("tagline"),
            logoUrl: fd.get("logoUrl") || "",
            faviconUrl: fd.get("faviconUrl") || "",
          },
        });
        ui.toast("Academia creada", "success");
        m.close();
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error al crear", "error");
      }
    };
  }

  function openEditOrgModal(orgId) {
    const o = state.organizations.find((x) => x.id === orgId);
    if (!o) return;
    const m = ui.modal({
      title: `Editar ${o.name}`,
      body: `
        <form class="form" id="org-form">
          <label>Nombre<input name="name" value="${ui.esc(o.name)}" /></label>
          <label>Lema<input name="tagline" value="${ui.esc(o.branding?.tagline || "")}" /></label>
          <div class="grid cols-3">
            <label>Color principal<input class="color-input" name="primary" type="color" value="${ui.esc(o.branding?.primaryColor || "#155ea8")}"/></label>
            <label>Color oscuro<input class="color-input" name="secondary" type="color" value="${ui.esc(o.branding?.secondaryColor || "#08264a")}"/></label>
            <label>Color acento<input class="color-input" name="accent" type="color" value="${ui.esc(o.branding?.accentColor || "#0c8f6f")}"/></label>
          </div>
          <label>Email contacto<input name="email" value="${ui.esc(o.contact?.email || "")}" /></label>
          <label>Teléfono<input name="phone" value="${ui.esc(o.contact?.phone || "")}" /></label>
          <label>CIF / NIF<input name="taxId" value="${ui.esc(o.billing?.taxId || "")}" /></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save">Guardar</button>`,
    });
    m.el.querySelector("#save").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#org-form"));
      try {
        await api.super.updateOrg(o.id, {
          name: fd.get("name"),
          branding: {
            ...(o.branding || {}),
            tagline: fd.get("tagline"),
            primaryColor: fd.get("primary"),
            secondaryColor: fd.get("secondary"),
            accentColor: fd.get("accent"),
          },
          contact: { ...(o.contact || {}), email: fd.get("email"), phone: fd.get("phone") },
          billing: { ...(o.billing || {}), taxId: fd.get("taxId") },
        });
        ui.toast("Cambios guardados", "success");
        m.close();
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error al guardar", "error");
      }
    };
  }

  function openPlanModal(plan) {
    const isNew = !plan;
    const line = plan?.line || "oposiciones";
    const m = ui.modal({
      title: isNew ? "Nuevo plan global" : `Editar ${plan.name}`,
      body: `
        <form class="form" id="plan-form">
          <label>Nombre<input name="name" required value="${ui.esc(plan?.name || "")}" /></label>
          <div class="grid cols-2">
            <label>Línea
              <select name="line">
                <option value="oposiciones" ${line === "oposiciones" ? "selected" : ""}>Oposiciones</option>
                <option value="universidad" ${line === "universidad" ? "selected" : ""}>Universidad</option>
                <option value="ebau" ${line === "ebau" ? "selected" : ""}>EBAU</option>
                <option value="preparador_independiente" ${line === "preparador_independiente" ? "selected" : ""}>Preparador independiente</option>
              </select>
            </label>
            <label>Dirigido a
              <select name="target">
                <option value="opositor" ${plan?.target === "opositor" ? "selected" : ""}>Opositor</option>
                <option value="preparador" ${plan?.target === "preparador" ? "selected" : ""}>Preparador</option>
                <option value="academia" ${plan?.target === "academia" ? "selected" : ""}>Academia</option>
              </select>
            </label>
          </div>
          <div class="grid cols-2">
            <label>Precio (€/mes)<input type="number" name="price" min="0" step="1" required value="${plan?.price ?? 0}" /></label>
            <label>Días de prueba<input type="number" name="trialDays" min="0" value="${plan?.trialDays || 0}" /></label>
          </div>
          <fieldset style="border:1px solid var(--border);padding:12px;border-radius:8px;">
            <legend><small class="muted">Cuota (solo planes para preparador)</small></legend>
            <div class="grid cols-2">
              <label>Máx. opositores<input type="number" name="maxOpositores" min="0" value="${plan?.quota?.maxOpositores || ""}" placeholder="Sin límite" /></label>
              <label>Máx. procesos<input type="number" name="maxProcesses" min="0" value="${plan?.quota?.maxProcesses || ""}" placeholder="Sin límite" /></label>
            </div>
          </fieldset>
          <label>Características (una por línea)<textarea name="features" rows="4">${ui.esc((plan?.features || []).join("\n"))}</textarea></label>
        </form>`,
      footer: `<button class="ghost" data-close>Cancelar</button><button class="btn" id="save">${isNew ? "Crear" : "Guardar"}</button>`,
    });
    m.el.querySelector("#save").onclick = async () => {
      const fd = new FormData(m.el.querySelector("#plan-form"));
      const maxO = Number(fd.get("maxOpositores"));
      const maxP = Number(fd.get("maxProcesses"));
      const data = {
        name: fd.get("name"),
        line: fd.get("line"),
        target: fd.get("target"),
        price: Number(fd.get("price")),
        trialDays: Number(fd.get("trialDays")),
        features: String(fd.get("features") || "").split("\n").map((s) => s.trim()).filter(Boolean),
      };
      if (maxO || maxP) data.quota = { maxOpositores: maxO || 999, maxProcesses: maxP || 999 };
      try {
        if (isNew) await api.super.createPlan(data);
        else await api.super.updatePlan(plan.id, data);
        ui.toast("Plan guardado", "success");
        m.close();
        await refresh();
      } catch (err) {
        ui.toast(err.error || "Error", "error");
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
