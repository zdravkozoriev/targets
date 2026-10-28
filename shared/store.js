// Общите данни (настройки, смени, продажби) се пазят във Firestore.
// Ако Firebase още не е настроен, двата сайта работят в демо режим с примерни данни в паметта.
import { firebaseConfig } from "./firebase-config.js";
import { TODAY, MONTH_START, MONTH_END, PREV_MONTH_START, addDays, parse, rid, clone } from "./util.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1/";

export const SHIFT_TYPES = [
  { id: "morning", name: "Сутрешна", start: "07:00", end: "14:30" },
  { id: "evening", name: "Вечерна", start: "14:30", end: "22:00" },
  { id: "double", name: "Дублажна", start: "07:00", end: "22:00" }
];

export const TEMPLATE = [
  { name: "Протеинов шейк", price: 4.5, bonus: 0.5, targets: { morning: 2, evening: 4, double: 5 } },
  { name: "Протеиново блокче", price: 3, bonus: 0.3, targets: { morning: 3, evening: 3, double: 5 } },
  { name: "Енергийна напитка", price: 3.5, bonus: 0.3, targets: { morning: 1, evening: 3, double: 4 } },
  { name: "Персонална тренировка", price: 35, bonus: 5, targets: {} },
  { name: "Месечна карта", price: 60, bonus: 6, targets: {} },
  { name: "Вода", price: 1.5, bonus: 0.1, targets: {} }
];

export const data = { cfg: null, shifts: [], sales: [] };

export function emptyCfg() {
  return { products: [], staff: [], shiftTypes: clone(SHIFT_TYPES), contest: { on: false, title: "", prize: "", metric: "pct", from: MONTH_START, to: MONTH_END } };
}

function normCfg(c) {
  const e = emptyCfg();
  const shiftTypes = Array.isArray(c?.shiftTypes) && c.shiftTypes.length ? c.shiftTypes : e.shiftTypes;
  return {
    products: (Array.isArray(c?.products) ? c.products : []).map(p => ({ ...p, targets: p.targets || {} })),
    staff: Array.isArray(c?.staff) ? c.staff : [],
    shiftTypes,
    contest: { ...e.contest, ...(c?.contest || {}) }
  };
}

export const isConfigured = !String(firebaseConfig.apiKey || "").startsWith("PASTE");

// ---------- демо ----------
function makeDemo() {
  const products = TEMPLATE.map((p, i) => ({ id: "p" + i, ...clone(p) }));
  const staff = [{ id: "s1", name: "Ани", color: 0 }, { id: "s2", name: "Иво", color: 1 }, { id: "s3", name: "Мира", color: 2 }];
  const shifts = [], sales = [];
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let d = PREV_MONTH_START; d <= addDays(MONTH_END, 7); d = addDays(d, 1)) {
    const k = parse(d).getDate();
    if (parse(d).getDay() === 0) {
      shifts.push({ id: "d" + d, date: d, type: "double", start: "07:00", end: "22:00", staff: [k % 2 ? "s1" : "s3"] });
      continue;
    }
    shifts.push({ id: "m" + d, date: d, type: "morning", start: "07:00", end: "14:30", staff: k % 3 === 0 ? ["s1", "s2"] : ["s1"] });
    shifts.push({ id: "e" + d, date: d, type: "evening", start: "14:30", end: "22:00", staff: k % 2 === 0 ? ["s2", "s3"] : ["s3"] });
  }
  const skill = { s1: 1.1, s2: 0.75, s3: 0.95 };
  for (const sh of shifts) {
    if (sh.date > TODAY) continue;
    const part = sh.date === TODAY ? 0.45 : 1;
    for (const sid of sh.staff) for (const p of products) {
      const t = p.targets[sh.type] || 0;
      const n = Math.floor((t ? t * 1.1 : 0.35) * skill[sid] * part + rnd() * 1.2 - 0.3);
      for (let i = 0; i < n; i++) sales.push({ id: rid(), date: sh.date, ts: 0, time: sh.start, staffId: sid, productId: p.id, qty: 1, price: p.price, bonus: p.bonus, shiftId: sh.id, uid: "demo" });
    }
  }
  const cfg = { products, staff, shiftTypes: clone(SHIFT_TYPES), contest: { on: true, title: "Есенен шампионат", prize: "Ваучер за 50 € и почивен уикенд", metric: "pct", from: MONTH_START, to: MONTH_END } };
  return { cfg, shifts, sales };
}

