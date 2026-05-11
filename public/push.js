// Registro del Service Worker + suscripción a Web Push.
// Lo carga el frontend tras el login del opositor (no antes — si lo cargamos
// antes, pediríamos permisos de notificación a usuarios anónimos).

window.__push = (() => {
  let publicKey = null;

  async function register() {
    if (!("serviceWorker" in navigator)) return { supported: false };
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      return { supported: true, registration: reg };
    } catch (e) {
      console.warn("[sw:register]", e);
      return { supported: false, error: e.message };
    }
  }

  async function loadPublicKey() {
    if (publicKey) return publicKey;
    try {
      const r = await fetch("/api/webpush/public-key");
      if (!r.ok) return null;
      const data = await r.json();
      publicKey = data.publicKey || null;
      return publicKey;
    } catch { return null; }
  }

  function urlBase64ToUint8Array(base64) {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function subscribe() {
    const reg = (await register()).registration;
    if (!reg) return { ok: false, error: "no_sw" };
    const key = await loadPublicKey();
    if (!key) return { ok: false, error: "no_public_key" };
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "denied" };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    // Enviar la suscripción al servidor
    const r = await fetch("/api/webpush/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return r.ok ? { ok: true } : { ok: false, error: "server_failed" };
  }

  async function unsubscribe() {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { ok: true };
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/webpush/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    return { ok: true };
  }

  async function isSubscribed() {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  }

  return { register, subscribe, unsubscribe, isSubscribed };
})();
