const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────────────────────
// Servicio de videoconferencia. Genera enlaces para tutorías reservadas.
//
// Estrategia de selección (igual que email/storage/ai):
//   1. Si la ACADEMIA tiene integración activa → usa la suya.
//   2. Si hay variables de entorno globales → fallback de plataforma.
//   3. Mock → genera URL ficticia consistente para entorno de desarrollo.
//
// Proveedores:
//   - jitsi: público (meet.jit.si) o auto-hospedado. NO requiere autenticación,
//     se genera una URL única. Funciona out-of-the-box en producción.
//   - zoom:  Server-to-Server OAuth (account credentials). Requiere accountId
//     + apiKey (clientId) + clientSecret. Crea meeting via /v2/users/me/meetings.
//   - meet:  Google Calendar API (conferenceData.createRequest). Requiere
//     refreshToken OAuth2 del organizador + clientId + clientSecret.
//   - teams: Microsoft Graph API (/me/onlineMeetings). Requiere refreshToken
//     OAuth2 + clientId + clientSecret + tenantId (accountId).
// ─────────────────────────────────────────────────────────────────────────────

function makeMock() {
  return {
    provider: "mock",
    async createMeeting({ title }) {
      const id = crypto.randomBytes(6).toString("hex");
      return {
        provider: "mock",
        joinUrl: `https://example.com/meet/${id}`,
        hostUrl: `https://example.com/meet/${id}?host=1`,
        meetingId: id,
        passcode: null,
        mocked: true,
      };
    },
  };
}

function slugify(s) {
  return String(s || "tutoria")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30) || "tutoria";
}

function makeJitsi(cfg = {}) {
  // Si hay accountId lo usamos como dominio (auto-hospedado), si no meet.jit.si
  const base = cfg.accountId
    ? (cfg.accountId.startsWith("http") ? cfg.accountId : `https://${cfg.accountId}`)
    : "https://meet.jit.si";
  return {
    provider: "jitsi",
    async createMeeting({ title }) {
      const id = `${slugify(title)}-${crypto.randomBytes(4).toString("hex")}`;
      const url = `${base}/${id}`;
      return {
        provider: "jitsi",
        joinUrl: url,
        hostUrl: url,
        meetingId: id,
        passcode: null,
      };
    },
  };
}

function makeZoom(cfg = {}) {
  // Server-to-Server OAuth: requiere accountId + apiKey (clientId) + clientSecret
  if (!cfg.accountId || !cfg.apiKey || !cfg.clientSecret) {
    return null;
  }
  let cachedToken = null;
  let cachedUntil = 0;

  async function getToken() {
    if (cachedToken && Date.now() < cachedUntil) return cachedToken;
    const auth = Buffer.from(`${cfg.apiKey}:${cfg.clientSecret}`).toString("base64");
    const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.accountId)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`zoom_oauth_${res.status}: ${err}`);
    }
    const data = await res.json();
    cachedToken = data.access_token;
    cachedUntil = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
  }

  return {
    provider: "zoom",
    async createMeeting({ title, startAt, durationMin }) {
      const token = await getToken();
      const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: title || "Tutoría",
          type: 2, // scheduled
          start_time: startAt, // ISO 8601
          duration: durationMin || 60,
          timezone: "Europe/Madrid",
          settings: {
            join_before_host: true,
            waiting_room: false,
            mute_upon_entry: false,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`zoom_create_${res.status}: ${err}`);
      }
      const data = await res.json();
      return {
        provider: "zoom",
        joinUrl: data.join_url,
        hostUrl: data.start_url,
        meetingId: String(data.id),
        passcode: data.password || null,
      };
    },
  };
}

