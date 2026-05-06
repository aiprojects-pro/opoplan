// ─────────────────────────────────────────────────────────────────────────────
// Helpers de UI: toast, modal, escape, fragments y aplicar branding por
// organización (variables CSS dinámicas).
// ─────────────────────────────────────────────────────────────────────────────

const ui = (() => {
  const root = () => document.getElementById("app");
  const toast = (msg, kind = "") => {
    const t = document.getElementById("toast");
    t.className = "toast";
    if (kind) t.classList.add(kind);
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 3500);
  };

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

  const on = (parent, event, selector, handler) => {
    parent.addEventListener(event, (e) => {
      const target = e.target.closest(selector);
      if (target && parent.contains(target)) handler(e, target);
    });
  };

  const modal = ({ title, body, footer, onClose }) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>${esc(title || "")}</h2>
          <button class="ghost sm" data-close>Cerrar</button>
        </div>
        <div class="modal-body"></div>
        ${footer ? '<div class="modal-foot"></div>' : ""}
      </div>`;
    if (typeof body === "string") $(".modal-body", bg).innerHTML = body;
    else if (body instanceof Node) $(".modal-body", bg).appendChild(body);
    if (footer) {
      const f = $(".modal-foot", bg);
      if (typeof footer === "string") f.innerHTML = footer;
      else if (footer instanceof Node) f.appendChild(footer);
    }
    document.body.appendChild(bg);
    const close = () => {
      bg.remove();
      if (onClose) onClose();
    };
    on(bg, "click", "[data-close]", close);
    bg.addEventListener("click", (e) => {
      if (e.target === bg) close();
    });
    return { close, el: bg };
  };

  // Inyecta los colores de marca de la organización como variables CSS
  const applyBranding = (branding) => {
    const r = document.documentElement.style;
    if (!branding) {
      r.removeProperty("--brand");
      r.removeProperty("--brand-dark");
      r.removeProperty("--accent");
      return;
    }
    if (branding.primaryColor) r.setProperty("--brand", branding.primaryColor);
    if (branding.secondaryColor) r.setProperty("--brand-dark", branding.secondaryColor);
    if (branding.accentColor) r.setProperty("--accent", branding.accentColor);
  };

  const formatEUR = (n) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n) || 0);

  const initials = (name) =>
    String(name || "")
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  // Icono según tipo MIME / extensión / kind
  const fileIcon = (kind, contentType, name) => {
    const ct = String(contentType || "").toLowerCase();
    const ext = String(name || "").split(".").pop().toLowerCase();
    if (kind === "pdf" || ct.includes("pdf") || ext === "pdf") return "📄";
    if (kind === "audio" || ct.startsWith("audio/")) return "🎧";
    if (kind === "video" || ct.startsWith("video/")) return "🎬";
    if (kind === "imagen" || ct.startsWith("image/")) return "🖼️";
    if (ct.includes("word") || ["doc", "docx"].includes(ext)) return "📝";
    if (ct.includes("excel") || ct.includes("sheet") || ["xls", "xlsx", "csv"].includes(ext)) return "📊";
    if (ct.includes("powerpoint") || ["ppt", "pptx"].includes(ext)) return "📽️";
    return "📎";
  };

  const formatBytes = (n) => {
    n = Number(n) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  // Componente de subida con drag & drop. Devuelve markup + bind.
  // Ejemplo de uso:
  //   const dz = ui.dropzone({
  //     hint: "Arrastra PDF, audio o vídeo...",
  //     accept: ".pdf,audio/*,video/*,image/*",
  //     multiple: true,
  //     onUpload: async (file) => api.files.upload(file, "topic"),
  //     onComplete: (uploaded) => {...},
  //   });
  //   container.innerHTML = dz.html("dropzone-1");
  //   dz.bind(container.querySelector("#dropzone-1"));
  const dropzone = (opts = {}) => {
    const id = opts.id || "dz_" + Math.random().toString(36).slice(2, 7);
    const html = (containerId) => `
      <div class="dropzone" id="${containerId || id}" data-dz>
        <strong>${opts.title || "Subir archivo"}</strong>
        <span>${opts.hint || "Arrastra aquí o pulsa para seleccionar"}</span>
        ${opts.help ? `<span class="help">${opts.help}</span>` : ""}
        <input type="file" hidden ${opts.multiple ? "multiple" : ""} ${opts.accept ? `accept="${opts.accept}"` : ""}>
        <div class="dropzone-files" data-dz-files></div>
      </div>`;

    const bind = (el) => {
      const input = el.querySelector("input[type=file]");
      const filesEl = el.querySelector("[data-dz-files]");
      el.addEventListener("click", (e) => { if (e.target === el || e.target.tagName === "STRONG" || e.target.tagName === "SPAN") input.click(); });
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
      el.addEventListener("dragleave", () => el.classList.remove("over"));
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        el.classList.remove("over");
        await handleFiles(Array.from(e.dataTransfer.files));
      });
      input.addEventListener("change", async () => {
        await handleFiles(Array.from(input.files));
        input.value = "";
      });

      async function handleFiles(files) {
        for (const f of files) {
          const tmpId = "f_" + Math.random().toString(36).slice(2, 7);
          const pill = document.createElement("div");
          pill.className = "file-pill";
          pill.id = tmpId;
          pill.innerHTML = `
            <div class="icon">${fileIcon(null, f.type, f.name)}</div>
            <div class="meta"><strong>${esc(f.name)}</strong><small>${formatBytes(f.size)} · subiendo…</small></div>
          `;
          filesEl.appendChild(pill);
          try {
            const result = await opts.onUpload?.(f);
            const meta = pill.querySelector(".meta small");
            if (meta) meta.textContent = `${formatBytes(f.size)} · ✓ subido`;
            opts.onComplete?.(result, f);
          } catch (err) {
            const meta = pill.querySelector(".meta small");
            if (meta) meta.innerHTML = `<span style="color:var(--danger);">Error al subir</span>`;
            console.error("[upload]", err);
          }
        }
      }
    };

    return { html, bind };
  };

  // Mini-gráfica de barras SVG
  // data: [{ label, value }], maxValue: opcional
  const barChart = (data, opts = {}) => {
    const w = opts.width || 360;
    const h = opts.height || 140;
    const padL = 28, padR = 6, padT = 8, padB = 24;
    const max = opts.maxValue || Math.max(1, ...data.map((d) => d.value));
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const bw = data.length ? Math.min(36, innerW / data.length - 6) : 0;
    const step = data.length ? innerW / data.length : 0;
    const yT = (v) => padT + innerH - (v / max) * innerH;

    const yLabels = [0, max / 2, max];
    return `
      <svg class="minichart" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        ${yLabels.map((y) => `
          <line class="grid" x1="${padL}" y1="${yT(y)}" x2="${w - padR}" y2="${yT(y)}"/>
          <text class="label" x="${padL - 4}" y="${yT(y) + 3}" text-anchor="end">${Math.round(y * 10) / 10}</text>
        `).join("")}
        ${data.map((d, i) => `
          <rect class="bar" x="${padL + step * i + (step - bw) / 2}" y="${yT(d.value)}" width="${bw}" height="${padT + innerH - yT(d.value)}" rx="3">
            <title>${esc(d.label)}: ${d.value}</title>
          </rect>
          <text class="label" x="${padL + step * i + step / 2}" y="${h - 6}" text-anchor="middle">${esc(d.label).slice(0, 8)}</text>
        `).join("")}
      </svg>`;
  };

  // Mini-gráfica de líneas SVG (evolución temporal)
  const lineChart = (data, opts = {}) => {
    const w = opts.width || 360;
    const h = opts.height || 140;
    const padL = 28, padR = 6, padT = 10, padB = 24;
    if (data.length === 0) return `<svg class="minichart" viewBox="0 0 ${w} ${h}"></svg>`;
    const max = opts.maxValue || Math.max(1, ...data.map((d) => d.value));
    const min = opts.minValue ?? 0;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const xT = (i) => padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const yT = (v) => padT + innerH - ((v - min) / (max - min)) * innerH;

    const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${xT(i)},${yT(d.value)}`).join(" ");
    const area = path + ` L${xT(data.length - 1)},${padT + innerH} L${xT(0)},${padT + innerH} Z`;

    const yLabels = [min, (min + max) / 2, max];
    const threshold = opts.threshold;

    return `
      <svg class="minichart" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        ${yLabels.map((y) => `
          <line class="grid" x1="${padL}" y1="${yT(y)}" x2="${w - padR}" y2="${yT(y)}"/>
          <text class="label" x="${padL - 4}" y="${yT(y) + 3}" text-anchor="end">${Math.round(y * 10) / 10}</text>
        `).join("")}
        ${threshold != null ? `<line class="threshold" x1="${padL}" y1="${yT(threshold)}" x2="${w - padR}" y2="${yT(threshold)}"/>` : ""}
        <path class="area" d="${area}"/>
        <path class="line" d="${path}"/>
        ${data.map((d, i) => `
          <circle class="point" cx="${xT(i)}" cy="${yT(d.value)}" r="3">
            <title>${esc(d.label)}: ${d.value}</title>
          </circle>
        `).join("")}
        ${data.length <= 8 ? data.map((d, i) => `
          <text class="label" x="${xT(i)}" y="${h - 6}" text-anchor="middle">${esc(d.label).slice(0, 5)}</text>
        `).join("") : ""}
      </svg>`;
  };

  return { root, toast, esc, $, $$, on, modal, applyBranding, formatEUR, initials, fileIcon, formatBytes, dropzone, barChart, lineChart };
})();
