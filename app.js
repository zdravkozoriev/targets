// Сайтът за служителите: цел за смяната, записване на продажби, класация и график.
import { connect, data, isConfigured } from "./shared/store.js";
import { esc, money, nowHM, monthName, store, TODAY, reloadAtMidnight, registerServiceWorker } from "./shared/util.js";
import { prod, person, shiftType, activeStaff, salesBy, dayPlan, isSplit, bonusLeft, periodStats, shiftNow } from "./shared/logic.js";
import { chip, dot, bar, toast, celebrate, fx, viewBoard, viewSchedule } from "./shared/ui.js";

const TABS = [["shift", "Смяна"], ["board", "Класация"], ["schedule", "График"]];
const ui = {
  tab: "shift",
  me: store.get("targets.me"),
  seller: null,
  metric: "pct",
  weekOffset: 0,
  celebrated: store.get("targets.celebrated") || "",
  auth: "checking",
  writeBlocked: false
};
let api = null;

// ---------- изгледи ----------
function banners() {
  let h = "";
  if (!isConfigured) h += `<div class="banner"><b>Демо режим.</b> Firebase още не е настроен, затова данните са примерни и се губят при презареждане.</div>`;
  if (ui.writeBlocked) h += `<div class="banner"><b>Продажбата не се записа.</b> Провери интернета. Ако проблемът остане, кажи на мениджъра.</div>`;
  return h;
}

