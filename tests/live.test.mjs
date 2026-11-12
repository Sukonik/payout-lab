import test from "node:test";
import assert from "node:assert/strict";
import { LIVE, entryFromLive, fetchLive, liveUrl, looksLikeTicker, normalizeProxy, pullLive } from "../js/core/live.js";
import { sanitizeEntry } from "../js/core/market.js";

const sec = (iso) => Math.floor(Date.parse(iso) / 1000);
const NOW = new Date("2026-11-12T15:00:00Z");
const chart = (o = {}) => ({ chart: { result: [{ meta: { regularMarketPrice: 351.66, longName: "Alphabet Inc.", instrumentType: "EQUITY", currency: "USD" }, events: { dividends: { a: { date: sec("2026-09-08"), amount: 0.21 }, b: { date: sec("2026-06-09"), amount: 0.21 }, c: { date: sec("2026-03-09"), amount: 0.21 }, d: { date: sec("2025-12-08"), amount: 0.21 } }, splits: { s: { date: sec("2022-07-18"), numerator: 20, denominator: 1 } } }, ...o }] } });
const ok = (j) => async () => ({ ok: true, status: 200, json: async () => j });
const status = (n) => async () => ({ ok: false, status: n, json: async () => ({}) });

test("a good answer becomes a market entry that the app's own validator accepts", async () => {
  const r = await fetchLive("googl", { fetchFn: ok(chart()), now: NOW });
  assert.equal(r.ok, true); assert.equal(r.ticker, "GOOGL");
  assert.equal(r.entry.p, 351.66); assert.equal(r.entry.d, 0.84); assert.equal(r.entry.per, 0.21); assert.equal(r.entry.s, "Q3"); assert.equal(r.entry.src, "Yahoo Finance (live)"); assert.equal(r.entry.u, NOW.toISOString());
  assert.equal(r.entry.n, "Alphabet Inc."); assert.equal(r.entry.type, "EQUITY_STANDARD");
  assert.deepEqual(r.splits, [{ d: "2022-07-18", a: 20, b: 1, src: "Yahoo Finance" }]);
  assert.ok(sanitizeEntry("GOOGL", r.entry), "validator accepts it"); assert.equal(sanitizeEntry("GOOGL", r.entry).src, "Yahoo Finance (live)");
});

test("each way a lookup can fail has its own plain reason", async () => {
  const code = async (fetchFn, t = "AAPL") => (await fetchLive(t, { fetchFn })).code;
  assert.equal(await code(status(404)), "not_found"); assert.equal(await code(status(429)), "rate"); assert.equal(await code(status(503)), "http");
  assert.equal(await code(async () => { throw new TypeError("Failed to fetch"); }), "blocked");
  assert.equal(await code(async () => ({ ok: true, status: 200, json: async () => { throw new Error("x"); } })), "bad");
  assert.equal(await code(ok({ chart: { error: { code: "Not Found" }, result: null } })), "not_found");
  assert.equal(await code(ok({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } })), "bad");
  assert.equal(await code(ok(chart({ meta: { regularMarketPrice: 50, currency: "JPY" } }))), "non_usd");
  assert.equal(await code(ok(chart()), "not a ticker!"), "bad_ticker"); assert.equal(await code(ok(chart()), ""), "bad_ticker");
  assert.ok((await fetchLive("AAPL", { fetchFn: status(429) })).message.length > 20);
});

test("the request carries no cookies, no referrer and no custom headers, and only the ticker", async () => {
  let seen;
  await fetchLive("BRK-B", { fetchFn: async (u, o) => { seen = { u, o }; return { ok: false, status: 404 }; } });
  assert.match(seen.u, /\/chart\/BRK-B\?/); assert.equal(seen.o.credentials, "omit"); assert.equal(seen.o.referrerPolicy, "no-referrer"); assert.equal(seen.o.method, "GET"); assert.ok(!("headers" in seen.o), "no custom headers: no CORS preflight");
  assert.ok(!/share|portfolio|holding/i.test(seen.u));
});

