// Сайтът за мениджъра: днешните смени, класация, график, месечен отчет и настройки.
import { connect, data, isConfigured, TEMPLATE } from "../shared/store.js";
import { esc, money, rid, clone, addDays, weekStart, monthName, TODAY, MONTH_START, MONTH_END, PREV_MONTH_START, PREV_MONTH_END, reloadAtMidnight, registerServiceWorker } from "../shared/util.js";
import { prod, person, shiftType, activeStaff, salesBy, goalsForDay, progressOn, periodStats } from "../shared/logic.js";
import { chip, dot, bar, toast, viewBoard, viewSchedule, shiftFormValid, METRICS } from "../shared/ui.js";

const TABS = [["today", "Днес"], ["board", "Класация"], ["schedule", "График"], ["report", "Отчет"], ["settings", "Настройки"]];
const ui = {
  tab: "today",
  metric: "pct",
  weekOffset: 0,
  editingShift: null,
  draft: null, dirty: false,
  reportMonth: "current",
  auth: { status: "checking" }
};
let api = null;

// ---------- изгледи ----------
function viewGate() {
  const s = ui.auth;
  if (s.status === "checking") return `<p class="loading">Проверявам достъпа…</p>`;
  if (s.status === "denied") return `<section class="card gate"><h1>Нямаш достъп</h1><p class="muted">Профилът <b>${esc(s.email || "")}</b> не е мениджър на Targets. Добави го в колекцията <b>managers</b> във Firebase или влез с друг профил.</p><div><button class="btn" type="button" data-act="signout">Изход</button></div></section>`;
  return `<section class="card gate"><h1>Вход за мениджъра</h1><p class="muted">Влез с Google профила, който е добавен като мениджър във Firebase.</p><div><button class="gbtn" type="button" data-act="signin"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Вход с Google</button></div></section>`;
}

function viewToday() {
  const c = data.cfg;
  if (!c.products.length || !activeStaff().length) {
    return `<section class="card"><h2>Да настроим екипа</h2><p class="muted">Три стъпки и колегите могат да започнат.</p><ol class="steps"><li>Добави продуктите и услугите с цена, бонус и цел за всеки вид смяна.</li><li>Добави колегите от рецепцията.</li><li>Сложи смените в графика.</li></ol><div class="row" style="margin-top:14px"><a class="btn primary" href="#settings">Към настройките</a></div></section>`;
  }
  const todays = data.sales.filter(s => s.date === TODAY);
  const revenue = todays.reduce((a, s) => a + (s.price || 0) * (s.qty || 1), 0);
  const bonus = todays.reduce((a, s) => a + (s.bonus || 0) * (s.qty || 1), 0);
  const shifts = data.shifts.filter(s => s.date === TODAY).sort((a, b) => a.start.localeCompare(b.start));
  const cards = shifts.map(sh => {
    const rows = (sh.staff || []).filter(person).map(id => {
      const g = goalsForDay(id, TODAY), d = progressOn(id, g, TODAY);
      return `<div class="team-row">${chip(id)}<span class="num">${d} / ${g.total} · ${money(salesBy(id, TODAY, TODAY).bonus)}</span>${bar(d, g.total, true)}</div>`;
    }).join("");
    return `<div class="card stack"><div class="sec-head"><span class="stype stype-${esc(sh.type || "")}">${esc(shiftType(sh.type)?.name || "Без вид")}</span><span class="num team-total">${esc(sh.start)}–${esc(sh.end)}</span></div>${rows || `<span class="muted">Няма хора на смяната.</span>`}</div>`;
  }).join("");
  const recent = todays.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12);
  return `<section class="hero">
      <div>
        <div class="eyebrow">Днес</div>
        <div class="score"><span class="big">${todays.reduce((a, s) => a + (s.qty || 1), 0)}</span><span class="unit">продажби</span></div>
        <p class="hint">${shifts.length ? `${shifts.length} ${shifts.length === 1 ? "смяна" : "смени"} в графика` : "Днес няма смени в графика."}</p>
      </div>
      <div class="stats">
        <div class="stat"><div class="v">${money(revenue)}</div><div class="k">оборот от записаните продажби</div></div>
        <div class="stat"><div class="v">${money(bonus)}</div><div class="k">бонуси днес</div></div>
      </div>
    </section>
    ${shifts.length ? `<section class="today-grid">${cards}</section>` : ""}
    <section class="card"><div class="sec-head"><h2>Последни продажби</h2></div><div class="list">${recent.length ? recent.map(s => `<div class="li"><time>${esc(s.time || "")}</time>${chip(s.staffId)}<span class="grow">${esc(prod(s.productId)?.name || "Изтрит продукт")}</span><span class="num">${money(s.price)}</span><button class="x" type="button" title="Изтрий" aria-label="Изтрий" data-act="unsell" data-id="${esc(s.id)}">×</button></div>`).join("") : `<p class="muted small">Още няма продажби днес.</p>`}</div></section>`;
}

