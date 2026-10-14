// Refresh the announced-splits list from Nasdaq's public calendar. Needs outbound internet (it runs in the GitHub Action, not in
// every sandbox) and no key. Unofficial endpoint: failures are loud and never overwrite good data. Usage: node scripts/update-upcoming.mjs
import fs from "node:fs";
import { archiveDone, fromNasdaqRows, reconcileUpcoming, sanitizeSplitsFile } from "../js/core/splits.js";

const PAGE = "https://www.nasdaq.com/market-activity/stock-splits";
const URL_ = "https://api.nasdaq.com/api/calendar/splits";
const HEADERS = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36", Accept: "application/json, text/plain, */*" };

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  let rows;
  try {
    const r = await fetch(URL_, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    rows = j?.data?.rows;
    if (!Array.isArray(rows)) throw new Error("unexpected response shape (no data.rows)");
  } catch (e) { console.error(`Nasdaq calendar unavailable: ${e.message}. splits.json left unchanged.`); process.exit(1); }

  const { rows: fetched, dropped } = fromNasdaqRows(rows, today, PAGE);
  console.log(`calendar rows: ${rows.length}, parsed: ${fetched.length}, dropped: ${dropped}`);
  if (rows.length && !fetched.length) { console.error("Every row failed to parse; the response format has probably changed. splits.json left unchanged."); process.exit(1); }

  const raw = JSON.parse(fs.readFileSync("splits.json", "utf8"));
  const file = sanitizeSplitsFile(raw);
  const market = JSON.parse(fs.readFileSync("data.json", "utf8")).tickers;
  file.upcoming = reconcileUpcoming(file.upcoming, fetched, today);
  const moved = archiveDone(file, today, new Set(Object.keys(market)));
  raw.upcoming = file.upcoming;
  raw.upcomingAsOf = today;
  for (const [t, v] of Object.entries(file.tickers)) if (moved.some((m) => m.t === t)) raw.tickers[t] = { ...raw.tickers[t], n: v.n, s: v.s, u: raw.tickers[t]?.u ?? null };
  raw.updated = new Date().toISOString();
  fs.writeFileSync("splits.json", JSON.stringify(raw, null, 1) + "\n");
  console.log(`announced: ${raw.upcoming.length}, moved to history: ${moved.length}`);
}
await main();
