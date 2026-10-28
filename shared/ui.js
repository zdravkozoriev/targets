// Общи части на интерфейса: известия, фойерверки, класация и график.
import { data } from "./store.js";
import { esc, money, dm, parse, addDays, weekStart, TODAY, WD, monthName } from "./util.js";
import { person, colorOf, activeStaff, shiftType, periodStats, contestPeriod } from "./logic.js";

export const chip = id => `<span class="chip" style="--cc:${colorOf(id)}">${esc(person(id)?.name || "Бивш колега")}</span>`;
export const dot = id => `<span class="dot" style="--cc:${colorOf(id)}"></span>`;
export const bar = (v, of, thin) => `<div class="bar ${thin ? "thin" : ""} ${of && v >= of ? "done" : ""}"><i style="width:${of ? Math.min(100, v / of * 100) : 0}%"></i></div>`;

// ---------- известия ----------
let toastTimer = null;
export function toast(msg, undo) {
  const el = document.getElementById("toast");
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button" id="undo-btn">Отмени</button>` : ""}`;
  el.hidden = false;
  if (undo) document.getElementById("undo-btn").onclick = () => { el.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

export function celebrate(name, goal) {
  const root = document.getElementById("celebrate");
  root.innerHTML = `<div class="celebrate"><div class="box"><b>Целта е изпълнена!</b><div>${esc(name)}, направи ${goal} от ${goal} за смяната. Всяка продажба оттук нататък е бонус отгоре.</div><button class="btn primary" type="button" id="cel-ok">Продължавам</button></div></div>`;
  const close = () => { root.innerHTML = ""; };
  document.getElementById("cel-ok").onclick = close;
  root.firstElementChild.onclick = e => { if (e.target === root.firstElementChild) close(); };
}

// ---------- фойерверки ----------
export const fx = (() => {
  let cv, ctx, parts = [], raf = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  function ensure() {
    if (cv) return;
    cv = document.createElement("canvas");
    cv.className = "fx"; cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    ctx = cv.getContext("2d");
  }
  function size() {
    const r = devicePixelRatio || 1;
    cv.width = innerWidth * r; cv.height = innerHeight * r;
    ctx.setTransform(r, 0, 0, r, 0, 0);
  }
  const colors = () => {
    const cs = getComputedStyle(document.documentElement);
    return ["--energy", "--accent", "--good", "--c3", "--c4", "--c5"].map(v => cs.getPropertyValue(v).trim());
  };
  function burst(x, y, n, power) {
    ensure();
    const cols = colors();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = power * (0.35 + Math.random() * 0.85);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.011 + Math.random() * 0.014, c: cols[i % cols.length], r: 1.8 + Math.random() * 2.4 });
    }
    if (!raf) { size(); raf = requestAnimationFrame(tick); }
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.11;
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  const sky = (delay, n, power) => setTimeout(() => burst(innerWidth * (0.12 + Math.random() * 0.76), innerHeight * (0.15 + Math.random() * 0.3), n, power), delay);
  return {
    sale(el) {
      if (reduce.matches) return;
      const r = el?.getBoundingClientRect();
      burst(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + r.height / 2 : innerHeight / 2, 55, 5.5);
      sky(160, 80, 6.5);
      sky(420, 70, 6);
    },
    big() {
      if (reduce.matches) return;
      for (let i = 0; i < 9; i++) sky(i * 240, 100, 7.5);
    }
  };
})();

// ---------- класация ----------
const METRIC_LABEL = { pct: "% изпълнение на целите за смените", bonus: "изкаран бонус", qty: "продадени бройки" };
export const METRICS = [["pct", "% изпълнение на целите за смените"], ["bonus", "изкаран бонус"], ["qty", "продадени бройки"]];

export function viewBoard({ me, metric: chosen }) {
  const c = data.cfg;
  if (!activeStaff().length) return `<section class="card"><h2>Класацията е празна</h2><p class="muted">Щом мениджърът добави колеги и те започнат да продават, тук ще се вижда кой води.</p></section>`;
  const per = contestPeriod();
  const metric = per.contest ? c.contest.metric : (chosen || "pct");
  const rows = activeStaff().map(s => ({ s, st: periodStats(s.id, per.from, per.to) }));
  const val = r => metric === "bonus" ? r.st.bonus : metric === "qty" ? r.st.qty : (r.st.pct ?? 0);
  rows.sort((a, b) => val(b) - val(a));
  const top = Math.max(...rows.map(val), 0.0001);
  const fmt = r => metric === "bonus" ? money(r.st.bonus) : metric === "qty" ? r.st.qty + " бр." : (r.st.pct === null ? "–" : Math.round(r.st.pct * 100) + " %");
  const ended = per.contest && c.contest.to < TODAY;
  const head = per.contest
    ? `<section class="contest"><span class="eyebrow">${ended ? "Състезанието приключи" : "Състезание"} · ${dm(per.from)} – ${dm(per.to)}</span><span class="t">${esc(c.contest.title || "Състезание")}</span>${c.contest.prize ? `<span class="p">Награда: ${esc(c.contest.prize)}</span>` : ""}<span class="m">Класиране по ${METRIC_LABEL[metric]}</span></section>`
    : `<div class="sec-head"><h2>Класация за ${monthName(TODAY)}</h2><div class="row">${["pct", "bonus", "qty"].map(m => `<button type="button" class="seg" data-act="metric" data-id="${m}" aria-pressed="${metric === m}">${{ pct: "% цел", bonus: "Бонус", qty: "Бройки" }[m]}</button>`).join("")}</div></div>`;
  return `${head}<section class="board">${rows.map((r, i) => `<div class="rank r${i + 1} ${r.s.id === me ? "me" : ""}">
      <span class="pos">${i + 1}</span>
      <span class="who">${dot(r.s.id)}<span>${esc(r.s.name)}</span></span>
      <span class="main">${fmt(r)}</span>
      <div class="bar thin"><i style="width:${Math.max(0, val(r)) / top * 100}%"></i></div>
      <div class="sub"><span>${r.st.qty} бр.</span><span>${money(r.st.bonus)} бонус</span><span>${r.st.met} от ${r.st.shifts} смени с изпълнена цел</span></div>
    </div>`).join("")}</section>
    <p class="muted small">Процентът показва средно колко от целта за смяната изпълнява всеки, затова е честен и за хората с по-малко смени. Днешната смяна влиза в сметката, щом целта ѝ е изпълнена.</p>`;
}

