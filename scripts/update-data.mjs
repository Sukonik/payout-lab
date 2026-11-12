// Refreshes data.json (and split history in splits.json) from one primary source: Yahoo Finance's public chart endpoint, no key.
// Tiingo (TIINGO_TOKEN) is used only as a fallback when Yahoo gives nothing for a ticker. Run: node scripts/update-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../data.json", import.meta.url);
import { fromTiingo, fromYahoo, summarize, yahooChartUrl } from "../js/core/quotes.js";
import { applyFeedSplits, sanitizeSplitsFile, splitsFromPrices } from "../js/core/splits.js";
export { fromTiingo, fromYahoo, summarize };

const SPLITS_FILE = new URL("../splits.json", import.meta.url);

// Coverage seed: tickers we want in data.json (tickers-seed.json). A seed ticker is added only when a provider returns a real
// price for it, so nothing is ever published with made-up numbers. Names in the seed are labels.
const SEED_FILE = new URL("../tickers-seed.json", import.meta.url);
const SEED_SHARE = 0.2;  // at most this share of a run goes to tickers not in data.json yet; the rest keeps existing ones fresh
const SEED_CAP = 60;     // and never more than this many new tickers in one run

// Pure function: which tickers this run should fetch. The stalest existing ones lead (a ticker never refreshed counts as oldest),
// with a bounded share left for new seed tickers so adding coverage can never starve freshness.
export function pickQueue(tickers, seed, batch) {
  const missing = Object.keys(seed).filter((t) => !tickers[t]).sort();
  const take = Math.min(missing.length, SEED_CAP, Math.max(0, Math.round(batch * SEED_SHARE)));
  const stale = Object.keys(tickers)
    .sort((a, b) => (tickers[a].u || "").localeCompare(tickers[b].u || ""))
    .slice(0, batch - take);
  return [...stale, ...missing.slice(0, take)];
}

// Counts used by the coverage report and test.
export function coverage(tickers, seed = {}) {
  const all = { ...Object.fromEntries(Object.entries(seed).map(([t, v]) => [t, { type: v.type }])), ...tickers };
  const etfs = Object.values(all).filter((v) => v.type === "ETF_PASS_THROUGH").length;
  return { stocks: Object.keys(all).length - etfs, etfs };
}

const TIINGO_TOKEN = process.env.TIINGO_TOKEN;
// Yahoo has no published per-hour cap for this endpoint, so a run refreshes a few hundred tickers, oldest first, politely spaced.
const BATCH = Number(process.env.BATCH) || 300;
const DELAY_MS = Number(process.env.DELAY_MS ?? 300);
const UA = { "User-Agent": "Mozilla/5.0 (payout-lab data refresh)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

async function fetchYahoo(t) {
  for (let attempt = 0; ; attempt++) {
    try { return fromYahoo(await getJson(yahooChartUrl(t), UA)); }
    catch (e) {
      if (e.status === 429 && attempt === 0) { await sleep(20000); continue; }   // one polite retry, then report it
      throw e;
    }
  }
}

async function fetchTiingo(t) {
  const start = new Date(Date.now() - 15 * 365 * 864e5).toISOString().slice(0, 10);
  const rows = await getJson(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(t)}/prices?startDate=${start}`, { Authorization: `Token ${TIINGO_TOKEN}`, "Content-Type": "application/json" });
  return fromTiingo(rows, (r) => splitsFromPrices(r, "Tiingo"));
}

// One primary source, one fallback. Values from the two are never mixed inside one ticker's record.
export const providerOrder = (hasToken) => [["Yahoo Finance", fetchYahoo], ...(hasToken ? [["Tiingo", fetchTiingo]] : [])];

async function main() {
  const db = JSON.parse(readFileSync(FILE, "utf8"));
  let seed = {};
  try { seed = JSON.parse(readFileSync(SEED_FILE, "utf8")).tickers ?? {}; } catch { console.warn("No tickers-seed.json; refreshing existing tickers only"); }
  const rawSplits = JSON.parse(readFileSync(SPLITS_FILE, "utf8"));
  const splits = sanitizeSplitsFile(rawSplits);
  const used = {}, today = new Date().toISOString().slice(0, 10);
  let ok = 0, added = 0, splitChanges = 0, failures = 0, consecutive = 0;
  const queue = pickQueue(db.tickers, seed, BATCH);
  console.log(`Refreshing ${queue.length} tickers (${queue.filter((t) => !db.tickers[t]).length} new from the seed list, rest stalest first); data.json has ${Object.keys(db.tickers).length}`);
  for (const t of queue) {
    if (consecutive >= 8) { console.warn("Eight failures in a row: the provider is probably limiting us. Stopping; the rest wait for the next run."); break; }
    let done = false;
    for (const [name, fetcher] of providerOrder(!!TIINGO_TOKEN)) {
      try {
        const raw = await fetcher(t);
        if (!raw) throw new Error("no price");
        const sum = summarize(raw);
        const isNew = !db.tickers[t];
        const old = db.tickers[t] ?? { n: seed[t]?.n ?? t, type: seed[t]?.type, p: sum.p, d: 0, q: true };
        if (!(sum.d > 0) && old.d > 0) {
          // The feed reports no dividends for a ticker we believed paid one: refresh the price only and flag the rest as an estimate.
          Object.assign(old, { p: sum.p, est: true, src: name, u: new Date().toISOString() });
          console.warn(`${t}: no dividend in the last 12 months from ${name}, kept the old dividend as an estimate`);
        } else {
          for (const k of ["per", "last", "hist", "g3", "g5", "est"]) delete old[k];
          Object.assign(old, sum, { src: name, u: new Date().toISOString() });
        }
        if (!old.s) old.s = "Q3";
        if (isNew) { db.tickers[t] = old; added++; }
        if (applyFeedSplits(splits, t, old.n, raw.splits, today)) splitChanges++;
        used[name] = (used[name] || 0) + 1; ok++; done = true; consecutive = 0;
        break;
      } catch (e) { console.warn(`${t}: ${name} failed (${e.message})`); }
    }
    if (!done) { failures++; consecutive++; }
    await sleep(DELAY_MS);
  }
  if (ok === 0) { console.warn("No ticker refreshed; leaving the data files untouched"); process.exitCode = 1; return; }
  db.updated = new Date().toISOString();
  db.source = Object.keys(used).join(" + ");
  console.log("Sources used:", used, `failures: ${failures}, split histories changed: ${splitChanges}`);
  writeFileSync(FILE, JSON.stringify(db, null, 1) + "\n");
  rawSplits.tickers = Object.fromEntries(Object.entries(splits.tickers).sort(([x], [y]) => (x < y ? -1 : 1)));
  rawSplits.updated = new Date().toISOString();
  writeFileSync(SPLITS_FILE, JSON.stringify(rawSplits, null, 1) + "\n");
  console.log(`Refreshed ${ok} tickers, ${added} added from the seed list; data.json now has ${Object.keys(db.tickers).length}`);
  const c = coverage(db.tickers, seed);
  console.log(`Coverage: ${c.stocks} stocks and ${c.etfs} ETFs (including seed tickers not fetched yet)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
