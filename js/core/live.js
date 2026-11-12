// Live lookups: your browser asks the quote provider directly for the tickers you pick, when you press a button.
// Only ticker symbols are sent. Nothing about your holdings, shares or portfolio leaves the page.
// The provider is unofficial and may refuse requests from web pages (CORS); every failure is named, never faked.
import { fromYahoo, summarize, yahooChartUrl } from "./quotes.js";

export const LIVE = { timeoutMs: 12000, concurrency: 4, maxTickers: 40, source: "Yahoo Finance (live)" };
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export const normalizeProxy = (v) => {
  const s = String(v ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[A-Za-z0-9.\-]+(:\d+)?(\/[A-Za-z0-9._~\-\/]*)?$/.test(s) ? s : "";
};

// With a proxy the path is the same as the provider's, so a tiny worker can forward it and add CORS headers.
export function liveUrl(ticker, proxy = "") {
  const base = yahooChartUrl(ticker);
  const p = normalizeProxy(proxy);
  return p ? base.replace(/^https:\/\/[^/]+/, p) : base;
}

export const REASONS = {
  blocked: "Your browser blocked the request (the provider does not allow direct calls from web pages, or you are offline).",
  not_found: "The provider has no data for that ticker.",
  rate: "The provider is limiting requests right now. Try again in a few minutes.",
  http: "The provider answered with an error.",
  bad: "The provider's answer could not be read.",
  non_usd: "That listing is not priced in US dollars, so it was not used.",
  bad_ticker: "That is not a ticker symbol.",
};

// Turn a parsed answer into a market entry shaped like data.json's, keeping what we already know (tax type, schedule) when the feed does not say.
export function entryFromLive(ticker, raw, prev = null, now = new Date()) {
  const sum = summarize(raw, now.getTime());
  const e = { n: raw.meta?.name || prev?.n || ticker, p: sum.p, d: sum.d, s: sum.s || prev?.s || "Q3", q: prev ? prev.q !== false : true, src: LIVE.source, u: now.toISOString() };
  for (const k of ["per", "last", "hist", "g3", "g5"]) if (sum[k] != null) e[k] = sum[k];
  const t = raw.meta?.type;
  e.type = prev?.type || (t === "ETF" || t === "MUTUALFUND" ? "ETF_PASS_THROUGH" : "EQUITY_STANDARD");
  if (prev?.sp500) e.sp500 = true;
  if (!(sum.d > 0) && prev?.d > 0) { e.d = prev.d; e.est = true; if (prev.per) e.per = prev.per; if (prev.s) e.s = prev.s; delete e.hist; delete e.last; }
  return e;
}

// One ticker. Returns { ok:true, entry, splits } or { ok:false, code, message }.
export async function fetchLive(ticker, { fetchFn = globalThis.fetch, proxy = "", prev = null, now = new Date(), timeoutMs = LIVE.timeoutMs } = {}) {
  const t = String(ticker ?? "").trim().toUpperCase();
  const fail = (code) => ({ ok: false, code, message: REASONS[code], ticker: t });
  if (!TICKER.test(t)) return fail("bad_ticker");
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn(liveUrl(t, proxy), { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: ctl?.signal });
    if (res.status === 404) return fail("not_found");
    if (res.status === 429) return fail("rate");
    if (!res.ok) return fail("http");
    let json; try { json = await res.json(); } catch { return fail("bad"); }
    if (json?.chart?.error?.code === "Not Found") return fail("not_found");
    const raw = fromYahoo(json);
    if (!raw) return fail(json?.chart?.result ? "bad" : "not_found");
    if (raw.meta?.currency && raw.meta.currency !== "USD") return fail("non_usd");
    return { ok: true, ticker: t, entry: entryFromLive(t, raw, prev, now), splits: raw.splits, name: raw.meta?.name || "" };
  } catch { return fail("blocked"); }
  finally { if (timer) clearTimeout(timer); }
}

// Several tickers with a small worker pool. If the first two answers are both "blocked", the browser is refusing: stop, do not hammer.
export async function pullLive(tickers, { fetchFn, proxy = "", prevOf = () => null, onProgress = () => {}, concurrency = LIVE.concurrency, now = new Date() } = {}) {
  const list = [...new Set(tickers.map((t) => String(t).trim().toUpperCase()))].slice(0, LIVE.maxTickers);
  const results = new Map(); let next = 0, blockedFirst = 0, aborted = false;
  async function worker() {
    while (!aborted && next < list.length) {
      const t = list[next++];
      const r = await fetchLive(t, { fetchFn, proxy, prev: prevOf(t), now });
      results.set(t, r);
      if (results.size <= 2 && !r.ok && r.code === "blocked") blockedFirst++;
      if (blockedFirst >= 2 && results.size >= 2) aborted = true;
      onProgress(results.size, list.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) || 1 }, worker));
  for (const t of list) if (!results.has(t)) results.set(t, { ok: false, code: "blocked", message: REASONS.blocked, ticker: t, skipped: true });
  const vals = [...results.values()];
  return { results, total: list.length, ok: vals.filter((r) => r.ok).length, blocked: aborted || (vals.length > 0 && vals.every((r) => !r.ok && r.code === "blocked")), failed: vals.filter((r) => !r.ok) };
}

// Stricter than the request check: used to decide whether search text is a symbol (SNDK, BRK-B) rather than a company name.
export const looksLikeTicker = (q) => /^[A-Z]{1,5}([.\-][A-Z]{1,2})?$/.test(String(q ?? "").trim().toUpperCase());