function makeMeet(cfg = {}) {
  // Google Calendar API con conferenceData.createRequest.
  // Requiere refreshToken OAuth2 del organizador + clientId (apiKey) + clientSecret.
  // Si solo hay accessToken vivo, también vale.
  if (!cfg.accessToken && (!cfg.refreshToken || !cfg.apiKey || !cfg.clientSecret)) {
    return null;
  }
  let cachedToken = cfg.accessToken || null;
  let cachedUntil = cfg.accessToken ? Infinity : 0;

  async function getToken() {
    if (cachedToken && Date.now() < cachedUntil) return cachedToken;
    const params = new URLSearchParams({
      client_id: cfg.apiKey,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`meet_refresh_${res.status}: ${err}`);
    }
    const data = await res.json();
    cachedToken = data.access_token;
    cachedUntil = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
  }

  return {
    provider: "meet",
    async createMeeting({ title, startAt, durationMin, attendees }) {
      const token = await getToken();
      const start = new Date(startAt);
      const end = new Date(start.getTime() + (durationMin || 60) * 60000);
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title || "Tutoría",
            start: { dateTime: start.toISOString(), timeZone: "Europe/Madrid" },
            end: { dateTime: end.toISOString(), timeZone: "Europe/Madrid" },
            attendees: (attendees || []).map((email) => ({ email })),
            conferenceData: {
              createRequest: {
                requestId: crypto.randomBytes(8).toString("hex"),
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
        },
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`meet_create_${res.status}: ${err}`);
      }
      const data = await res.json();
      const link =
        data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
        data.hangoutLink;
      if (!link) throw new Error("meet_no_link");
      return {
        provider: "meet",
        joinUrl: link,
        hostUrl: link,
        meetingId: data.id,
        eventId: data.id, // id del evento en Google Calendar
      };
    },
  };
}

function makeTeams(cfg = {}) {
  // Microsoft Graph API: POST /me/onlineMeetings (modo delegado)
  // Requiere refreshToken + clientId (apiKey) + clientSecret + tenantId (accountId).
  if (!cfg.accessToken && (!cfg.refreshToken || !cfg.apiKey || !cfg.clientSecret || !cfg.accountId)) {
    return null;
  }
  let cachedToken = cfg.accessToken || null;
  let cachedUntil = cfg.accessToken ? Infinity : 0;

  async function getToken() {
    if (cachedToken && Date.now() < cachedUntil) return cachedToken;
    const params = new URLSearchParams({
      client_id: cfg.apiKey,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/.default offline_access",
    });
    const res = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(cfg.accountId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`teams_refresh_${res.status}: ${err}`);
    }
    const data = await res.json();
    cachedToken = data.access_token;
    cachedUntil = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
  }

  return {
    provider: "teams",
    async createMeeting({ title, startAt, durationMin }) {
      const token = await getToken();
      const start = new Date(startAt);
      const end = new Date(start.getTime() + (durationMin || 60) * 60000);
      const res = await fetch("https://graph.microsoft.com/v1.0/me/onlineMeetings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: title || "Tutoría",
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`teams_create_${res.status}: ${err}`);
      }
      const data = await res.json();
      return {
        provider: "teams",
        joinUrl: data.joinWebUrl,
        hostUrl: data.joinWebUrl,
        meetingId: data.id,
        passcode: data.audioConferencing?.conferenceId || null,
      };
    },
  };
}

function makeProvider(cfg) {
  if (!cfg || !cfg.provider) return null;
  const p = String(cfg.provider).toLowerCase();
  if (p === "jitsi") return makeJitsi(cfg);
  if (p === "zoom") return makeZoom(cfg);
  if (p === "meet") return makeMeet(cfg);
  if (p === "teams") return makeTeams(cfg);
  return null;
}

function fromEnv(env) {
  if (!env || !env.VIDEOCONFERENCE_PROVIDER) return makeMock();
  return makeProvider({
    provider: env.VIDEOCONFERENCE_PROVIDER,
    apiKey: env.VIDEOCONFERENCE_API_KEY,
    clientSecret: env.VIDEOCONFERENCE_CLIENT_SECRET,
    accountId: env.VIDEOCONFERENCE_ACCOUNT_ID,
    refreshToken: env.VIDEOCONFERENCE_REFRESH_TOKEN,
    accessToken: env.VIDEOCONFERENCE_ACCESS_TOKEN,
  }) || makeMock();
}

function fromOrg(org, fallback) {
  const cfg = org && org.integrations && org.integrations.videoconference;
  if (!cfg || !cfg.provider) return fallback;
  const p = makeProvider(cfg);
  return p || fallback;
}

module.exports = {
  fromEnv,
  fromOrg,
  makeMock,
  makeJitsi,
  makeZoom,
  makeMeet,
  makeTeams,
  makeProvider,
};
