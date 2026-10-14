// Stock splits: history and announced events. Pure logic; the page and the refresh script both use it.
// A split is "a new shares for every b old ones": 20-for-1 is a=20,b=1 (forward), 1-for-10 is a=1,b=10 (reverse).
// Nothing here predicts a split. Upcoming entries are only what an issuer has announced, with a source.

export const SPLIT_LIMITS = { maxPerTicker: 40, maxUpcoming: 200, maxRatio: 1000 };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const isDay = (v) => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const isInt = (v) => Number.isInteger(v) && v >= 1 && v <= SPLIT_LIMITS.maxRatio;
const isPrice = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e7;
const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : "");

export const kindOf = (a, b) => (a > b ? "forward" : a < b ? "reverse" : "none");
export const factorOf = (s) => s.a / s.b;
export const ratioLabel = (s) => `${s.a}-for-${s.b}`;

// Day, month, year without time zones: the date is the exchange's calendar day.
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export function dateParts(iso) {
  if (!isDay(iso)) return null;
  return { day: iso.slice(8, 10), month: MONTHS[Number(iso.slice(5, 7)) - 1], year: iso.slice(0, 4), iso };
}
export const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 864e5);

// ---------- validation of a public data file ----------
export function sanitizeSplit(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!isDay(raw.d) || !isInt(raw.a) || !isInt(raw.b) || raw.a === raw.b) return null;
  const s = { d: raw.d, a: raw.a, b: raw.b, src: text(raw.src, 40) || "unknown", ver: raw.ver === 1 ? 1 : 0 };
  if (isPrice(raw.pre)) s.pre = raw.pre;
  if (isPrice(raw.post)) s.post = raw.post;
  return s;
}

export function sanitizeUpcoming(raw) {
  if (!raw || typeof raw !== "object") return null;
  const t = typeof raw.t === "string" ? raw.t.toUpperCase() : "";
  if (!TICKER.test(t) || !isDay(raw.exDate) || !isInt(raw.a) || !isInt(raw.b) || raw.a === raw.b) return null;
  const url = typeof raw.url === "string" && /^https:\/\/[^\s"'<>]{4,300}$/.test(raw.url) ? raw.url : "";
  const status = ["announced", "confirmed", "unverified", "cancelled"].includes(raw.status) ? raw.status : "unverified";
  const u = { t, n: text(raw.n, 80), a: raw.a, b: raw.b, exDate: raw.exDate, status, src: text(raw.src, 60) || "unknown", url };
  if (isDay(raw.announced)) u.announced = raw.announced;
  if (isDay(raw.payDate)) u.payDate = raw.payDate;
  if (isDay(raw.asOf)) u.asOf = raw.asOf;
  return u;
}

export function sanitizeSplitsFile(j) {
  if (!j || typeof j !== "object" || typeof j.tickers !== "object" || j.tickers === null) return null;
  const tickers = {};
  for (const [k, v] of Object.entries(j.tickers)) {
    const t = k.toUpperCase();
    if (!TICKER.test(t) || !v || typeof v !== "object" || !Array.isArray(v.s)) continue;
    const s = v.s.map(sanitizeSplit).filter(Boolean).sort((x, y) => (x.d < y.d ? -1 : 1)).slice(-SPLIT_LIMITS.maxPerTicker);
    tickers[t] = { n: text(v.n, 80), s, u: isDay((v.u || "").slice(0, 10)) ? v.u.slice(0, 10) : null };
  }
  const upcoming = (Array.isArray(j.upcoming) ? j.upcoming : []).slice(0, SPLIT_LIMITS.maxUpcoming).map(sanitizeUpcoming).filter(Boolean).sort((x, y) => (x.exDate < y.exDate ? -1 : 1));
  return { updated: typeof j.updated === "string" ? j.updated : null, upcomingAsOf: isDay(j.upcomingAsOf) ? j.upcomingAsOf : null, tickers, upcoming };
}

let store = { updated: null, upcomingAsOf: null, tickers: {}, upcoming: [], loaded: false };
export const getSplits = () => store;
export async function loadSplits(url = "splits.json", fetchFn = globalThis.fetch) {
  try {
    const r = await fetchFn(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const f = sanitizeSplitsFile(await r.json());
    if (!f) throw new Error("bad data");
    store = { ...f, loaded: true };
  } catch { store = { ...store, loaded: false }; }
  return store;
}
export const setSplits = (f) => { store = { ...f, loaded: true }; };

// ---------- derive splits from daily price rows (Tiingo: { date, close, splitFactor }) ----------
// splitFactor is the new-per-old ratio applied on that day (2 for a 2-for-1, 0.1 for a 1-for-10). We recover a and b as small integers.
export function ratioFromFactor(f) {
  if (!(f > 0) || !Number.isFinite(f) || f === 1) return null;
  for (let b = 1; b <= 20; b++) {
    const a = Math.round(f * b);
    if (a >= 1 && a <= SPLIT_LIMITS.maxRatio && Math.abs(a / b - f) <= 1e-6 * Math.max(1, f)) { const g = gcd(a, b); return { a: a / g, b: b / g }; }
  }
  return null;
}
const gcd = (x, y) => (y ? gcd(y, x % y) : x);

export function splitsFromPrices(rows, src = "Tiingo") {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], f = Number(r.splitFactor);
    if (!(f > 0) || f === 1) continue;
    const ratio = ratioFromFactor(f);
    const d = String(r.date || "").slice(0, 10);
    if (!ratio || !isDay(d)) continue;
    const s = { d, ...ratio, src, ver: 1 };
    const pre = rows[i - 1]?.close, post = r.close;
    if (isPrice(pre)) s.pre = pre;
    if (isPrice(post)) s.post = post;
    out.push(s);
  }
  return out;
}

