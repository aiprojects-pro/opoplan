// Realtime — WebSocket para salas Pomodoro y duelos.
//
// Cuando un cliente se conecta, se identifica con la cookie de sesión y
// se suscribe a canales que le interesan (`room:<id>`, `duel:<id>`).
// Al ocurrir cambios en el estado (cambio de fase, miembro entra/sale,
// duelo pasa a accepted/finished), el servidor emite a los suscriptores.
//
// Si el cliente no tiene WebSocket, la app sigue funcionando con polling
// HTTP — los endpoints REST no han cambiado. WS es una mejora opcional.

const WebSocket = require("ws");
const url = require("node:url");
const cookieLib = require("cookie");
const auth = require("../middleware/auth");
const db = require("../lib/db");

let wss = null;
const channels = new Map(); // channel → Set<ws>

function attach(server, { sessionSecret } = {}) {
  if (wss) return wss;
  wss = new WebSocket.Server({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const cookies = req.headers.cookie ? cookieLib.parse(req.headers.cookie) : {};
    const token = cookies.opoplan_session;
    const payload = auth.verifyToken
      ? auth.verifyToken(token, sessionSecret)
      : verifyToken(token, sessionSecret);
    if (!payload) {
      ws.send(JSON.stringify({ type: "error", error: "auth_required" }));
      ws.close();
      return;
    }
    const user = db.findOne("users", (u) => u.id === payload.userId && u.status === "active");
    if (!user) { ws.close(); return; }
    ws.userId = user.id;
    ws.organizationId = user.organizationId;
    ws.subs = new Set();
    ws.send(JSON.stringify({ type: "ready", userId: user.id }));

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === "subscribe" && typeof msg.channel === "string") {
        if (canSubscribe(user, msg.channel)) {
          subscribe(ws, msg.channel);
          ws.send(JSON.stringify({ type: "subscribed", channel: msg.channel }));
        } else {
          ws.send(JSON.stringify({ type: "error", error: "forbidden_channel", channel: msg.channel }));
        }
      } else if (msg.type === "unsubscribe" && typeof msg.channel === "string") {
        unsubscribe(ws, msg.channel);
      } else if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", at: Date.now() }));
      }
    });

    ws.on("close", () => {
      for (const ch of ws.subs) {
        const set = channels.get(ch);
        if (set) {
          set.delete(ws);
          if (!set.size) channels.delete(ch);
        }
      }
    });
  });

  return wss;
}

function canSubscribe(user, channel) {
  // Por seguridad, restringimos canales al opositor:
  //   - room:<id> solo si está en la sala
  //   - duel:<id> solo si participa en el duelo
  //   - org:<orgId> solo si pertenece a la organización
  if (channel.startsWith("room:")) {
    const roomId = channel.slice(5);
    const room = db.findOne("studyRooms", (r) => r.id === roomId);
    if (!room) return false;
    return (room.members || []).includes(user.id);
  }
  if (channel.startsWith("duel:")) {
    const duelId = channel.slice(5);
    const duel = db.findOne("duels", (d) => d.id === duelId);
    if (!duel) return false;
    return duel.challengerId === user.id || duel.opponentId === user.id;
  }
  if (channel.startsWith("org:")) {
    return user.organizationId === channel.slice(4);
  }
  return false;
}

function subscribe(ws, channel) {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(ws);
  ws.subs.add(channel);
}

function unsubscribe(ws, channel) {
  const set = channels.get(channel);
  if (set) {
    set.delete(ws);
    if (!set.size) channels.delete(channel);
  }
  ws.subs.delete(channel);
}

// Emite un evento a todos los subscriptores de un canal.
function emit(channel, payload) {
  const set = channels.get(channel);
  if (!set) return 0;
  const text = JSON.stringify({ type: "event", channel, ...payload });
  let count = 0;
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(text);
      count += 1;
    }
  }
  return count;
}

// Fallback de verificación por si auth.verifyToken no está expuesto
function verifyToken(token, secret) {
  if (!token) return null;
  try {
    const crypto = require("node:crypto");
    const [b64, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", secret || "opoplan-dev-secret-change-me")
      .update(b64).digest("base64url");
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (_e) {
    return null;
  }
}

module.exports = { attach, emit, channels: () => channels };