function demoBackend(onChange) {
  Object.assign(data, makeDemo());
  const done = () => { onChange(); };
  return {
    mode: "demo",
    async addSale(rec) { const id = rid(); data.sales.push({ id, ...rec, uid: "demo" }); done(); return id; },
    async deleteSale(id) { data.sales = data.sales.filter(s => s.id !== id); done(); },
    async saveCfg(cfg) { data.cfg = clone(cfg); done(); },
    async saveShift(sh) {
      const body = { date: sh.date, type: sh.type, start: sh.start, end: sh.end, staff: sh.staff };
      const i = data.shifts.findIndex(s => s.id === sh.id);
      if (i >= 0) data.shifts[i] = { id: sh.id, ...body }; else data.shifts.push({ id: rid(), ...body });
      done();
    },
    async deleteShift(id) { data.shifts = data.shifts.filter(s => s.id !== id); done(); },
    canDeleteSale: () => true
  };
}

// ---------- Firebase ----------
// role: "staff" влиза анонимно; "manager" влиза с Google и трябва да е в колекцията managers.
// onAuth(state) получава { status: "signed-out" | "checking" | "denied" | "ready", email }.
export async function connect({ role, onChange, onAuth }) {
  if (!isConfigured) {
    const be = demoBackend(onChange);
    setTimeout(() => { onAuth({ status: "ready", email: null }); onChange(); });
    return { ...be, signIn() {}, signOut() {} };
  }

  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch {
    db = fs.getFirestore(app);
  }

  let unsubs = [], uid = null, salesFrom = null, unsubSales = null;
  const stop = () => { unsubs.forEach(u => u()); unsubs = []; unsubSales?.(); unsubSales = null; salesFrom = null; };
  const errored = e => console.warn("Firestore:", e?.code || e);

  function subscribeSales(from) {
    if (from === salesFrom) return;
    unsubSales?.();
    salesFrom = from;
    unsubSales = fs.onSnapshot(fs.query(fs.collection(db, "sales"), fs.where("date", ">=", from)), snap => {
      data.sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onChange();
    }, errored);
  }
  function wantedSalesFrom() {
    const k = data.cfg?.contest;
    let from = role === "manager" ? PREV_MONTH_START : MONTH_START;
    if (k?.on && k.from && k.from < from) from = k.from;
    return from;
  }

  function start() {
    unsubs.push(fs.onSnapshot(fs.doc(db, "config", "main"), snap => {
      data.cfg = normCfg(snap.exists() ? snap.data() : null);
      subscribeSales(wantedSalesFrom());
      onChange();
    }, errored));
    unsubs.push(fs.onSnapshot(fs.query(fs.collection(db, "shifts"), fs.where("date", ">=", PREV_MONTH_START)), snap => {
      data.shifts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onChange();
    }, errored));
  }

  auth.onAuthStateChanged(a, async user => {
    stop();
    uid = user?.uid || null;
    if (role === "staff") {
      if (!user) { auth.signInAnonymously(a).catch(e => onAuth({ status: "error", error: e })); return; }
      onAuth({ status: "ready" }); start(); return;
    }
    if (!user || user.isAnonymous) { onAuth({ status: "signed-out" }); return; }
    onAuth({ status: "checking", email: user.email });
    let ok = false;
    try { ok = user.emailVerified && (await fs.getDoc(fs.doc(db, "managers", user.email))).exists(); } catch {}
    if (!ok) { onAuth({ status: "denied", email: user.email }); return; }
    onAuth({ status: "ready", email: user.email });
    start();
  });

  return {
    mode: "live",
    async addSale(rec) {
      const ref = fs.doc(fs.collection(db, "sales"));
      // Не чакаме сървъра: при слаб интернет продажбата се пази локално и се праща по-късно.
      fs.setDoc(ref, { ...rec, uid, createdAt: fs.serverTimestamp() }).catch(e => { errored(e); this.onWriteError?.(e); });
      return ref.id;
    },
    async deleteSale(id) { await fs.deleteDoc(fs.doc(db, "sales", id)); },
    async saveCfg(cfg) { await fs.setDoc(fs.doc(db, "config", "main"), cfg); subscribeSales(wantedSalesFrom()); },
    async saveShift(sh) {
      const body = { date: sh.date, type: sh.type, start: sh.start, end: sh.end, staff: sh.staff };
      await fs.setDoc(sh.id ? fs.doc(db, "shifts", sh.id) : fs.doc(fs.collection(db, "shifts")), body);
    },
    async deleteShift(id) { await fs.deleteDoc(fs.doc(db, "shifts", id)); },
    // Служителят може да изтрие своя продажба до 12 часа след записа (правилото е и във firestore.rules).
    canDeleteSale: s => role === "manager" || (s.uid === uid && s.date === TODAY),
    async signIn() {
      const p = new auth.GoogleAuthProvider();
      try { await auth.signInWithPopup(a, p); }
      catch (e) { if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") await auth.signInWithRedirect(a, p); else throw e; }
    },
    async signOut() { await auth.signOut(a); }
  };
}
