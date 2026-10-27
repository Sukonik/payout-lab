// Public market data (data.json) and helpers that turn a market entry into a portfolio holding.
// Market data is public and separate from personal portfolio data. A holding keeps its own dated copy of the values it uses.
import { LIMITS, TICKER_RE_PUBLIC, newId } from "./packet.js";
import { SCHED } from "./calc.js";

export const SRC_LABEL = {
  tiingo: "Tiingo", yahoo: "Yahoo Finance", seed: "Starter estimate", user: "You", csv: "CSV import", legacy: "Earlier version", data: "Payout Lab data",
};

// Used only if data.json cannot be loaded, so the sample portfolio still works offline. Marked as estimates.
const FALLBACK = {
  SCHD: { n: "Schwab US Dividend Equity ETF", p: 27.5, d: 1.03, s: "Q3", q: true },
  O: { n: "Realty Income", p: 57, d: 3.22, s: "M", q: false },
  JEPI: { n: "JPMorgan Equity Premium Income ETF", p: 57, d: 4.5, s: "M", q: false },
  VZ: { n: "Verizon", p: 43, d: 2.71, s: "Q2", q: true },
  KO: { n: "Coca-Cola", p: 70, d: 2.04, s: "Q1", q: true },
  ABBV: { n: "AbbVie", p: 195, d: 6.56, s: "Q2", q: true },
  MSFT: { n: "Microsoft", p: 500, d: 3.64, s: "Q3", q: true },
};
export const SAMPLE = [["SCHD", 300], ["O", 80], ["JEPI", 60], ["VZ", 50], ["KO", 40], ["ABBV", 15], ["MSFT", 5]];

let market = { updated: null, source: null, tickers: { ...FALLBACK }, loaded: false };

export function getMarket() { return market; }
export function setMarket(m) { market = m; }
export function lookup(t) { const e = market.tickers[t]; return e && e.p > 0 ? e : null; }

export async function loadMarket(url = "data.json", fetchFn = globalThis.fetch) {
  try {
    const r = await fetchFn(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!j || typeof j.tickers !== "object") throw new Error("bad data");
    const tickers = {};
    for (const [k, v] of Object.entries(j.tickers)) { const e = sanitizeEntry(k, v); if (e) tickers[k] = e; }
    market = { updated: typeof j.updated === "string" ? j.updated : null, source: typeof j.source === "string" ? j.source : null, tickers, loaded: true };
  } catch {
    market = { ...market, loaded: false };
  }
  return market;
}

// data.json is public input too. Rebuild each entry from known fields and bounds so a bad value cannot reach a holding,
// a rendered page or a saved packet. An entry without a usable price and dividend is dropped.
const isNum = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
export function sanitizeEntry(key, v) {
  if (!TICKER_RE_PUBLIC.test(key) || !v || typeof v !== "object") return null;
  if (!isNum(v.p, 1e-9, LIMITS.maxPrice) || !isNum(v.d, 0, LIMITS.maxDividend)) return null;
  const e = { n: typeof v.n === "string" ? v.n.replace(/[\u0000-\u001f]/g, " ").slice(0, 120) : key, p: v.p, d: v.d, s: Object.keys(SCHED).includes(v.s) ? v.s : "Q3", q: v.q !== false };
  if (isNum(v.per, 0, LIMITS.maxDividend)) e.per = v.per;
  if (isDay(v.u)) e.u = v.u;
  if (isDay(v.last)) e.last = v.last.slice(0, 10);
  if (typeof v.src === "string") e.src = v.src.slice(0, 24);
  if (["EQUITY_STANDARD", "ETF_PASS_THROUGH", "ADR_VARIABLE"].includes(v.type)) e.type = v.type;
  if (v.est === true) e.est = true;
  if (isNum(v.g3, -1, 100)) e.g3 = v.g3;
  if (isNum(v.g5, -1, 100)) e.g5 = v.g5;
  if (Array.isArray(v.hist)) e.hist = v.hist.slice(-12).filter((h) => h && isDay(h.d) && isNum(h.a, 0, LIMITS.maxDividend)).map((h) => ({ d: h.d.slice(0, 10), a: h.a }));
  if (Array.isArray(v.sp)) {
    const sp = v.sp.slice(-6).filter((x) => x && isDay(x.d) && isNum(x.f, 0.001, 1000) && x.f !== 1).map((x) => ({ d: x.d.slice(0, 10), f: x.f }));
    if (sp.length) e.sp = sp;
  }
  return e;
}

