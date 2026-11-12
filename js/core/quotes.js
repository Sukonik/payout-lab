// Quote parsing shared by the refresh Action and the browser live lookup. Pure functions: no network, no storage.

const SCHEDULES = { 12: "M", 2: "S", 1: "A" };

// Provider adapters: each returns { price, events: [{ t: ms, a: amount }], splits: [{ d, a, b }] | null } or null.
// `splits` is null when the response does not say (so callers never wipe known history on an incomplete answer).
export function fromYahoo(chart) {
  const r = chart?.chart?.result?.[0];
  const price = r?.meta?.regularMarketPrice;
  if (!r || !(price > 0)) return null;
  const events = Object.values(r.events?.dividends ?? {}).map((e) => ({ t: e.date * 1000, a: e.amount })).filter((e) => e.a > 0 && Number.isFinite(e.t));
  const splits = r.events ? Object.values(r.events.splits ?? {}).map((e) => ({ d: new Date(e.date * 1000).toISOString().slice(0, 10), a: Number(e.numerator), b: Number(e.denominator), src: "Yahoo Finance" })).filter((s) => Number.isInteger(s.a) && Number.isInteger(s.b) && s.a > 0 && s.b > 0 && s.a !== s.b) : null;
  return { price, events, splits };
}

// The one request that gives price, dividends and splits together. Browsers and the refresh Action use the same URL.
export const yahooChartUrl = (t, host = "query1.finance.yahoo.com") => `https://${host}/v8/finance/chart/${encodeURIComponent(t)}?range=max&interval=1mo&events=div%2Csplits`;

// Tiingo daily prices: [{ date, close, divCash, ... }] in date order. divCash is the cash dividend on its ex-date.
export function fromTiingo(rows, deriveSplits = null) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const price = rows[rows.length - 1].close;
  if (!(price > 0)) return null;
  // divCash is the amount as paid at the time. Divide by every LATER split so old payments are comparable to today's share count.
  const events = [];
  let laterSplits = 1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].divCash > 0) events.push({ t: Date.parse(rows[i].date), a: rows[i].divCash / laterSplits });
    if (rows[i].splitFactor > 0) laterSplits *= rows[i].splitFactor;
  }
  return { price, events, splits: deriveSplits ? deriveSplits(rows) : null };
}

// Pure function so it can be tested without network access.
export function summarize({ price, events }, now = Date.now()) {
  events = [...events].sort((a, b) => a.t - b.t);
  const yearAgo = now - 365 * 864e5;
  const ttm = events.filter((e) => e.t > yearAgo);
  const out = { p: round(price, 2) };
  if (!ttm.length) return { ...out, d: 0 };
  const count = ttm.length;
  const freq = count >= 10 ? 12 : count >= 3 ? 4 : count === 2 ? 2 : 1;
  const last = ttm[ttm.length - 1];
  const month = new Date(last.t).getUTCMonth() + 1;
  out.d = round(ttm.reduce((s, e) => s + e.a, 0), 4);
  out.per = round(last.a, 4);
  out.s = freq === 4 ? `Q${((month - 1) % 3) + 1}` : SCHEDULES[freq];
  out.last = new Date(last.t).toISOString().slice(0, 10);
  out.hist = events.slice(-8).map((e) => ({ d: new Date(e.t).toISOString().slice(0, 10), a: round(e.a, 4) }));
  // Growth: trailing-12-month dividends vs the same window 3 and 5 years ago.
  const window = (yrs) => events
    .filter((e) => e.t > now - (yrs + 1) * 365 * 864e5 && e.t <= now - yrs * 365 * 864e5)
    .reduce((s, e) => s + e.a, 0);
  for (const yrs of [3, 5]) {
    const old = window(yrs);
    if (old > 0 && events[0].t <= now - yrs * 365 * 864e5) out[`g${yrs}`] = round((out.d / old) ** (1 / yrs) - 1, 4);
  }
  return out;
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

