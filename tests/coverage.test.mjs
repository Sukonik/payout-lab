import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickQueue, coverage } from "../scripts/update-data.mjs";

const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
const seed = read("tickers-seed.json").tickers;
const data = read("data.json").tickers;

test("the seed list is well formed", () => {
  for (const [t, v] of Object.entries(seed)) {
    assert.match(t, /^[A-Z]{1,5}(-[A-Z])?$/, t);
    assert.equal(typeof v.n, "string", t);
    assert.ok(v.n.length > 0 && v.n.length <= 120, t);
    assert.ok(["ETF_PASS_THROUGH", "EQUITY_STANDARD", "ADR_VARIABLE"].includes(v.type), t);
  }
});

test("data plus seed covers at least 500 stocks and 400 ETFs", () => {
  const c = coverage(data, seed);
  assert.ok(c.stocks >= 500, `stocks ${c.stocks}`);
  assert.ok(c.etfs >= 400, `etfs ${c.etfs}`);
});

test("a run fetches missing seed tickers first, then the stalest existing ones, never more than the batch", () => {
  const tickers = { OLD: { u: "2026-01-01T00:00:00Z" }, NEWER: { u: "2026-10-01T00:00:00Z" }, NEVER: {} };
  const s = { AAA: { n: "A", type: "EQUITY_STANDARD" }, BBB: { n: "B", type: "ETF_PASS_THROUGH" }, OLD: { n: "O", type: "EQUITY_STANDARD" } };
  const q = pickQueue(tickers, s, 4);
  assert.equal(q.length, 4);
  assert.deepEqual(q.slice(0, 2), ["AAA", "BBB"], "missing seed tickers lead");
  assert.deepEqual(q.slice(2), ["NEVER", "OLD"], "then the stalest, a ticker never refreshed first");
  assert.deepEqual(pickQueue(tickers, {}, 2), ["NEVER", "OLD"], "no seed: same as before");
  assert.equal(pickQueue(tickers, s, 1).length, 1);
});

test("coverage counts ETFs and stocks separately", () => {
  const c = coverage({ A: { type: "ETF_PASS_THROUGH" }, B: { type: "EQUITY_STANDARD" } }, { C: { type: "ETF_PASS_THROUGH" }, B: { type: "EQUITY_STANDARD" } });
  assert.deepEqual(c, { stocks: 1, etfs: 2 });
});