// ---------- график ----------
function shiftForm(e) {
  return `<div class="form">
    <div class="field">Вид смяна<div class="row tight">${data.cfg.shiftTypes.map(t => `<button type="button" class="seg" data-act="sf-type" data-id="${esc(t.id)}" aria-pressed="${e.type === t.id}">${esc(t.name)}</button>`).join("")}</div></div>
    <div class="grid2 two">
      <label class="field" for="sf-start">Начало<input id="sf-start" type="time" value="${esc(e.start)}" data-sf="start"></label>
      <label class="field" for="sf-end">Край<input id="sf-end" type="time" value="${esc(e.end)}" data-sf="end"></label>
    </div>
    <div class="field">Кой е на смяна<div class="checks">${activeStaff().map(s => `<label><input type="checkbox" data-sfstaff="${esc(s.id)}" ${e.staff.includes(s.id) ? "checked" : ""}>${esc(s.name)}</label>`).join("") || `<span class="muted">Първо добави колеги в Настройки.</span>`}</div></div>
    <div class="row"><button class="btn primary small" type="button" data-act="shift-save" ${shiftFormValid(e) ? "" : "disabled"}>Запази смяната</button><button class="btn small" type="button" data-act="shift-cancel">Откажи</button></div>
  </div>`;
}
export const shiftFormValid = e => e.staff.length && e.start < e.end && !!shiftType(e.type);

export function viewSchedule({ weekOffset, editing, editable }) {
  const ws = weekStart(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const prevWeek = data.shifts.filter(s => s.date >= addDays(ws, -7) && s.date < ws);
  const thisWeek = data.shifts.filter(s => s.date >= ws && s.date <= days[6]);
  const ed = editing;
  return `<div class="sec-head"><h2>График на смените</h2>
    <div class="week-nav"><button class="btn small" type="button" data-act="week" data-id="-1" ${weekOffset > -4 ? "" : "disabled"} aria-label="Предишна седмица">←</button><span class="label">${dm(days[0])} – ${dm(days[6])}</span><button class="btn small" type="button" data-act="week" data-id="1" aria-label="Следваща седмица">→</button>${weekOffset ? `<button class="btn small" type="button" data-act="week" data-id="0">Тази седмица</button>` : ""}</div></div>
    ${editable && !thisWeek.length && prevWeek.length ? `<div class="banner info">Седмицата е празна. <button class="btn small primary" type="button" data-act="copy-week">Копирай смените от миналата седмица</button></div>` : ""}
    <section class="days">${days.map(d => {
      const list = data.shifts.filter(s => s.date === d).sort((a, b) => a.start.localeCompare(b.start));
      const adding = ed && !ed.id && ed.date === d;
      return `<div class="day ${d === TODAY ? "today" : ""}">
        <div class="day-h"><b>${WD[parse(d).getDay()]} ${dm(d)}</b>${d === TODAY ? `<span class="eyebrow accent">днес</span>` : ""}</div>
        ${list.map(s => ed && ed.id === s.id ? shiftForm(ed) : `<div class="shift"><span class="stype stype-${esc(s.type || "")}">${esc(shiftType(s.type)?.name || "Без вид")}</span><div class="time"><span>${esc(s.start)} – ${esc(s.end)}</span>${editable ? `<span class="row tight"><button class="btn small" type="button" data-act="shift-edit" data-id="${esc(s.id)}">Промени</button><button class="x" type="button" aria-label="Изтрий смяната" title="Изтрий" data-act="shift-del" data-id="${esc(s.id)}">×</button></span>` : ""}</div><div class="chips">${(s.staff || []).map(chip).join("")}</div></div>`).join("") || (adding ? "" : `<span class="empty-day">Няма смени</span>`)}
        ${adding ? shiftForm(ed) : ""}
        ${editable && !(ed && ed.date === d) ? `<button class="btn small" type="button" data-act="shift-add" data-id="${d}">+ Смяна</button>` : ""}
      </div>`;
    }).join("")}</section>`;
}
