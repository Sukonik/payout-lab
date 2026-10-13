// Dividend calculators. Pure functions, no DOM. Extracted unchanged from the V1 single-file app:
// the formulas must not change in the workspace redesign, and tests/calc.test.mjs guards them.
export const FORMULA_VERSION = "calc-1";
export const SCHED = {
  M: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], Q1: [1, 4, 7, 10], Q2: [2, 5, 8, 11], Q3: [3, 6, 9, 12], S: [6, 12], A: [12],
};
export const SCHED_LABEL = {
  M: "Monthly", Q1: "Jan Apr Jul Oct", Q2: "Feb May Aug Nov", Q3: "Mar Jun Sep Dec", S: "Twice a year", A: "Once a year",
};
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

// A "calc holding" is { t, shares, price, div, s, q }: ticker, shares, price, yearly dividend per share, schedule, qualified.
export function inc(h) { return num(h.shares) * num(h.div); }
export function perPay(h) { return num(h.div) / (SCHED[h.s] || SCHED.Q3).length; }

export function totals(hs) {
  let v = 0, i = 0;
  hs.forEach((h) => { v += num(h.shares) * num(h.price); i += inc(h); });
  return { value: v, income: i, yield: v > 0 ? i / v : 0 };
}

export function calendar(hs) {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  hs.forEach((h) => {
    const ms = SCHED[h.s] || SCHED.Q3;
    const per = inc(h) / ms.length;
    ms.forEach((x) => { m[x - 1] += per; });
  });
  return m;
}

// Month-by-month projection. Returns months to reach target, or null if not within 50 years.
export function simulate(annual, y, target, C, g, reinvest) {
  let M = annual / 12;
  if (target <= 0 || M >= target) return 0;
  const gm = Math.pow(1 + g / 100, 1 / 12) - 1;
  for (let k = 1; k <= 600; k++) {
    M *= 1 + gm;
    const buy = C + (reinvest ? M : 0);
    M += (buy * y) / 12;
    if (M >= target) return k;
  }
  return null;
}

export function path(annual, y, C, g, reinvest, n) {
  let M = annual / 12;
  const out = [M], gm = Math.pow(1 + g / 100, 1 / 12) - 1;
  for (let k = 1; k <= n; k++) {
    M *= 1 + gm;
    const buy = C + (reinvest ? M : 0);
    M += (buy * y) / 12;
    out.push(M);
  }
  return out;
}

export function dur(m) {
  if (m === null) return "50+ years";
  if (m === 0) return "Already there";
  const y = Math.floor(m / 12), r = m % 12, p = [];
  if (y) p.push(y + (y > 1 ? " yrs" : " yr"));
  if (r) p.push(r + (r > 1 ? " mos" : " mo"));
  return p.join(" ");
}

export function when(m, now = new Date()) {
  if (m === null) return "Not within 50 years";
  const d = new Date(now.getTime());
  d.setDate(1);
  d.setMonth(d.getMonth() + m);
  return MONTHS[d.getMonth()] + " " + d.getFullYear();
}

export function shift(a, b) { // b relative to a
  if (a === null && b === null) return "Both beyond 50 years";
  if (b === null) return "Pushes goal past 50 years";
  if (a === null) return "Brings goal within reach";
  const d = b - a;
  if (d === 0) return "No change";
  return dur(Math.abs(d)) + (d > 0 ? " later" : " sooner");
}

// Tax split used by the Taxable vs IRA panel.
export function taxSummary(hs, T, s) {
  let q = 0, o = 0;
  const ordList = [];
  hs.forEach((h) => { const v = inc(h); if (h.q) q += v; else { o += v; if (v > 0) ordList.push(h.t); } });
  const st = num(s.stRate);
  const taxQ = (q * (num(s.qRate) + st)) / 100;
  const taxO = (o * (num(s.oRate) + st)) / 100;
  return { q, o, ordList, taxQ, taxO, net: T.income - taxQ - taxO, trad: T.income * (1 - (num(s.oRate) + st) / 100) };
}

// Who pays in each month: [{ t, amount }] sorted by amount, for the tube-rack detail view. Same spreading rule as calendar().
export function calendarDetail(hs) {
  const out = Array.from({ length: 12 }, () => []);
  hs.forEach((h) => {
    const ms = SCHED[h.s] || SCHED.Q3;
    const per = inc(h) / ms.length;
    if (per > 0) ms.forEach((x) => out[x - 1].push({ t: h.t, amount: per }));
  });
  out.forEach((l) => l.sort((a, b) => b.amount - a.amount));
  return out;
}