function reportRange() {
  return ui.reportMonth === "prev" ? { from: PREV_MONTH_START, to: PREV_MONTH_END } : { from: MONTH_START, to: MONTH_END };
}
function reportRows() {
  const { from, to } = reportRange();
  return data.cfg.staff.filter(s => !s.archived || salesBy(s.id, from, to).qty).map(s => {
    const st = periodStats(s.id, from, to);
    const revenue = data.sales.filter(x => x.staffId === s.id && x.date >= from && x.date <= to).reduce((a, x) => a + (x.price || 0) * (x.qty || 1), 0);
    return { s, st, revenue };
  }).sort((a, b) => b.st.bonus - a.st.bonus);
}
function viewReport() {
  const { from, to } = reportRange();
  const rows = reportRows();
  const tot = rows.reduce((a, r) => ({ qty: a.qty + r.st.qty, revenue: a.revenue + r.revenue, bonus: a.bonus + r.st.bonus }), { qty: 0, revenue: 0, bonus: 0 });
  const byProduct = data.cfg.products.map(p => {
    const list = data.sales.filter(x => x.productId === p.id && x.date >= from && x.date <= to);
    return { p, qty: list.reduce((a, x) => a + (x.qty || 1), 0), revenue: list.reduce((a, x) => a + (x.price || 0) * (x.qty || 1), 0) };
  }).filter(r => r.qty).sort((a, b) => b.revenue - a.revenue);
  return `<div class="sec-head"><h2>Отчет за ${monthName(from)}</h2><div class="row">
      <button type="button" class="seg" data-act="report-month" data-id="current" aria-pressed="${ui.reportMonth === "current"}">${monthName(MONTH_START)}</button>
      <button type="button" class="seg" data-act="report-month" data-id="prev" aria-pressed="${ui.reportMonth === "prev"}">${monthName(PREV_MONTH_START)}</button>
      <button type="button" class="btn small" data-act="copy-report">Копирай за заплатите</button></div></div>
    <section class="card"><div class="tbl-wrap"><table class="tbl report"><thead><tr><th>Колега</th><th class="r">Смени с цел</th><th class="r">% цел</th><th class="r">Бройки</th><th class="r">Оборот</th><th class="r">Бонус</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><span class="who">${dot(r.s.id)} ${esc(r.s.name)}</span></td><td class="r num">${r.st.met} / ${r.st.shifts}</td><td class="r num">${r.st.pct === null ? "–" : Math.round(r.st.pct * 100) + " %"}</td><td class="r num">${r.st.qty}</td><td class="r num">${money(r.revenue)}</td><td class="r num"><b>${money(r.st.bonus)}</b></td></tr>`).join("")}
    </tbody><tfoot><tr><td>Общо</td><td></td><td></td><td class="r num">${tot.qty}</td><td class="r num">${money(tot.revenue)}</td><td class="r num">${money(tot.bonus)}</td></tr></tfoot></table></div></section>
    <section class="card"><div class="sec-head"><h2>По продукти</h2></div><div class="tbl-wrap"><table class="tbl report"><thead><tr><th>Продукт</th><th class="r">Бройки</th><th class="r">Оборот</th></tr></thead><tbody>
      ${byProduct.map(r => `<tr><td>${esc(r.p.name)}</td><td class="r num">${r.qty}</td><td class="r num">${money(r.revenue)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Няма продажби за този месец.</td></tr>`}
    </tbody></table></div></section>
    <p class="muted small">Бонусът се смята по сумата, валидна в момента на продажбата. Оборотът е само от продажбите, записани в Targets.</p>`;
}

function viewSettings() {
  if (!ui.dirty || !ui.draft) ui.draft = clone(data.cfg);
  const d = ui.draft, k = d.contest, types = d.shiftTypes;
  return `<section class="card stack">
      <div class="sec-head"><h2>Продукти и услуги</h2>${d.products.length ? "" : `<button class="btn small" type="button" data-act="template">Добави примерни за фитнес</button>`}</div>
      <p class="muted small">Бонусът е сумата, която колегата печели за всяка продадена бройка. Целите са колко бройки трябва да продаде всеки колега за една смяна от съответния вид. Когато двама са на смяна заедно, всеки има своя цел, а общата е сборът. Остави 0, ако продуктът няма цел за тази смяна.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th rowspan="2">Име</th><th rowspan="2" style="text-align:right">Цена €</th><th rowspan="2" style="text-align:right">Бонус € / бр.</th><th colspan="${types.length}" style="text-align:center">Цел бр. за смяна</th><th rowspan="2"></th></tr>
        <tr>${types.map(t => `<th style="text-align:right">${esc(t.name)}</th>`).join("")}</tr></thead><tbody>
      ${d.products.map((p, i) => `<tr>
        <td><input id="p-${esc(p.id)}-name" aria-label="Име" value="${esc(p.name)}" data-path="products.${i}.name"></td>
        <td class="n"><input id="p-${esc(p.id)}-price" aria-label="Цена" type="number" min="0" step="0.1" value="${p.price}" data-path="products.${i}.price" data-num></td>
        <td class="n"><input id="p-${esc(p.id)}-bonus" aria-label="Бонус" type="number" min="0" step="0.05" value="${p.bonus}" data-path="products.${i}.bonus" data-num></td>
        ${types.map(t => `<td class="n"><input id="p-${esc(p.id)}-t-${esc(t.id)}" aria-label="Цел за ${esc(t.name)} смяна" type="number" min="0" step="1" value="${+(p.targets || {})[t.id] || 0}" data-path="products.${i}.targets.${esc(t.id)}" data-num></td>`).join("")}
        <td><button class="x" type="button" aria-label="Премахни" title="Премахни" data-act="prod-del" data-id="${i}">×</button></td></tr>`).join("")}
      </tbody></table></div>
      <div><button class="btn small" type="button" data-act="prod-add">+ Продукт</button></div>
    </section>
    <section class="card stack">
      <h2>Видове смени</h2>
      <p class="muted small">Часовете се попълват сами, когато слагаш смяна в графика. После може да ги промениш за конкретния ден.</p>
      <div class="tbl-wrap"><table class="tbl" style="min-width:420px"><thead><tr><th>Име</th><th>Начало</th><th>Край</th><th></th></tr></thead><tbody>
      ${types.map((t, i) => `<tr>
        <td><input id="t-${esc(t.id)}-name" aria-label="Име на смяната" value="${esc(t.name)}" data-path="shiftTypes.${i}.name"></td>
        <td><input id="t-${esc(t.id)}-start" aria-label="Начало" type="time" value="${esc(t.start)}" data-path="shiftTypes.${i}.start"></td>
        <td><input id="t-${esc(t.id)}-end" aria-label="Край" type="time" value="${esc(t.end)}" data-path="shiftTypes.${i}.end"></td>
        <td>${types.length > 1 ? `<button class="x" type="button" aria-label="Премахни" title="Премахни" data-act="type-del" data-id="${i}">×</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      <div><button class="btn small" type="button" data-act="type-add">+ Вид смяна</button></div>
    </section>
    <section class="card stack">
      <h2>Колеги</h2>
      <div class="list">${d.staff.filter(s => !s.archived).map(s => `<div class="li"><span class="dot" style="--cc:var(--c${(s.color ?? 0) % 6})"></span><input id="s-${esc(s.id)}-name" class="grow inline-input" aria-label="Име" value="${esc(s.name)}" data-path="staff.${d.staff.indexOf(s)}.name"><button class="btn small danger" type="button" data-act="staff-del" data-id="${esc(s.id)}">Премахни</button></div>`).join("") || `<p class="muted small">Още няма колеги.</p>`}</div>
      <div class="row"><input id="new-staff" class="text-input" placeholder="Име на колега"><button class="btn small" type="button" data-act="staff-add">Добави</button></div>
    </section>
    <section class="card stack">
      <div class="sec-head"><h2>Състезание</h2><label class="row" style="font-weight:600" for="k-on"><input id="k-on" type="checkbox" data-path="contest.on" data-bool ${k.on ? "checked" : ""}> Включено</label></div>
      <div class="grid2">
        <label class="field" for="k-title">Име<input id="k-title" value="${esc(k.title)}" placeholder="напр. Есенен шампионат" data-path="contest.title"></label>
        <label class="field" for="k-prize">Награда<input id="k-prize" value="${esc(k.prize)}" placeholder="напр. Ваучер за 50 €" data-path="contest.prize"></label>
        <label class="field" for="k-from">От<input id="k-from" type="date" value="${esc(k.from)}" data-path="contest.from"></label>
        <label class="field" for="k-to">До<input id="k-to" type="date" value="${esc(k.to)}" data-path="contest.to"></label>
        <label class="field" for="k-metric">Класиране по<select id="k-metric" data-path="contest.metric">${METRICS.map(([v, l]) => `<option value="${v}" ${k.metric === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
    </section>`;
}

function renderSavebar() {
  const el = document.getElementById("savebar");
  if (ui.tab !== "settings" || ui.auth.status !== "ready") { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="savebar"><div class="savebar-in"><span class="muted" id="save-state">${ui.dirty ? "Има незапазени промени" : "Всичко е запазено"}</span><div class="row"><button class="btn" type="button" data-act="discard" ${ui.dirty ? "" : "disabled"}>Откажи</button><button class="btn primary" type="button" data-act="save" ${ui.dirty ? "" : "disabled"}>Запази промените</button></div></div></div>`;
}

function render() {
  const ready = ui.auth.status === "ready" && data.cfg && api;
  document.getElementById("tabs").innerHTML = ready ? TABS.map(([k, l]) => `<a href="#${k}" ${ui.tab === k ? 'aria-current="page"' : ""}>${l}</a>`).join("") : "";
  document.getElementById("top-actions").innerHTML = ui.auth.email ? `<span class="user-pill">${esc(ui.auth.email)}</span><button class="btn small" type="button" data-act="signout">Изход</button>` : "";
  const app = document.getElementById("app");
  const a = document.activeElement, focusId = a?.id && a.closest?.("#app") ? a.id : null;
  const selS = focusId ? a.selectionStart : null, selE = focusId ? a.selectionEnd : null;
  if (ui.auth.status !== "ready") app.innerHTML = viewGate();
  else if (!ready) app.innerHTML = `<p class="loading">Зареждам…</p>`;
  else {
    const banner = isConfigured ? "" : `<div class="banner"><b>Демо режим.</b> Firebase още не е настроен, затова данните са примерни и се губят при презареждане. Стъпките за настройка са в README.</div>`;
    const view = {
      today: viewToday,
      board: () => viewBoard({ me: null, metric: ui.metric }),
      schedule: () => viewSchedule({ weekOffset: ui.weekOffset, editing: ui.editingShift, editable: true }),
      report: viewReport,
      settings: viewSettings
    }[ui.tab];
    app.innerHTML = banner + view();
  }
  renderSavebar();
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { if (selS !== null) el.setSelectionRange(selS, selE); } catch {} } }
}

// ---------- действия ----------
function markDirty() {
  ui.dirty = true;
  const s = document.getElementById("save-state"); if (s) s.textContent = "Има незапазени промени";
  document.querySelectorAll(".savebar [data-act]").forEach(b => { b.disabled = false; });
}
function setPath(obj, path, val) {
  const ks = path.split("."); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] ??= {};
  o[ks[ks.length - 1]] = val;
}
const failed = () => toast("Не успях да запиша. Провери интернета и опитай пак.");

function reportText() {
  const { from } = reportRange();
  const lines = [`Бонуси за ${monthName(from)}`, ...reportRows().map(r => `${r.s.name}\t${r.st.qty} бр.\t${money(r.st.bonus)}`)];
  return lines.join("\n");
}

async function act(a, id) {
  const c = data.cfg;
  switch (a) {
    case "signin": try { await api.signIn(); } catch { toast("Входът не успя. Опитай пак."); } break;
    case "signout": await api.signOut(); break;
    case "metric": ui.metric = id; render(); break;
    case "report-month": ui.reportMonth = id; render(); break;
    case "copy-report": {
      const text = reportText();
      try { await navigator.clipboard.writeText(text); toast("Отчетът е копиран"); }
      catch { toast("Не можах да копирам. Маркирай таблицата ръчно."); }
      break;
    }
    case "unsell": api.deleteSale(id).then(() => toast("Продажбата е изтрита")).catch(failed); break;
    case "week": ui.weekOffset = id === "0" ? 0 : ui.weekOffset + Number(id); ui.editingShift = null; render(); break;
    case "shift-add": {
      const used = new Set(data.shifts.filter(s => s.date === id).map(s => s.type));
      const t = c.shiftTypes.find(x => !used.has(x.id)) || c.shiftTypes[0];
      ui.editingShift = { id: null, date: id, type: t.id, start: t.start, end: t.end, staff: [] };
      render(); break;
    }
    case "sf-type": {
      const t = shiftType(id), e = ui.editingShift;
      if (t && e) { e.type = t.id; e.start = t.start; e.end = t.end; render(); }
      break;
    }
    case "shift-edit": { const s = data.shifts.find(x => x.id === id); ui.editingShift = { ...s, staff: [...(s.staff || [])] }; render(); break; }
    case "shift-cancel": ui.editingShift = null; render(); break;
    case "shift-save": {
      const e = ui.editingShift; ui.editingShift = null;
      try { await api.saveShift(e); toast("Смяната е запазена"); } catch { failed(); }
      render(); break;
    }
    case "shift-del": try { await api.deleteShift(id); toast("Смяната е изтрита"); } catch { failed(); } break;
    case "copy-week": {
      const ws = weekStart(ui.weekOffset);
      const prev = data.shifts.filter(s => s.date >= addDays(ws, -7) && s.date < ws);
      try { for (const s of prev) await api.saveShift({ id: null, date: addDays(s.date, 7), type: s.type, start: s.start, end: s.end, staff: s.staff }); toast(`Копирах ${prev.length} смени`); } catch { failed(); }
      render(); break;
    }
    case "template": ui.draft.products = clone(TEMPLATE).map(p => ({ id: "p" + rid(), ...p })); markDirty(); render(); break;
    case "prod-add": ui.draft.products.push({ id: "p" + rid(), name: "", price: 0, bonus: 0, targets: {} }); markDirty(); render(); break;
    case "prod-del": ui.draft.products.splice(Number(id), 1); markDirty(); render(); break;
    case "type-add": ui.draft.shiftTypes.push({ id: "t" + rid(), name: "Нова смяна", start: "09:00", end: "17:00" }); markDirty(); render(); break;
    case "type-del": {
      const t = ui.draft.shiftTypes[Number(id)];
      if (data.shifts.some(s => s.type === t.id && s.date >= TODAY)) { toast(`В графика има бъдещи смени „${t.name}“. Смени им вида, преди да го премахнеш.`); return; }
      ui.draft.shiftTypes.splice(Number(id), 1); markDirty(); render(); break;
    }
    case "staff-add": {
      const inp = document.getElementById("new-staff"); const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      ui.draft.staff.push({ id: "s" + rid(), name, color: ui.draft.staff.length % 6 }); markDirty(); render();
      document.getElementById("new-staff")?.focus(); break;
    }
    case "staff-del": { const s = ui.draft.staff.find(x => x.id === id); if (s) s.archived = true; markDirty(); render(); break; }
    case "discard": ui.dirty = false; ui.draft = null; render(); break;
    case "save": {
      const d = ui.draft;
      d.products = d.products.filter(p => p.name.trim());
      if (d.shiftTypes.some(t => !t.name.trim() || !(t.start < t.end))) { toast("Всеки вид смяна трябва да има име и край след началото."); return; }
      if (d.contest.from > d.contest.to) { toast("Състезанието трябва да започва преди да свърши. Провери датите."); return; }
      try { await api.saveCfg(d); ui.dirty = false; ui.draft = null; toast("Промените са запазени"); render(); } catch { failed(); }
      break;
    }
  }
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  act(b.dataset.act, b.dataset.id);
});
const app = document.getElementById("app");
app.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.path && ui.draft && t.tagName !== "SELECT" && t.type !== "checkbox") {
    setPath(ui.draft, t.dataset.path, t.dataset.num !== undefined ? (parseFloat(t.value) || 0) : t.value); markDirty();
  }
  if (t.dataset.sf && ui.editingShift) { ui.editingShift[t.dataset.sf] = t.value; refreshShiftSave(); }
});
app.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.path && ui.draft && (t.tagName === "SELECT" || t.type === "checkbox")) {
    setPath(ui.draft, t.dataset.path, t.type === "checkbox" ? t.checked : t.value); markDirty();
  }
  if (t.dataset.sfstaff && ui.editingShift) {
    const s = new Set(ui.editingShift.staff);
    t.checked ? s.add(t.dataset.sfstaff) : s.delete(t.dataset.sfstaff);
    ui.editingShift.staff = [...s]; refreshShiftSave();
  }
});
function refreshShiftSave() {
  const b = app.querySelector('[data-act="shift-save"]');
  if (b) b.disabled = !shiftFormValid(ui.editingShift);
}
app.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "new-staff") { e.preventDefault(); act("staff-add"); } });
window.addEventListener("beforeunload", e => { if (ui.dirty) e.preventDefault(); });

function route() {
  const h = location.hash.slice(1);
  ui.tab = TABS.some(([k]) => k === h) ? h : "today";
  ui.editingShift = null;
  render();
}
window.addEventListener("hashchange", route);

route();
api = await connect({
  role: "manager",
  onChange: render,
  onAuth: s => { ui.auth = s; render(); }
});
render();
const busy = () => ui.dirty || !!ui.editingShift;
reloadAtMidnight(busy);
registerServiceWorker("../sw.js", busy);
