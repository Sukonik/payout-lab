// Refreshes data.json with real prices and dividends. No API key needed.
// Source: Yahoo Finance public chart endpoint. Run: node scripts/update-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../data.json", import.meta.url);
const SCHEDULES = { 12: "M", 2: "S", 1: "A" };

// Pure function so it can be tested without network access.
export function summarize(chart, now = Date.now()) {
  const r = chart?.chart?.result?.[0];
  const price = r?.meta?.regularMarketPrice;
  if (!r || !(price > 0)) return null;
  const events = Object.values(r.events?.dividends ?? {})
    .map((e) => ({ t: e.date * 1000, a: e.amount }))
    .sort((a, b) => a.t - b.t);
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
  return out;
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

async function main() {
  const db = JSON.parse(readFileSync(FILE, "utf8"));
  let ok = 0;
  for (const t of Object.keys(db.tickers)) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=2y&interval=1d&events=div`,
        { headers: { "User-Agent": "Mozilla/5.0 (payout-lab data refresh)" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = summarize(await res.json());
      if (!s) throw new Error("no data");
      Object.assign(db.tickers[t], s);
      ok++;
    } catch (e) {
      console.warn(`${t}: kept old values (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (ok === 0) throw new Error("No ticker refreshed; leaving data.json untouched");
  db.updated = new Date().toISOString();
  db.source = "Yahoo Finance";
  writeFileSync(FILE, JSON.stringify(db, null, 1) + "\n");
  console.log(`Refreshed ${ok}/${Object.keys(db.tickers).length} tickers`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
