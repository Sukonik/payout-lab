import test from "node:test";
import assert from "node:assert/strict";
import { fromTiingo, fromYahoo, summarize, yahooChartUrl } from "../js/core/quotes.js";

const sec = (iso) => Math.floor(Date.parse(iso) / 1000);
const chart = (extra = {}) => ({ chart: { result: [{ meta: { regularMarketPrice: 100.456 }, ...extra }] } });

test("a Yahoo chart gives price, dividends and splits from one answer", () => {
  const r = fromYahoo(chart({ events: { dividends: { a: { date: sec("2026-08-10"), amount: 0.27 }, b: { date: sec("2026-05-12"), amount: 0.26 } }, splits: { c: { date: sec("2022-07-18"), numerator: 20, denominator: 1, splitRatio: "20:1" } } } }));
  assert.equal(r.price, 100.456); assert.equal(r.events.length, 2);
  assert.deepEqual(r.splits, [{ d: "2022-07-18", a: 20, b: 1, src: "Yahoo Finance" }]);
});

test("splits are null when the answer says nothing about events, an empty list when it says there are none", () => {
  assert.equal(fromYahoo(chart()).splits, null, "unknown: callers must not wipe history");
  assert.deepEqual(fromYahoo(chart({ events: { dividends: {} } })).splits, []);
});

test("reverse splits and rubbish in the feed", () => {
  const r = fromYahoo(chart({ events: { splits: { a: { date: sec("2025-09-02"), numerator: 1, denominator: 10 }, b: { date: sec("2020-01-01"), numerator: 3, denominator: 3 }, c: { date: sec("2020-02-01"), numerator: "x", denominator: 1 }, d: { date: sec("2020-03-01"), numerator: 2.5, denominator: 1 } } } }));
  assert.deepEqual(r.splits.map((s) => [s.a, s.b]), [[1, 10]]);
  assert.equal(fromYahoo({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }), null);
  assert.equal(fromYahoo(null), null); assert.equal(fromYahoo({ chart: { error: { code: "Not Found" }, result: null } }), null);
  assert.equal(fromYahoo(chart({ events: { dividends: { z: { date: sec("2026-01-01"), amount: -1 } } } })).events.length, 0, "non-positive dividends dropped");
});

test("the chart address asks for dividends and splits together and escapes the ticker", () => {
  const u = yahooChartUrl("BRK-B"); assert.match(u, /^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/BRK-B\?/); assert.match(u, /events=div%2Csplits/);
  assert.ok(!yahooChartUrl("A/B?x").includes("A/B?x"));
});

test("summarize still turns dividend events into the same shape as before", () => {
  const now = Date.parse("2026-11-12T00:00:00Z");
  const events = [["2025-12-10", 0.25], ["2026-03-10", 0.25], ["2026-06-10", 0.27], ["2026-09-10", 0.27]].map(([d, a]) => ({ t: Date.parse(d), a }));
  const s = summarize({ price: 100, events }, now);
  assert.equal(s.d, 1.04); assert.equal(s.per, 0.27); assert.equal(s.s, "Q3"); assert.equal(s.last, "2026-09-10");
  assert.deepEqual(summarize({ price: 5, events: [] }, now), { p: 5, d: 0 });
});

test("Tiingo rows still parse and can derive splits through the callback", () => {
  const rows = [{ date: "2026-01-02", close: 10, divCash: 0 }, { date: "2026-02-02", close: 5, divCash: 0.1, splitFactor: 2 }];
  const r = fromTiingo(rows, (x) => [{ n: x.length }]);
  assert.equal(r.price, 5); assert.deepEqual(r.splits, [{ n: 2 }]); assert.equal(fromTiingo(rows).splits, null);
});
