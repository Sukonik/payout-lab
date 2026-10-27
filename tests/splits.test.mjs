import test from "node:test";
import assert from "node:assert/strict";
import { fromTiingo, fromYahoo, summarize } from "../scripts/update-data.mjs";
import { sanitizeEntry } from "../js/core/market.js";
import { splitLabel } from "../js/ui/explore.js";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const rows = [
  { date: "2024-06-07", close: 1200, divCash: 0, splitFactor: 1 },
  { date: "2024-06-10", close: 120, divCash: 0, splitFactor: 10 },
  { date: "2026-03-02", close: 100, divCash: 0.5, splitFactor: 1 },
  { date: "2026-10-12", close: 90, divCash: 0, splitFactor: 1 },
];

test("Tiingo splits are logged, and ordinary days are not", () => {
  const r = fromTiingo(rows);
  assert.deepEqual(r.splits, [{ t: Date.parse("2024-06-10"), f: 10 }]);
});

test("Yahoo splits become a factor of shares after per share before", () => {
  const r = fromYahoo({ chart: { result: [{ meta: { regularMarketPrice: 50 }, events: { splits: { a: { date: 1718000000, numerator: 10, denominator: 1 }, b: { date: 1760000000, numerator: 1, denominator: 8 } } } }] } });
  assert.deepEqual(r.splits.map((x) => x.f), [10, 0.125]);
});

test("summarize keeps the split log, even for a ticker with no dividend", () => {
  const withDiv = summarize(fromTiingo(rows), NOW);
  assert.deepEqual(withDiv.sp, [{ d: "2024-06-10", f: 10 }]);
  const noDiv = summarize({ price: 5, events: [], splits: [{ t: Date.parse("2025-01-02"), f: 0.125 }] }, NOW);
  assert.equal(noDiv.d, 0);
  assert.deepEqual(noDiv.sp, [{ d: "2025-01-02", f: 0.125 }]);
  assert.equal("sp" in summarize({ price: 5, events: [] }, NOW), false, "no splits means no field");
});

test("a bad split entry in data.json is dropped", () => {
  const good = { n: "G", p: 10, d: 1, s: "Q1", q: true };
  const e = sanitizeEntry("GOOD", { ...good, sp: [{ d: "2024-06-10", f: 10 }, { d: "nope", f: 2 }, { d: "2024-01-01", f: 1 }, { d: "2024-01-02", f: -3 }, null] });
  assert.deepEqual(e.sp, [{ d: "2024-06-10", f: 10 }]);
  assert.equal("sp" in sanitizeEntry("GOOD", { ...good, sp: [] }), false);
});

test("split labels are plain English", () => {
  assert.equal(splitLabel(10), "10-for-1 split");
  assert.equal(splitLabel(0.125), "1-for-8 reverse split");
});
