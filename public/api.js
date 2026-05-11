// ─────────────────────────────────────────────────────────────────────────────
// Cliente HTTP del frontend. Centraliza fetch + manejo de errores.
// ─────────────────────────────────────────────────────────────────────────────

const api = (() => {
  async function request(method, path, body, opts = {}) {
    const init = {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (opts.formData) {
      init.body = opts.formData;
      delete init.headers["Content-Type"]; // el browser pone el boundary
    }
    const res = await fetch(path, init);
    if (!res.ok) {
      let err = { error: `http_${res.status}` };
      try { err = await res.json(); } catch {}
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    const ct = res.headers.get("content-type") || "";
    return ct.includes("json") ? res.json() : res.text();
  }

  return {
    get: (p) => request("GET", p),
    post: (p, b) => request("POST", p, b),
    patch: (p, b) => request("PATCH", p, b),
    del: (p) => request("DELETE", p),
    upload: (p, formData) => request("POST", p, undefined, { formData }),

    // Endpoints concretos
    auth: {
      orgs: () => request("GET", "/api/auth/orgs"),
      orgBySlug: (slug) => request("GET", `/api/auth/org-by-slug/${encodeURIComponent(slug)}`),
      login: (data) => request("POST", "/api/auth/login", data),
      logout: () => request("POST", "/api/auth/logout"),
      me: () => request("GET", "/api/auth/me"),
      registerOpositor: (data) => request("POST", "/api/auth/register-opositor", data),
    },
    super: {
      dashboard: () => request("GET", "/api/superadmin/dashboard"),
      orgs: () => request("GET", "/api/superadmin/organizations"),
      createOrg: (data) => request("POST", "/api/superadmin/organizations", data),
      updateOrg: (id, data) => request("PATCH", `/api/superadmin/organizations/${id}`, data),
      deleteOrg: (id) => request("DELETE", `/api/superadmin/organizations/${id}`),
      activateOrg: (id) => request("POST", `/api/superadmin/organizations/${id}/activate`),
      plans: () => request("GET", "/api/superadmin/plans"),
      createPlan: (data) => request("POST", "/api/superadmin/plans", data),
      updatePlan: (id, data) => request("PATCH", `/api/superadmin/plans/${id}`, data),
      deletePlan: (id) => request("DELETE", `/api/superadmin/plans/${id}`),
    },
    admin: {
      org: () => request("GET", "/api/admin/organization"),
      updateOrg: (data) => request("PATCH", "/api/admin/organization", data),
      dashboard: () => request("GET", "/api/admin/dashboard"),
      users: () => request("GET", "/api/admin/users"),
      createUser: (data) => request("POST", "/api/admin/users", data),
      updateUser: (id, data) => request("PATCH", `/api/admin/users/${id}`, data),
      setUserStatus: (id, status) => request("PATCH", `/api/admin/users/${id}/status`, { status }),
      deleteUser: (id) => request("DELETE", `/api/admin/users/${id}`),
      assignments: () => request("GET", "/api/admin/assignments"),
      createAssignment: (data) => request("POST", "/api/admin/assignments", data),
      plans: () => request("GET", "/api/admin/plans"),
      createPlan: (data) => request("POST", "/api/admin/plans", data),
      updatePlan: (id, data) => request("PATCH", `/api/admin/plans/${id}`, data),
      subscriptions: () => request("GET", "/api/admin/subscriptions"),
      createSubscription: (data) => request("POST", "/api/admin/subscriptions", data),
    },
    common: {
      events: (from, to) => {
        const q = from && to ? `?from=${from}&to=${to}` : "";
        return request("GET", `/api/events${q}`);
      },
      createEvent: (data) => request("POST", "/api/events", data),
      updateEvent: (id, data, scope, date) => {
        const q = scope ? `?scope=${scope}${date ? `&date=${date}` : ""}` : "";
        return request("PATCH", `/api/events/${id}${q}`, data);
      },
      deleteEvent: (id, scope, date) => {
        const q = scope ? `?scope=${scope}${date ? `&date=${date}` : ""}` : "";
        return request("DELETE", `/api/events/${id}${q}`);
      },
      availability: (from, to) => {
        const q = from && to ? `?from=${from}&to=${to}` : "";
        return request("GET", `/api/availability${q}`);
      },
      createAvailability: (data) => request("POST", "/api/availability", data),
      deleteAvailability: (id) => request("DELETE", `/api/availability/${id}`),
      bookings: () => request("GET", "/api/bookings"),
      createBooking: (data) => request("POST", "/api/bookings", data),
      cancelBooking: (id) => request("PATCH", `/api/bookings/${id}/cancel`),
      interactions: () => request("GET", "/api/interactions"),
      createInteraction: (data) => request("POST", "/api/interactions", data),
      announcements: () => request("GET", "/api/announcements"),
      createAnnouncement: (data) => request("POST", "/api/announcements", data),
      people: () => request("GET", "/api/people"),
    },
    preparador: {
      dashboard: () => request("GET", "/api/preparador/dashboard"),
      syllabi: () => request("GET", "/api/preparador/syllabi"),
      createSyllabus: (data) => request("POST", "/api/preparador/syllabi", data),
      addTopic: (id, data) => request("POST", `/api/preparador/syllabi/${id}/topics`, data),
    },
    opositor: {
      dashboard: () => request("GET", "/api/opositor/dashboard"),
      syllabi: () => request("GET", "/api/opositor/syllabi"),
      updateCommitment: (data) => request("PATCH", "/api/opositor/commitment", data),
      replan: (data) => request("POST", "/api/opositor/replan", data || {}),
      updateTask: (planId, taskId, data) =>
        request("PATCH", `/api/opositor/tasks/${planId}/${taskId}`, data),
      saveHabit: (data) => request("POST", "/api/opositor/habits", data),
      updateProfile: (data) => request("PATCH", "/api/opositor/profile", data),
      setPhoto: (fileId) => request("PATCH", "/api/opositor/photo", { fileId }),
    },
    files: {
      upload: (file, kind) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", kind || "misc");
        return request("POST", "/api/files/upload", undefined, { formData: fd });
      },
      downloadUrl: (id) => `/api/files/download/${id}`,
    },

    // ── Fase 3 ──────────────────────────────────────────────────────────────

    syllabi: {
      get: (id) => request("GET", `/api/syllabi/${id}`),
      update: (id, data) => request("PATCH", `/api/syllabi/${id}`, data),
      updateTopic: (sid, tid, data) => request("PATCH", `/api/syllabi/${sid}/topics/${tid}`, data),
      deleteTopic: (sid, tid) => request("DELETE", `/api/syllabi/${sid}/topics/${tid}`),
      addAttachment: (sid, tid, data) => request("POST", `/api/syllabi/${sid}/topics/${tid}/attachments`, data),
      deleteAttachment: (sid, tid, aid) => request("DELETE", `/api/syllabi/${sid}/topics/${tid}/attachments/${aid}`),
    },
    materials: {
      list: () => request("GET", "/api/materials"),
      create: (data) => request("POST", "/api/materials", data),
      update: (id, data) => request("PATCH", `/api/materials/${id}`, data),
      delete: (id) => request("DELETE", `/api/materials/${id}`),
      trackDownload: (id) => request("POST", `/api/materials/${id}/track-download`),
    },
    corrections: {
      list: () => request("GET", "/api/corrections"),
      get: (id) => request("GET", `/api/corrections/${id}`),
      create: (data) => request("POST", "/api/corrections", data),
      update: (id, data) => request("PATCH", `/api/corrections/${id}`, data),
      submit: (id, data) => request("POST", `/api/corrections/${id}/submit`, data),
      score: (id, data) => request("POST", `/api/corrections/${id}/score`, data),
      reopen: (id, data) => request("POST", `/api/corrections/${id}/reopen`, data || {}),
      delete: (id) => request("DELETE", `/api/corrections/${id}`),
    },
    assessments: {
      list: (opositorId) => request("GET", `/api/assessments${opositorId ? `?opositorId=${opositorId}` : ""}`),
      create: (data) => request("POST", "/api/assessments", data),
      update: (id, data) => request("PATCH", `/api/assessments/${id}`, data),
      delete: (id) => request("DELETE", `/api/assessments/${id}`),
      types: () => request("GET", "/api/assessment-types"),
    },

    // ── Fase 4 ──────────────────────────────────────────────────────────────

    procedures: {
      catalog: () => request("GET", "/api/procedures/catalog"),
      list: (opositorId) => request("GET", `/api/procedures${opositorId ? `?opositorId=${opositorId}` : ""}`),
      install: (data) => request("POST", "/api/procedures/install", data),
      create: (data) => request("POST", "/api/procedures", data),
      update: (id, data) => request("PATCH", `/api/procedures/${id}`, data),
      delete: (id) => request("DELETE", `/api/procedures/${id}`),
    },
    chat: {
      threads: (opositorId) => request("GET", `/api/chat/threads${opositorId ? `?opositorId=${opositorId}` : ""}`),
      thread: (id) => request("GET", `/api/chat/threads/${id}`),
      createThread: (data) => request("POST", "/api/chat/threads", data || {}),
      sendMessage: (id, text) => request("POST", `/api/chat/threads/${id}/messages`, { text }),
      deleteThread: (id) => request("DELETE", `/api/chat/threads/${id}`),
      enable: (opositorId, enabled) => request("PATCH", `/api/chat/users/${opositorId}/enable`, { enabled }),
    },
    billing: {
      plans: () => request("GET", "/api/billing/plans"),
      subscription: () => request("GET", "/api/billing/subscription"),
      checkout: (planId) => request("POST", "/api/billing/checkout", { planId }),
      confirm: (data) => request("POST", "/api/billing/confirm", data),
      cancel: () => request("POST", "/api/billing/cancel"),
    },
    reports: {
      opositor: (id) => request("POST", `/api/reports/opositor/${id}`),
    },

    // ── Fase 5 — Mejoras de la transcripción ────────────────────────────────

    processes: {
      list: () => request("GET", "/api/processes"),
      quota: () => request("GET", "/api/processes/quota"),
      create: (data) => request("POST", "/api/processes", data),
      update: (id, data) => request("PATCH", `/api/processes/${id}`, data),
      delete: (id, force) => request("DELETE", `/api/processes/${id}${force ? "?force=true" : ""}`),
      assign: (id, opositorId) => request("POST", `/api/processes/${id}/assign`, { opositorId }),
    },
    ai: {
      generateTest: (data) => request("POST", "/api/ai/generate-test", data),
      generateSummary: (data) => request("POST", "/api/ai/generate-summary", data),
      generateConceptMap: (data) => request("POST", "/api/ai/generate-concept-map", data),
      artifacts: () => request("GET", "/api/ai/artifacts"),
      deleteArtifact: (id) => request("DELETE", `/api/ai/artifacts/${id}`),
      personalSyllabus: () => request("GET", "/api/ai/personal-syllabus"),
      addPersonalTopic: (data) => request("POST", "/api/ai/personal-syllabus/topics", data),
      deletePersonalTopic: (tid) => request("DELETE", `/api/ai/personal-syllabus/topics/${tid}`),
    },
    nps: {
      activeSurvey: () => request("GET", "/api/nps/active-survey"),
      respond: (data) => request("POST", "/api/nps/respond", data),
      responses: () => request("GET", "/api/nps/responses"),
    },
    challenges: {
      list: () => request("GET", "/api/challenges"),
      create: (data) => request("POST", "/api/challenges", data),
      update: (id, data) => request("PATCH", `/api/challenges/${id}`, data),
      delete: (id) => request("DELETE", `/api/challenges/${id}`),
      attempt: (id, data) => request("POST", `/api/challenges/${id}/attempt`, data),
      ranking: (id) => request("GET", `/api/challenges/${id}/ranking`),
    },
    preparadorMe: {
      update: (data) => request("PATCH", "/api/preparador/me", data),
      commitmentOf: (opositorId) => request("GET", `/api/preparador/opositores/${opositorId}/commitment`),
    },
    chatExtra: {
      status: () => request("GET", "/api/chat/status"),
      reply: (threadId, text) => request("POST", `/api/chat/threads/${threadId}/reply`, { text }),
      setMode: (mode) => request("PATCH", "/api/chat/me/mode", { mode }),
    },
    proceduresExtra: {
      addRegistry: (id, data) => request("POST", `/api/procedures/${id}/registry`, data),
      removeRegistry: (id, entryId) => request("DELETE", `/api/procedures/${id}/registry/${entryId}`),
    },
    superExtra: {
      togglePlan: (id, enabled) => request("PATCH", `/api/superadmin/plans/${id}`, { enabled }),
      forceDeletePlan: (id) => request("DELETE", `/api/superadmin/plans/${id}?force=true`),
    },
    adminExtra: {
      bulkUsers: (data) => request("POST", "/api/admin/users/bulk", data),
      togglePlanForOrg: (id) => request("POST", `/api/admin/plans/global/${id}/toggle`),
      npsTemplates: () => request("GET", "/api/admin/nps/templates"),
      npsResponses: () => request("GET", "/api/admin/nps/responses"),
      npsSend: (data) => request("POST", "/api/admin/nps/send", data),
    },
  };
})();
