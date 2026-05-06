// ─────────────────────────────────────────────────────────────────────────────
// Componente de calendario mensual reusable (admin/preparador/opositor).
//
//   const cal = calendarComponent({
//     onEventClick: (event) => {...},
//     onDayClick: (dateStr) => {...},
//     getEvents: async (from, to) => api.common.events(from, to),
//   });
//   container.innerHTML = await cal.render();
//   cal.bind(container);
//
// Estado interno: mes/año en curso. Navegación con < y >. Devuelve siempre
// las ocurrencias dentro del rango visible (incluye días del mes anterior y
// posterior visibles en la rejilla 6×7).
// ─────────────────────────────────────────────────────────────────────────────

const calendarComponent = (opts = {}) => {
  let cursor = new Date();
  cursor.setDate(1);
  let events = [];

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DOW = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

  function fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function localDow(d) { return (d.getDay() + 6) % 7; }

  // Calcular rango visible (lunes anterior al 1 → 6 semanas)
  function visibleRange() {
    const first = new Date(cursor);
    first.setDate(1);
    const startOffset = localDow(first);
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 41); // 6 semanas - 1
    return { start, end };
  }

  async function load() {
    const { start, end } = visibleRange();
    if (opts.getEvents) {
      try {
        const res = await opts.getEvents(fmt(start), fmt(end));
        events = res.events || [];
      } catch {
        events = [];
      }
    }
  }

  function eventsByDay() {
    const map = {};
    for (const e of events) {
      const d = e.occurrenceDate || e.date;
      if (!d) continue;
      if (!map[d]) map[d] = [];
      map[d].push(e);
    }
    return map;
  }

  function render() {
    const { start } = visibleRange();
    const monthLabel = `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`;
    const today = fmt(new Date());
    const map = eventsByDay();

    const cells = [];
    const cur = new Date(start);
    for (let i = 0; i < 42; i++) {
      const dStr = fmt(cur);
      const sameMonth = cur.getMonth() === cursor.getMonth();
      const isToday = dStr === today;
      const dayEvents = map[dStr] || [];
      const cls = ["calendar-cell", !sameMonth ? "other" : "", isToday ? "today" : ""].filter(Boolean).join(" ");
      cells.push(`
        <div class="${cls}" data-date="${dStr}">
          <div class="day-num">${cur.getDate()}</div>
          ${dayEvents.slice(0, 3).map((e) => {
            const tcls = ["calendar-event", (e.type || "evento").toLowerCase(), e.isOccurrence ? "" : "", e.recurrenceParentId ? "override" : ""].filter(Boolean).join(" ");
            return `<div class="${tcls}" data-event="${ui.esc(e.id)}" data-occurrence-date="${ui.esc(e.occurrenceDate || e.date)}" title="${ui.esc(e.title)} · ${ui.esc(e.time || "")}">
                ${e.time ? `<strong>${ui.esc(e.time)}</strong> ` : ""}${ui.esc(e.title)}
              </div>`;
          }).join("")}
          ${dayEvents.length > 3 ? `<div class="calendar-more" data-date="${dStr}">+${dayEvents.length - 3} más</div>` : ""}
        </div>`);
      cur.setDate(cur.getDate() + 1);
    }

    return `
      <div class="calendar">
        <div class="calendar-head">
          <h3>${monthLabel}</h3>
          <div class="calendar-nav">
            <button class="ghost sm" data-cal-prev>‹</button>
            <button class="ghost sm" data-cal-today>Hoy</button>
            <button class="ghost sm" data-cal-next>›</button>
          </div>
        </div>
        <div class="calendar-grid">
          ${DOW.map((d) => `<div class="calendar-dow">${d}</div>`).join("")}
          ${cells.join("")}
        </div>
      </div>
    `;
  }

  function bind(root) {
    root.querySelector("[data-cal-prev]")?.addEventListener("click", async () => {
      cursor.setMonth(cursor.getMonth() - 1);
      await reload(root);
    });
    root.querySelector("[data-cal-next]")?.addEventListener("click", async () => {
      cursor.setMonth(cursor.getMonth() + 1);
      await reload(root);
    });
    root.querySelector("[data-cal-today]")?.addEventListener("click", async () => {
      cursor = new Date();
      cursor.setDate(1);
      await reload(root);
    });
    root.querySelectorAll("[data-event]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.event;
        const occurrenceDate = el.dataset.occurrenceDate;
        const ev = events.find((x) => x.id === id && (x.occurrenceDate || x.date) === occurrenceDate);
        opts.onEventClick?.(ev);
      });
    });
    root.querySelectorAll("[data-date]").forEach((el) => {
      if (el.classList.contains("calendar-cell")) {
        el.addEventListener("click", () => {
          opts.onDayClick?.(el.dataset.date);
        });
      }
    });
  }

  async function reload(root) {
    await load();
    const wrap = document.createElement("div");
    wrap.innerHTML = render();
    root.replaceWith(wrap.firstElementChild);
    bind(wrap.firstElementChild);
  }

  async function init() {
    await load();
    return render();
  }

  return { init, render, bind, reload, get events() { return events; } };
};
