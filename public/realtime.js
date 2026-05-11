// Cliente WebSocket que sustituye al polling en salas Pomodoro y duelos.
// Si la conexión falla o se cierra, los componentes que lo usan caen al
// polling habitual — la app sigue funcionando sin WS.

const realtime = (() => {
  let ws = null;
  let connected = false;
  let reconnectTimer = null;
  const subs = new Map(); // channel → Set<callback>
  const pendingSubs = new Set();

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onopen = () => {
      connected = true;
      // Re-suscribirse a todos los canales pendientes
      for (const ch of pendingSubs) sendRaw({ type: "subscribe", channel: ch });
      for (const ch of subs.keys()) sendRaw({ type: "subscribe", channel: ch });
    };
    ws.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.type === "event" && data.channel) {
        const set = subs.get(data.channel);
        if (set) for (const cb of set) {
          try { cb(data); } catch (e) { console.error(e); }
        }
      } else if (data.type === "error") {
        console.warn("[ws]", data.error, data.channel || "");
      }
    };
    ws.onclose = () => {
      connected = false;
      ws = null;
      // Reintento cada 5s mientras haya canales suscritos
      if (subs.size > 0) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 5000);
      }
    };
    ws.onerror = () => { /* close manejará el reconnect */ };
  }

  function sendRaw(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function subscribe(channel, callback) {
    if (!subs.has(channel)) subs.set(channel, new Set());
    subs.get(channel).add(callback);
    if (!connected) connect();
    pendingSubs.add(channel);
    sendRaw({ type: "subscribe", channel });
    // Devolvemos función de unsubscribe
    return () => {
      const set = subs.get(channel);
      if (set) {
        set.delete(callback);
        if (!set.size) {
          subs.delete(channel);
          pendingSubs.delete(channel);
          sendRaw({ type: "unsubscribe", channel });
        }
      }
    };
  }

  function isConnected() { return connected; }

  return { subscribe, connect, isConnected };
})();

window.__realtime = realtime;