// ---------- what a split does ----------
export const afterSplit = (shares, s) => shares * s.a / s.b;
export const priceAfter = (price, s) => price * s.b / s.a;

// Later splits change the share count since a given split. Price ratios must be put on the same footing.
export function laterFactor(list, s) {
  return list.filter((x) => x.d > s.d).reduce((m, x) => m * factorOf(x), 1);
}
// Move since the split, using the first post-split price (raw, so scaled by later splits) against today's price.
export function moveSince(list, s, nowPrice) {
  if (!isPrice(s.post) || !isPrice(nowPrice)) return null;
  const base = s.post / laterFactor(list, s);
  return nowPrice / base - 1;
}
export function cumulativeFactorSince(list, iso) { return list.filter((x) => x.d >= iso).reduce((m, x) => m * factorOf(x), 1); }

// ---------- views ----------
// One flat list of events for the ledger: history from every ticker, newest first.
export function ledger(file, market = {}) {
  const rows = [];
  for (const [t, v] of Object.entries(file.tickers)) {
    for (const s of v.s) rows.push({ t, n: v.n || market[t]?.n || "", ...s, kind: kindOf(s.a, s.b), move: moveSince(v.s, s, market[t]?.p) });
  }
  return rows.sort((x, y) => (x.d === y.d ? (x.t < y.t ? -1 : 1) : x.d < y.d ? 1 : -1));
}

export function filterLedger(rows, { kind = "forward", query = "", since = "" } = {}) {
  const q = String(query).trim().toLowerCase();
  return rows.filter((r) => (kind === "all" || r.kind === kind) && (!since || r.d >= since) && (!q || r.t.toLowerCase().startsWith(q) || (r.n || "").toLowerCase().includes(q)));
}

export function upcomingView(file, today, { kind = "forward" } = {}) {
  return file.upcoming
    .filter((u) => u.status !== "cancelled" && u.exDate >= today && (kind === "all" || kindOf(u.a, u.b) === kind))
    .map((u) => ({ ...u, kind: kindOf(u.a, u.b), days: daysBetween(today, u.exDate) }));
}

export function yearGroups(rows) {
  const g = [];
  for (const r of rows) { const y = r.d.slice(0, 4); if (!g.length || g[g.length - 1].year !== y) g.push({ year: y, rows: [] }); g[g.length - 1].rows.push(r); }
  return g;
}

// Which of your holdings have a split in their history, and what they would have been worth in shares then.
export function holdingsWithSplits(holdings, file) {
  const out = [];
  for (const h of holdings) {
    const v = file.tickers[h.ticker];
    if (v && v.s.length) out.push({ ticker: h.ticker, name: h.name, shares: h.shares, splits: v.s, factor: v.s.reduce((m, x) => m * factorOf(x), 1) });
  }
  return out;
}