function viewShift() {
  const c = data.cfg;
  if (!c.products.length || !activeStaff().length) {
    return `<section class="card"><h2>Още няма продукти и екип</h2><p class="muted">Мениджърът трябва първо да добави продуктите и колегите. После тук ще видиш целта си за смяната.</p></section>`;
  }
  if (!person(ui.me) || person(ui.me).archived) {
    return `<section class="card"><h2>Кой си ти?</h2><p class="muted">Избери името си. Телефонът ще го запомни.</p><div class="pickme">${activeStaff().map(s => `<button type="button" data-act="pick" data-id="${esc(s.id)}">${dot(s.id)}${esc(s.name)}</button>`).join("")}</div></section>`;
  }
  const me = ui.me;
  const sh = shiftNow(me);
  const members = sh ? sh.staff.filter(id => person(id)) : [me];
  if (!members.includes(me)) members.unshift(me);
  if (!members.includes(ui.seller)) ui.seller = me;
  const g = dayPlan(me, TODAY);
  const done = g.done;
  const split = sh && isSplit(sh);
  const ms = periodStats(me);
  const eurLeft = bonusLeft(g);
  const todayB = salesBy(me, TODAY, TODAY).bonus;
  const partners = members.filter(id => id !== me);
  const shiftLine = sh
    ? `${esc(shiftType(sh.type)?.name || "Смяна")} ${esc(sh.start)}–${esc(sh.end)}${partners.length ? " · с " + partners.map(id => esc(person(id).name)).join(", ") : " · сам/а"}`
    : "Днес нямаш смяна в графика";

  let team = "";
  if (partners.length && split) {
    // Обща цел: показваме какво е донесъл всеки към нея.
    const rows = members.map(id => {
      let n = 0;
      for (const pid in g.by) n += salesBy(id, TODAY, TODAY, pid).qty;
      return { id, n };
    });
    team = `<div class="team"><span class="eyebrow">Кой колко донесе към общата цел</span>
      ${rows.map(r => `<div class="team-row">${chip(r.id)}<span class="num">${r.n} бр. · ${money(salesBy(r.id, TODAY, TODAY).bonus)}</span>${bar(r.n, g.total, true)}</div>`).join("")}</div>`;
  } else if (partners.length) {
    let tg = 0, td = 0;
    const rows = members.map(id => { const p = dayPlan(id, TODAY); tg += p.total; td += p.done; return { id, p }; });
    team = `<div class="team"><div class="sec-head"><span class="eyebrow">Цялата смяна заедно</span><span class="num team-total">${td} / ${tg}</span></div>
      ${bar(td, tg)}
      ${rows.map(r => `<div class="team-row">${chip(r.id)}<span class="num">${r.p.done} / ${r.p.total}</span>${bar(r.p.done, r.p.total, true)}</div>`).join("")}</div>`;
  }

  const remaining = Math.max(0, g.total - done);
  const goalWord = split ? "общата цел" : "целта за смяната";
  const hint = !sh ? "Без смяна в графика няма цел, но продажбите и бонусът пак се записват."
    : !g.total ? "Мениджърът още не е задал цел за този вид смяна."
    : remaining === 0 ? `${split ? "Общата цел" : "Целта за смяната"} е изпълнена. Продължавай, бонусът расте.`
    : `Още ${remaining} ${remaining === 1 ? "продажба" : "продажби"} до ${goalWord}${split ? ". Делите я с " + partners.map(id => esc(person(id).name)).join(", ") : ""}.`;

  const sellerCtl = members.length > 1 ? `<div class="seller"><span class="eyebrow">Кой продаде?</span>${members.map(id => `<button type="button" class="seg" data-act="seller" data-id="${esc(id)}" aria-pressed="${id === ui.seller}">${esc(person(id).name)}</button>`).join("")}</div>` : "";
  const sg = ui.seller === me ? g : dayPlan(ui.seller, TODAY);
  const tiles = c.products.map(p => {
    const e = sg.by[p.id];
    const n = e ? e.sold : salesBy(ui.seller, TODAY, TODAY, p.id).qty;
    const label = e && sg.shared ? "общо" : "днес";
    return `<button type="button" class="tile ${e && e.sold >= e.goal ? "hit" : ""}" data-act="sell" data-id="${esc(p.id)}">
      <span class="bonus">+${money(p.bonus)}</span>
      <span class="name">${esc(p.name)}</span>
      <span class="price">${money(p.price)}</span>
      <span class="prog"><span>${label} <b>${n}</b>${e ? ` / ${e.goal}` : ""}</span><span class="plus">+1</span></span>
    </button>`;
  }).join("");

  const recent = data.sales.filter(s => s.date === TODAY && members.includes(s.staffId)).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 8);
  const recentHtml = recent.length
    ? recent.map(s => `<div class="li"><time>${esc(s.time || "")}</time>${chip(s.staffId)}<span class="grow">${esc(prod(s.productId)?.name || "Изтрит продукт")}</span><span class="num">+${money((s.bonus || 0) * (s.qty || 1))}</span>${api.canDeleteSale(s) ? `<button class="x" type="button" title="Изтрий" aria-label="Изтрий" data-act="unsell" data-id="${esc(s.id)}">×</button>` : ""}</div>`).join("")
    : `<p class="muted small">Още няма продажби днес. Първата е най-трудна.</p>`;

  return `<section class="hero">
    <div>
      <div class="eyebrow">${shiftLine}</div>
      <div class="score"><span class="big">${done}</span><span class="of">/ ${g.total}</span><span class="unit">${split ? "обща цел" : "цел за смяната"}</span></div>
      <div class="bar ${g.total && done >= g.total ? "done" : ""}"><i style="width:${g.total ? Math.min(100, done / g.total * 100) : 0}%"></i></div>
      <p class="hint ${g.total && remaining === 0 ? "done" : ""}">${hint}</p>
      ${team}
    </div>
    <div class="stats">
      <div class="stat"><div class="v">${money(todayB)}</div><div class="k">бонус днес</div></div>
      <div class="stat"><div class="v">${money(ms.bonus)}</div><div class="k">бонус за ${monthName(TODAY)}</div></div>
      <div class="stat"><div class="v">${ms.met} от ${ms.shifts}</div><div class="k">смени с изпълнена цел</div></div>
      <div class="stat"><div class="v">${ms.streak}</div><div class="k">поредни смени с изпълнена цел</div></div>
      <div class="stat wide"><div class="v">${remaining && g.total ? `още ${remaining} бр. → +${money(eurLeft)}` : g.total ? "Целта е изпълнена" : "–"}</div><div class="k">${remaining && g.total ? split ? "толкова бонус ви делят от общата цел" : "толкова бонус те делят от целта за смяната" : "всяка следваща продажба е допълнителен бонус"}</div></div>
    </div>
  </section>
  <section class="stack">
    <div class="sec-head"><h2>Продадох</h2><span class="muted small">Едно докосване = 1 бр.</span></div>
    ${sellerCtl}
    <div class="tiles">${tiles}</div>
  </section>
  <section class="card"><div class="sec-head"><h2>Днешни продажби</h2></div><div class="list">${recentHtml}</div></section>`;
}

