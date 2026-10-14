// Refresh stock-split history from Tiingo (needs TIINGO_TOKEN). Same rules as update-data.mjs: a rate limit stops the run,
// nothing falls back silently, and a failed ticker keeps its old entry. Usage: TIINGO_TOKEN=... node scripts/update-splits.mjs
import fs from "node:fs";
import { sanitizeSplitsFile, splitsFromPrices } from "../js/core/splits.js";

const START = "2010-01-01";                     // Tiingo's history is long; older seeded entries are kept as they are
const BATCH = Number(process.env.BATCH) || 45;

// Merge freshly derived splits into one ticker's list: Tiingo is authoritative from START on, earlier entries stay.
export function mergeSplits(existing, derived, start = START) {
  return [...existing.filter((s) => s.d < start), ...derived.filter((s) => s.d >= start)].sort((x, y) => (x.d < y.d ? -1 : 1));
}

async function fetchRows(t, token) {
  const r = await fetch(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(t)}/prices?startDate=${START}`, { headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" } });
  if (!r.ok) { const e = new Error(`Tiingo HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

async function main() {
  const token = process.env.TIINGO_TOKEN;
  if (!token) { console.log("No TIINGO_TOKEN: nothing to do."); return; }
  const market = JSON.parse(fs.readFileSync("data.json", "utf8")).tickers;
  const file = sanitizeSplitsFile(JSON.parse(fs.readFileSync("splits.json", "utf8")));
  const order = Object.keys(market).sort((a, b) => ((file.tickers[a]?.u || "") < (file.tickers[b]?.u || "") ? -1 : 1)).slice(0, BATCH);
  const today = new Date().toISOString().slice(0, 10);
  let ok = 0, failed = 0;
  for (const t of order) {
    try {
      const rows = await fetchRows(t, token);
      if (!Array.isArray(rows) || !rows.length) throw new Error("no rows");
      const prev = file.tickers[t] || { n: market[t].n, s: [], u: null };
      file.tickers[t] = { n: prev.n || market[t].n, s: mergeSplits(prev.s, splitsFromPrices(rows)), u: today };
      ok++;
    } catch (e) {
      failed++; console.warn(`${t}: ${e.message}`);
      if (e.status === 429) { console.warn("Tiingo rate limit hit. Stopping; the rest wait for the next run."); break; }
    }
  }
  // Only tickers that have splits or were checked are stored; hand-kept upcoming entries pass through untouched.
  const raw = JSON.parse(fs.readFileSync("splits.json", "utf8"));
  raw.updated = new Date().toISOString();
  raw.tickers = Object.fromEntries(Object.entries(file.tickers).sort(([x], [y]) => (x < y ? -1 : 1)));
  fs.writeFileSync("splits.json", JSON.stringify(raw, null, 1) + "\n");
  console.log(`splits: ${ok} refreshed, ${failed} failed`);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
