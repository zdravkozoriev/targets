// Дати, пари и дребни помощни функции, общи за двата сайта.
export const pad = n => String(n).padStart(2, "0");
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dm = s => { const d = parse(s); return `${d.getDate()}.${pad(d.getMonth() + 1)}`; };
export const rid = () => Math.random().toString(36).slice(2, 9);
export const clone = o => JSON.parse(JSON.stringify(o));

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = n => (Math.round((n || 0) * 100) / 100).toFixed(2).replace(".", ",") + " €";

export const WD = ["Нед", "Пон", "Вт", "Ср", "Чет", "Пет", "Съб"];
export const MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];

function monthBounds(first) {
  const d = parse(first); d.setMonth(d.getMonth() + 1); d.setDate(0);
  return { from: first, to: ymd(d) };
}

// Датите се смятат веднъж при зареждане. Ако страницата стои отворена след полунощ, тя се презарежда сама.
export const TODAY = ymd(new Date());
export const MONTH = TODAY.slice(0, 7);
export const MONTH_START = MONTH + "-01";
export const MONTH_END = monthBounds(MONTH_START).to;
export const PREV_MONTH_START = (() => { const d = parse(MONTH_START); d.setMonth(d.getMonth() - 1); return ymd(d); })();
export const PREV_MONTH_END = monthBounds(PREV_MONTH_START).to;
export const monthName = s => MONTHS[parse(s).getMonth()];

export function weekStart(offset) {
  const d = parse(TODAY); const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd + offset * 7); return ymd(d);
}

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

export function reloadAtMidnight(isBusy = () => false) {
  setInterval(() => { if (ymd(new Date()) !== TODAY && !isBusy()) location.reload(); }, 60_000);
}

export function registerServiceWorker(path, isBusy = () => false) {
  if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
  navigator.serviceWorker.register(path).then(reg => {
    // Телефонът често „събужда“ приложението, без да го зарежда наново, затова проверяваме за нова версия.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch(() => {});
  // Когато се инсталира нова версия, презареждаме веднъж, за да се покаже веднага.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded || isBusy()) return;
      reloaded = true;
      location.reload();
    });
  }
}