function render() {
  const sel = document.getElementById("me-select");
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = TABS.map(([k, l]) => `<a href="#${k}" ${ui.tab === k ? 'aria-current="page"' : ""}>${l}</a>`).join("");
  const app = document.getElementById("app");
  if (ui.auth === "error") { app.innerHTML = `<section class="card"><h2>Няма връзка с базата</h2><p class="muted">Провери интернета и презареди страницата. Ако не помогне, кажи на мениджъра, че анонимният вход във Firebase трябва да е включен.</p></section>`; return; }
  if (!data.cfg || !api) { app.innerHTML = `<p class="loading">Зареждам…</p>`; return; }
  const staff = activeStaff();
  sel.innerHTML = `<option value="">избери…</option>` + staff.map(s => `<option value="${esc(s.id)}" ${s.id === ui.me ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  sel.disabled = !staff.length;
  const view = { shift: viewShift, board: () => viewBoard({ me: ui.me, metric: ui.metric }), schedule: () => viewSchedule({ weekOffset: ui.weekOffset, editable: false }) }[ui.tab];
  app.innerHTML = banners() + view();
}

// ---------- действия ----------
async function sell(id, el) {
  const p = prod(id), seller = ui.seller || ui.me;
  if (!p || !seller) return;
  fx.sale(el);
  // Броим напред от плана, защото записът във Firebase стига до data.sales малко по-късно.
  const g = dayPlan(seller, TODAY);
  const e = g.by[p.id];
  const after = g.done + (e && e.sold < e.goal ? 1 : 0);
  const rec = { date: TODAY, ts: Date.now(), time: nowHM(), staffId: seller, productId: p.id, qty: 1, price: +p.price || 0, bonus: +p.bonus || 0, shiftId: shiftNow(seller)?.id || null };
  try {
    const newId = await api.addSale(rec);
    toast(`${person(seller).name}: ${p.name} · +${money(p.bonus)}`, () => api.deleteSale(newId).catch(() => toast("Не успях да изтрия продажбата.")));
    const key = TODAY + ":" + seller;
    if (g.total && g.done < g.total && after >= g.total && ui.celebrated !== key) {
      ui.celebrated = key; store.set("targets.celebrated", key);
      celebrate(person(seller).name, g.total);
      fx.big();
    }
  } catch { toast("Не успях да запиша продажбата. Опитай пак."); }
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case "pick": ui.me = id; ui.seller = null; store.set("targets.me", id); render(); break;
    case "seller": ui.seller = id; render(); break;
    case "metric": ui.metric = id; render(); break;
    case "week": ui.weekOffset = id === "0" ? 0 : ui.weekOffset + Number(id); render(); break;
    case "sell": sell(id, b); break;
    case "unsell": api.deleteSale(id).catch(() => toast("Не успях да изтрия продажбата.")); break;
  }
});
document.getElementById("me-select").addEventListener("change", e => {
  ui.me = e.target.value || null; ui.seller = null; store.set("targets.me", ui.me || ""); render();
});

function route() {
  const h = location.hash.slice(1);
  ui.tab = TABS.some(([k]) => k === h) ? h : "shift";
  render();
}
window.addEventListener("hashchange", route);

route();
api = await connect({
  role: "staff",
  onChange: render,
  onAuth: s => { ui.auth = s.status; render(); }
});
api.onWriteError = () => { ui.writeBlocked = true; render(); };
reloadAtMidnight();
registerServiceWorker("sw.js", () => !!document.querySelector(".celebrate"));