test("a request that never answers is cut off", async () => {
  const slow = (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
  const r = await fetchLive("AAPL", { fetchFn: slow, timeoutMs: 30 });
  assert.equal(r.ok, false); assert.equal(r.code, "blocked");
});

test("an optional proxy replaces only the host; unsafe proxy values are ignored", () => {
  assert.match(liveUrl("AAPL"), /^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/AAPL\?/);
  assert.match(liveUrl("AAPL", "https://q.example.workers.dev/"), /^https:\/\/q\.example\.workers\.dev\/v8\/finance\/chart\/AAPL\?/);
  assert.match(liveUrl("AAPL", "https://x.dev/yahoo"), /^https:\/\/x\.dev\/yahoo\/v8\//);
  for (const bad of ["http://insecure.dev", "javascript:alert(1)", "https://x.dev/?a=b", "//x.dev", "https://", " "]) assert.equal(normalizeProxy(bad), "", bad);
  assert.match(liveUrl("AAPL", "http://insecure.dev"), /^https:\/\/query1\./, "an unsafe proxy falls back to the direct address");
});

test("a dividend that disappears from the feed keeps the old one as an estimate, like the refresh job", () => {
  const raw = { price: 10, events: [], splits: [], meta: { name: "X", type: "EQUITY", currency: "USD" } };
  const e = entryFromLive("X", raw, { n: "Old name", p: 9, d: 1.2, per: 0.3, s: "Q2", q: false, type: "ADR_VARIABLE" }, NOW);
  assert.equal(e.d, 1.2); assert.equal(e.est, true); assert.equal(e.q, false, "tax type kept"); assert.equal(e.type, "ADR_VARIABLE"); assert.equal(e.s, "Q2");
  const fresh = entryFromLive("NEW", { ...raw, meta: { name: "New Co", type: "ETF", currency: "USD" } }, null, NOW);
  assert.equal(fresh.d, 0); assert.equal(fresh.type, "ETF_PASS_THROUGH"); assert.equal(fresh.q, true); assert.ok(!fresh.est);
});

test("several tickers: results per ticker, a cap, and no hammering when the browser refuses", async () => {
  const seen = [];
  const r = await pullLive(["AAPL", "aapl", "KO", "ZZZZ"], { fetchFn: async (u) => { seen.push(u); return u.includes("ZZZZ") ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => chart() }; }, now: NOW });
  assert.equal(r.total, 3, "duplicates collapse"); assert.equal(r.ok, 2); assert.equal(r.blocked, false); assert.equal(r.failed.length, 1); assert.equal(r.failed[0].code, "not_found");
  const many = Array.from({ length: 80 }, (_, i) => "T" + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + ((i / 26) | 0)));
  const big = await pullLive(many, { fetchFn: ok(chart()), now: NOW }); assert.equal(big.total, LIVE.maxTickers);
  let calls = 0;
  const blocked = await pullLive(many.slice(0, 30), { fetchFn: async () => { calls++; throw new TypeError("Failed to fetch"); }, now: NOW });
  assert.equal(blocked.blocked, true); assert.ok(calls <= LIVE.concurrency + 2, `stopped early: ${calls} calls`); assert.equal(blocked.results.size, 30, "every ticker still gets a named result");
});

test("progress is reported and ticker-shaped input is recognised", async () => {
  const marks = []; await pullLive(["A", "B", "C"], { fetchFn: ok(chart()), onProgress: (d, t) => marks.push([d, t]), now: NOW });
  assert.deepEqual(marks.at(-1), [3, 3]);
  assert.ok(looksLikeTicker("sndk") && looksLikeTicker("BRK-B") && !looksLikeTicker("Coca-Cola") && !looksLikeTicker("a b") && !looksLikeTicker(""));
});
