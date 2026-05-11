// ─────────────────────────────────────────────────────────────────────────────
// Orquestador: gestiona la sesión y enruta al view correcto según el rol.
// ─────────────────────────────────────────────────────────────────────────────

const app = (() => {
  let currentUser = null;
  let currentOrg = null;

  async function loadSession() {
    try {
      const data = await api.auth.me();
      currentUser = data.user;
      currentOrg = data.organization;
      app.currentUser = currentUser;
      app.currentOrg = currentOrg;
      if (!currentUser) {
        await loginView.show();
        return;
      }
      // Aplicamos branding de la academia (si la hay)
      if (currentOrg) ui.applyBranding(currentOrg.branding);
      else ui.applyBranding(null);

      // Diferenciación visual por rol (~20:28)
      document.body.className = `role-${currentUser.role}`;

      // Si el usuario llegó con contraseña temporal (carga masiva CSV),
      // se le invita a cambiarla en cuanto entra. No bloqueamos el panel
      // pero mostramos un toast persistente y enviamos al perfil al primer
      // movimiento.
      if (currentUser.mustChangePassword) {
        ui.toast("Estás usando una contraseña temporal. Cámbiala en Mi perfil cuanto antes.", "warn");
      }

      // Manejar callback de Stripe Checkout (?checkout=success&plan=...)
      const params = new URLSearchParams(window.location.search);
      if (params.get("checkout") === "success" && params.get("plan")) {
        try {
          await api.billing.confirm({
            planId: params.get("plan"),
            mock: params.get("mock_subscription") === "1",
          });
          ui.toast("Suscripción activada", "success");
        } catch (e) { console.error(e); }
        // Limpiar URL
        window.history.replaceState({}, "", window.location.pathname);
      } else if (params.get("checkout") === "cancel") {
        ui.toast("Pago cancelado", "info");
        window.history.replaceState({}, "", window.location.pathname);
      }

      // Routing por rol
      if (currentUser.role === "superadmin") return superView.show();
      if (currentUser.role === "admin") return adminView.show();
      if (currentUser.role === "preparador") return preparadorView.show();
      if (currentUser.role === "opositor") return opositorView.show();

      ui.toast("Rol no reconocido", "error");
    } catch (err) {
      console.error(err);
      await loginView.show();
    }
  }

  async function logout() {
    try {
      await api.auth.logout();
    } finally {
      currentUser = null;
      currentOrg = null;
      app.currentUser = null;
      app.currentOrg = null;
      document.body.className = "";
      ui.applyBranding(null);
      await loginView.show();
    }
  }

  return { loadSession, logout, currentUser, currentOrg };
})();

document.addEventListener("DOMContentLoaded", () => app.loadSession());