export function compareTickers(file, market, t1, t2) {
  const one = (t) => {
    const v = file.tickers[t]; const s = v ? v.s : [];
    const fw = s.filter((x) => kindOf(x.a, x.b) === "forward"), rv = s.filter((x) => kindOf(x.a, x.b) === "reverse");
    return { t, n: v?.n || market[t]?.n || "", known: !!v, count: s.length, forward: fw.length, reverse: rv.length, last: s[s.length - 1] || null, price: market[t]?.p ?? null, factor: s.reduce((m, x) => m * factorOf(x), 1), splits: s };
  };
  return [one(t1), one(t2)];
}

// ---------- announced splits from Nasdaq's public calendar (via the refresh Action) ----------
// Nasdaq's calendar API is undocumented, so every field is parsed defensively and anything unreadable is dropped and counted.
// Row shape (as used by the open-source EventCalendar client): { symbol, name, ratio: "2 : 1", payableDate, executionDate, announcedDate } with MM/DD/YYYY dates.
export function parseRatio(v) {
  const m = /^\s*(\d{1,4})\s*(?::|-?\s*for\s*-?|\/)\s*(\d{1,4})\s*$/i.exec(String(v ?? ""));
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (!isInt(a) || !isInt(b) || a === b) return null;
  const g = gcd(a, b);
  return { a: a / g, b: b / g };
}
export function parseUsDate(v) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(String(v ?? ""));
  if (m) { const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; return isDay(iso) ? iso : null; }
  const t = String(v ?? "").trim();
  return isDay(t) ? t : null;
}

// The page the data came from is passed in by the caller, so no external address is baked into the shipped app code.
export function fromNasdaqRows(rows, asOf, url = "") {
  const out = []; let dropped = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const ratio = parseRatio(r?.ratio), exDate = parseUsDate(r?.executionDate), t = String(r?.symbol ?? "").trim().toUpperCase();
    const u = ratio && exDate ? sanitizeUpcoming({ t, n: r.name, ...ratio, exDate, announced: parseUsDate(r.announcedDate) || undefined, payDate: parseUsDate(r.payableDate) || undefined, status: "announced", src: "Nasdaq calendar", url, asOf }) : null;
    if (u) out.push(u); else dropped++;
  }
  return { rows: out, dropped };
}

// Keep hand-kept entries as they are, refresh calendar entries, and be careful about what disappears:
// a calendar entry that is no longer listed before its date is marked unverified rather than deleted or trusted.
export function reconcileUpcoming(prev, fetched, today) {
  const key = (u) => `${u.t}|${u.exDate}`;
  const fresh = new Map(fetched.map((u) => [key(u), u]));
  const out = [];
  for (const u of prev) {
    if (u.src !== "Nasdaq calendar") { out.push(u); continue; }       // manual entries are never touched
    if (fresh.has(key(u))) continue;                                   // replaced below
    if (u.exDate >= today) out.push({ ...u, status: u.status === "cancelled" ? "cancelled" : "unverified" });
  }
  const manual = new Set(out.map(key));
  for (const u of fresh.values()) if (!manual.has(key(u))) out.push(u);
  return out.sort((x, y) => (x.exDate < y.exDate ? -1 : x.exDate > y.exDate ? 1 : x.t < y.t ? -1 : 1));
}

// A calendar-announced split whose date has passed becomes history (not yet cross-checked) for tickers we track.
// The Tiingo refresh replaces it with feed data. Returns the entries moved, so callers can report them.
export function archiveDone(file, today, known) {
  const moved = [];
  const keep = [];
  for (const u of file.upcoming) {
    if (u.exDate < today && u.status !== "cancelled" && u.status !== "unverified" && known.has(u.t)) {
      const v = file.tickers[u.t] || (file.tickers[u.t] = { n: u.n, s: [], u: null });
      if (!v.s.some((s) => s.d === u.exDate)) { v.s.push({ d: u.exDate, a: u.a, b: u.b, src: u.src, ver: 0 }); v.s.sort((x, y) => (x.d < y.d ? -1 : 1)); moved.push(u); }
    } else if (u.exDate >= today || u.status === "unverified" || u.status === "cancelled") keep.push(u);
  }
  file.upcoming = keep;
  return moved;
}