// Explicit symbol aliases: a dotted class share like BRK.B is stored as BRK-B in the data. Only applied when the alias exists.
export function resolveTicker(input) {
  const t = String(input ?? "").trim().toUpperCase();
  if (!t) return { ticker: "", aliasOf: null };
  if (lookup(t)) return { ticker: t, aliasOf: null };
  if (t.includes(".")) {
    const dash = t.replace(/\./g, "-");
    if (lookup(dash)) return { ticker: dash, aliasOf: t };
  }
  return { ticker: t, aliasOf: null };
}

function providerOf(e) {
  const s = String(e.src || "").toLowerCase();
  if (s.startsWith("tiingo")) return "tiingo";
  if (s.startsWith("yahoo")) return "yahoo";
  return "seed";
}
export function asOfOf(e) { return typeof e.u === "string" ? e.u.slice(0, 10) : null; }

// Build a holding from a market entry. Values carry the provider and the date the provider observed them.
export function holdingFromMarket(ticker, shares, e, basis = "trailing") {
  const prov = providerOf(e), asOf = asOfOf(e);
  const estDiv = e.est === true || !asOf;
  return {
    id: newId("h"), ticker, name: e.n || "", shares,
    fields: {
      price: { v: e.p, src: prov, asOf, manual: false },
      dividend: { v: estDiv ? e.d : marketDividend(e, basis), src: estDiv ? "seed" : prov, asOf: estDiv ? null : asOf, manual: false, basis: estDiv ? null : basis },
      schedule: { v: e.s || "Q3", src: asOf ? prov : "seed", asOf, manual: false, basis: asOf ? "ex-date" : "unknown", exDate: asOf && typeof e.last === "string" ? e.last : null, payDate: null },
      tax: { v: e.q !== false, src: "data", asOf: null, manual: false },
    },
  };
}

// A ticker we have no data for: the user must supply the numbers, so they are protected as manual.
export function manualHolding(ticker, shares) {
  const u = { src: "user", asOf: null, manual: true };
  return {
    id: newId("h"), ticker, name: "", shares,
    fields: {
      price: { v: 0, ...u }, dividend: { v: 0, ...u, basis: null },
      schedule: { v: "Q3", ...u, basis: "user", exDate: null, payDate: null }, tax: { v: true, ...u },
    },
  };
}

// ---------- trailing vs indicated dividends ----------
// "Last 12 months" (d) adds up what was paid. "Current rate" multiplies the latest payment by how often it is paid.
// They answer different questions: the second reacts faster to a raise or cut and ignores one-off extras.
export function paymentsPerYear(e) { return (SCHED[e.s] || SCHED.Q3).length; }
export function indicatedAnnual(e) { return e.per > 0 ? e.per * paymentsPerYear(e) : e.d; }
export function marketDividend(e, basis) { return basis === "indicated" ? indicatedAnnual(e) : e.d; }

// A plain-language hint when the two disagree. The data cannot tell a special payment from an irregular one, so it says "may".
export function dividendHint(e) {
  if (!(e.d > 0) || !(e.per > 0)) return null;
  const r = e.d / indicatedAnnual(e);
  if (r > 1.15) return "The last 12 months add up to more than the current rate. That can mean a special or extra payment, or a recent cut.";
  if (r < 0.85) return "The current rate is higher than the last 12 months. That can mean a recent raise, or a payment that has not happened yet this year.";
  return null;
}
