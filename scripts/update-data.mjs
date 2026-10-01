// Refreshes data.json with real prices and dividends. No API key needed.
// Source: Yahoo Finance public chart endpoint. Run: node scripts/update-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../data.json", import.meta.url);
const SCHEDULES = { 12: "M", 2: "S", 1: "A" };

// Provider adapters: each returns { price, events: [{ t: ms, a: amount }] } or null.
export function fromYahoo(chart) {
  const r = chart?.chart?.result?.[0];
  const price = r?.meta?.regularMarketPrice;
  if (!r || !(price > 0)) return null;
  const events = Object.values(r.events?.dividends ?? {}).map((e) => ({ t: e.date * 1000, a: e.amount }));
  return { price, events };
}

// Tiingo daily prices: [{ date, close, divCash, ... }] in date order. divCash is the cash dividend on its ex-date.
export function fromTiingo(rows) {
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
  return { price, events };
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

const TIINGO_TOKEN = process.env.TIINGO_TOKEN;
// Tiingo's free plan allows ~50 symbols/hour, so each run refreshes only the stalest tickers.
const BATCH = Number(process.env.BATCH) || 45;

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchTiingo(t) {
  const start = new Date(Date.now() - 7 * 365 * 864e5).toISOString().slice(0, 10);
  const rows = await getJson(
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(t)}/prices?startDate=${start}`,
    { Authorization: `Token ${TIINGO_TOKEN}`, "Content-Type": "application/json" }
  );
  return fromTiingo(rows);
}

async function fetchYahoo(t) {
  const chart = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=7y&interval=1mo&events=div`,
    { "User-Agent": "Mozilla/5.0 (payout-lab data refresh)" }
  );
  return fromYahoo(chart);
}

async function main() {
  const db = JSON.parse(readFileSync(FILE, "utf8"));
  const used = {};
  let ok = 0;
  const queue = Object.keys(db.tickers)
    .sort((a, b) => (db.tickers[a].u || "").localeCompare(db.tickers[b].u || ""))
    .slice(0, BATCH);
  console.log(`Refreshing ${queue.length} of ${Object.keys(db.tickers).length} tickers (stalest first)`);
  for (const t of queue) {
    const attempts = [...(TIINGO_TOKEN ? [["Tiingo", fetchTiingo]] : []), ["Yahoo Finance", fetchYahoo]];
    for (const [name, fetcher] of attempts) {
      try {
        const raw = await fetcher(t);
        if (!raw) throw new Error("no data");
        const sum = summarize(raw);
        // A price with no dividends usually means this provider lacks dividend data for the ticker; try the next one.
        if (!(sum.d > 0) && name !== attempts[attempts.length - 1][0]) throw new Error("no dividends reported");
        const old = db.tickers[t];
        if (!(sum.d > 0) && old.d > 0) {
          // Nobody reports dividends for a ticker we believe pays one: refresh the price only and flag the rest as an estimate.
          Object.assign(old, { p: sum.p, est: true, src: name, u: new Date().toISOString() });
          console.warn(`${t}: no dividend data from any provider, kept old dividend as estimate`);
          ok++;
          break;
        }
        for (const k of ["per", "last", "hist", "g3", "g5", "est"]) delete old[k];
        Object.assign(old, sum, { src: name, u: new Date().toISOString() });
        if (!old.s) old.s = "Q3";
        used[name] = (used[name] || 0) + 1;
        ok++;
        break;
      } catch (e) {
        console.warn(`${t}: ${name} failed (${e.message})`);
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (ok === 0) throw new Error("No ticker refreshed; leaving data.json untouched");
  db.updated = new Date().toISOString();
  db.source = Object.keys(used).join(" + ");
  console.log("Sources used:", used);
  writeFileSync(FILE, JSON.stringify(db, null, 1) + "\n");
  console.log(`Refreshed ${ok}/${Object.keys(db.tickers).length} tickers`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
