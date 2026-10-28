// Сметките за цели, бонуси и класация. Четат общото състояние от data.
import { data } from "./store.js";
import { TODAY, MONTH_START, MONTH_END, nowHM } from "./util.js";

export const prod = id => data.cfg.products.find(p => p.id === id);
export const person = id => data.cfg.staff.find(s => s.id === id);
export const shiftType = id => data.cfg.shiftTypes.find(t => t.id === id);
export const activeStaff = () => data.cfg.staff.filter(s => !s.archived);
export const colorOf = id => `var(--c${(person(id)?.color ?? 0) % 6})`;

export function salesBy(sid, from, to, pid) {
  let qty = 0, bonus = 0;
  for (const s of data.sales) {
    if (s.staffId !== sid || s.date < from || s.date > to) continue;
    if (pid && s.productId !== pid) continue;
    qty += s.qty || 1; bonus += (s.bonus || 0) * (s.qty || 1);
  }
  return { qty, bonus };
}

// Мениджърът задава цел за всеки продукт и вид смяна, на човек.
// При смяна с „обща цел“ (split) колегите на нея делят една цел и продажбите им се броят заедно.
// Иначе всеки на смяната има своя цел и брои само своите продажби.
// Целта за деня е сборът от смените, в които човекът е в графика този ден.
export const isSplit = sh => !!sh.split && (sh.staff || []).length > 1;

export function dayPlan(sid, date) {
  const by = {}; let shared = false;
  for (const sh of data.shifts) {
    if (sh.date !== date || !(sh.staff || []).includes(sid)) continue;
    const counted = isSplit(sh) ? sh.staff : [sid];
    if (isSplit(sh)) shared = true;
    for (const p of data.cfg.products) {
      const t = +(p.targets || {})[sh.type] || 0;
      if (t <= 0) continue;
      const e = by[p.id] ||= { goal: 0, sold: 0, done: 0, who: new Set() };
      e.goal += t;
      counted.forEach(m => e.who.add(m));
    }
  }
  let total = 0, done = 0;
  for (const pid in by) {
    const e = by[pid];
    for (const m of e.who) e.sold += salesBy(m, date, date, pid).qty;
    e.done = Math.min(e.sold, e.goal);
    total += e.goal; done += e.done;
  }
  return { by, total, done, shared };
}

export function bonusLeft(plan) {
  let eur = 0;
  for (const pid in plan.by) eur += (plan.by[pid].goal - plan.by[pid].done) * (prod(pid)?.bonus || 0);
  return eur;
}

function workedDays(sid, from, to) {
  const ds = new Set();
  for (const s of data.shifts) if ((s.staff || []).includes(sid) && s.date >= from && s.date <= to && s.date <= TODAY) ds.add(s.date);
  return [...ds].sort();
}

export function periodStats(sid, from = MONTH_START, to = MONTH_END) {
  let tgt = 0, hit = 0, met = 0, shifts = 0, streak = 0;
  for (const d of workedDays(sid, from, to)) {
    const g = dayPlan(sid, d);
    if (!g.total) continue;
    // Днешната смяна още тече: брои се чак когато целта ѝ е изпълнена.
    if (d === TODAY && g.done < g.total) continue;
    shifts++; tgt += g.total; hit += g.done;
    if (g.done >= g.total) { met++; streak++; } else streak = 0;
  }
  const all = salesBy(sid, from, to);
  return { qty: all.qty, bonus: all.bonus, pct: tgt ? hit / tgt : null, met, shifts, streak };
}

export function shiftNow(sid) {
  const t = nowHM();
  const mine = data.shifts.filter(s => s.date === TODAY && (s.staff || []).includes(sid)).sort((a, b) => a.start.localeCompare(b.start));
  return mine.find(s => s.start <= t && t < s.end) || mine.find(s => t < s.end) || mine[mine.length - 1] || null;
}

export function contestPeriod() {
  const k = data.cfg.contest;
  if (k.on && k.from && k.to && k.from <= TODAY) return { from: k.from, to: k.to, contest: true };
  return { from: MONTH_START, to: MONTH_END, contest: false };
}
