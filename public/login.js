// ─────────────────────────────────────────────────────────────────────────────
// Pantalla de login. Cuatro pestañas: super-admin, admin, preparador, opositor.
// Cada pestaña gestiona su propio email (no se persiste entre pestañas, era
// uno de los bugs reportados).
// El branding se aplica si el usuario indica una academia (slug); el
// super-admin no necesita academia.
// ─────────────────────────────────────────────────────────────────────────────

const loginView = (() => {
  let state = {
    role: "opositor",
    emails: { superadmin: "", admin: "", preparador: "", opositor: "" },
    orgSlug: "",
    orgs: [],
  };

  async function loadOrgs() {
    try {
      const data = await api.auth.orgs();
      state.orgs = data.orgs || [];
    } catch {
      state.orgs = [];
    }
  }

  function render() {
    const html = `
      <div class="login-page">
        <aside class="login-hero">
          <div>
            <div class="brand-row">
              <div class="brand-mark">OP</div>
              <div>
                <strong style="font-size: 1.1rem; font-weight: 800;">OpoPlan</strong>
                <div style="font-size: 0.82rem; color: rgba(255,255,255,0.7);">Plataforma multi-academia</div>
              </div>
            </div>
            <h1 style="margin-top: 80px;">Preparación inteligente para oposiciones.</h1>
            <p>
              Plataforma multi-tenant: cada academia personaliza su entorno, planes y comunicación.
              Tutorías, planificación recalculable, correcciones, hábitos y agenda — todo conectado.
            </p>
          </div>
          <div class="hero-features">
            <div class="hero-feature"><span class="dot"></span><div><strong>Branding propio</strong><br/>Logo, colores y dominio configurables por academia.</div></div>
            <div class="hero-feature"><span class="dot"></span><div><strong>Suscripciones flexibles</strong><br/>Planes globales y planes propios. Free / Premium / Premium + tutorías.</div></div>
            <div class="hero-feature"><span class="dot"></span><div><strong>IA + comunicación</strong><br/>Chatbot por opositor, recordatorios por email y recálculo automático.</div></div>
          </div>
        </aside>

        <section class="login-panel">
          <div class="card">
            <div class="role-tabs" id="role-tabs">
              <button data-role="opositor" ${state.role === "opositor" ? 'class="active"' : ""}>Opositor</button>
              <button data-role="preparador" ${state.role === "preparador" ? 'class="active"' : ""}>Preparador</button>
              <button data-role="admin" ${state.role === "admin" ? 'class="active"' : ""}>Admin academia</button>
              <button data-role="superadmin" ${state.role === "superadmin" ? 'class="active"' : ""}>Super-admin</button>
            </div>

            <h2 style="margin-bottom: 4px;">${roleTitle(state.role)}</h2>
            <p class="muted text-sm mb-4">${roleSubtitle(state.role)}</p>

            <form class="form" id="login-form">
              ${
                state.role !== "superadmin"
                  ? `<label>
                      Academia
                      <select name="orgSlug" required>
                        <option value="">— selecciona tu academia —</option>
                        ${state.orgs.map((o) => `<option value="${ui.esc(o.slug)}" ${o.slug === state.orgSlug ? "selected" : ""}>${ui.esc(o.name)}</option>`).join("")}
                      </select>
                    </label>`
                  : ""
              }
              <label>
                Email
                <input type="email" name="email" required value="${ui.esc(state.emails[state.role] || "")}" autocomplete="email" />
              </label>
              <label>
                Contraseña
                <input type="password" name="password" required autocomplete="current-password" />
              </label>
              <button type="submit" class="btn">Entrar</button>
            </form>

            ${
              state.role === "opositor"
                ? `<div class="text-center text-sm muted mt-4">¿Aún no tienes cuenta? <a href="#" id="goto-register">Regístrate aquí</a></div>`
                : ""
            }

          </div>
        </section>
      </div>
    `;
    ui.root().innerHTML = html;
    bindEvents();
  }

  function roleTitle(role) {
    return {
      opositor: "Acceso opositor",
      preparador: "Acceso preparador",
      admin: "Acceso administrador",
      superadmin: "Acceso super-administrador",
    }[role];
  }
  function roleSubtitle(role) {
    return {
      opositor: "Entra a tu plan personalizado de estudio.",
      preparador: "Gestiona tus opositores, temarios y tutorías.",
      admin: "Personaliza tu academia, planes y configuración.",
      superadmin: "Gestiona toda la plataforma y las academias.",
    }[role];
  }

  function bindEvents() {
    const tabs = document.getElementById("role-tabs");
    const form = document.getElementById("login-form");

    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-role]");
      if (!btn) return;
      // Guardar email antes de cambiar
      const emailInput = form?.querySelector("[name=email]");
      if (emailInput) state.emails[state.role] = emailInput.value;
      state.role = btn.dataset.role;
      render();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = {
        role: state.role,
        email: fd.get("email"),
        password: fd.get("password"),
        orgSlug: fd.get("orgSlug") || undefined,
      };
      try {
        const resp = await api.auth.login(data);
        ui.toast(`Bienvenido, ${resp.user.name}`, "success");
        if (resp.organization) ui.applyBranding(resp.organization.branding);
        await app.loadSession();
      } catch (err) {
        ui.toast(err.error === "invalid_credentials" ? "Credenciales incorrectas" : err.error || "Error de acceso", "error");
      }
    });

    document.getElementById("goto-register")?.addEventListener("click", (e) => {
      e.preventDefault();
      registerView.show();
    });
  }

  return {
    show: async () => {
      ui.applyBranding(null);
      await loadOrgs();
      render();
    },
  };
})();

// Vista mínima de registro de opositor
const registerView = (() => {
  return {
    show: async () => {
      let orgs = [];
      try {
        const data = await api.auth.orgs();
        orgs = data.orgs || [];
      } catch {}
      ui.root().innerHTML = `
        <div class="login-page">
          <aside class="login-hero"><div><h1>Crea tu cuenta de opositor</h1><p>Empieza con el plan Free. Podrás cambiar a Premium cuando quieras desde tu panel.</p></div></aside>
          <section class="login-panel">
            <div class="card">
              <h2>Registro</h2>
              <form class="form mt-4" id="reg-form">
                <label>Academia
                  <select name="orgSlug" required>
                    <option value="">— selecciona —</option>
                    ${orgs.map((o) => `<option value="${ui.esc(o.slug)}">${ui.esc(o.name)}</option>`).join("")}
                  </select>
                </label>
                <label>Nombre completo<input name="name" required /></label>
                <label>Email<input name="email" type="email" required /></label>
                <label>Teléfono<input name="phone" /></label>
                <label>Contraseña<input name="password" type="password" required minlength="6" /></label>
                <button class="btn" type="submit">Crear cuenta</button>
                <button class="ghost" type="button" id="back-login">Volver</button>
              </form>
            </div>
          </section>
        </div>`;
      document.getElementById("back-login").onclick = () => loginView.show();
      document.getElementById("reg-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = Object.fromEntries(fd);
        try {
          await api.auth.registerOpositor(body);
          ui.toast("Cuenta creada", "success");
          await app.loadSession();
        } catch (err) {
          ui.toast(err.error || "Error", "error");
        }
      };
    },
  };
})();
