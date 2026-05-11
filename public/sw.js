// Service Worker mínimo de OpoPlan.
//
// Funciones:
//   1. Cache estática de assets (mejora velocidad y permite uso offline
//      de la app shell — la API sigue requiriendo conexión).
//   2. Recepción de Web Push (notificaciones que llegan al smartphone /
//      smartwatch del usuario aunque la app esté cerrada).
//
// Honestidad:
//   - Esto NO sustituye una app nativa para Apple Watch / Wear OS, pero
//     en la práctica una PWA instalada con notificaciones activas hace
//     llegar los avisos al smartwatch del usuario a través del móvil.
//   - El cache offline cubre la app shell. Los datos siguen requiriendo red.

const CACHE_NAME = "opoplan-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/api.js",
  "/ui.js",
  "/realtime.js",
  "/audio.js",
  "/calendar.js",
  "/login.js",
  "/super.js",
  "/admin.js",
  "/preparador.js",
  "/opositor.js",
  "/app.js",
  "/manifest.webmanifest",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS).catch((e) => console.warn("[sw:install]", e))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estrategia: network-first para /api/, cache-first para assets estáticos.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) {
    // No cacheamos API — siempre va a red
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cacheamos solo respuestas correctas
        if (res.ok && url.origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match("/index.html")); // fallback offline
    })
  );
});

// Web Push: el servidor envía una notificación → la mostramos.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* texto plano */ }
  const title = data.title || "OpoPlan";
  const body = data.body || "Tienes una notificación";
  const icon = data.icon || "/favicon.svg";
  const tag = data.tag || "opoplan-default";
  const url = data.url || "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon, tag,
      data: { url },
      requireInteraction: !!data.requireInteraction,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Si hay una pestaña abierta con la app, foco; si no, abrimos
      for (const c of clients) {
        if (c.url.includes(location.origin)) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
