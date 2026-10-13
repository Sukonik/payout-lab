import test from "node:test";
import assert from "node:assert/strict";
import { totals, calendar, simulate, path, dur, when, shift, taxSummary, SCHED, perPay, inc } from "../js/core/calc.js";

const hs = [
  { t: "A", shares: 100, price: 50, div: 2, s: "Q3", q: true },
  { t: "B", shares: 10, price: 100, div: 12, s: "M", q: false },
];

test("totals, per-payment and income", () => {
  const T = totals(hs);
  assert.equal(T.value, 6000);
  assert.equal(T.income, 320);
  assert.ok(Math.abs(T.yield - 320 / 6000) < 1e-12);
  assert.equal(inc(hs[0]), 200);
  assert.equal(perPay(hs[0]), 0.5);
  assert.equal(perPay({ div: 12, s: "unknown" }), 3, "unknown schedules fall back to quarterly, as in V1");
});

test("calendar spreads each holding over its pay months and sums to yearly income", () => {
  const m = calendar(hs);
  assert.equal(m.length, 12);
  assert.ok(Math.abs(m.reduce((a, b) => a + b, 0) - 320) < 1e-9);
  assert.equal(m[0], 10);               // monthly payer only
  assert.equal(m[2], 60);               // Mar: 50 from A + 10 from B
  assert.deepEqual(SCHED.S, [6, 12]);
});

test("goal projection: already there, reachable, unreachable", () => {
  assert.equal(simulate(24000, 0.05, 1000, 0, 0, false), 0);
  const k = simulate(6000, 0.05, 1000, 500, 6, true);
  assert.ok(Number.isInteger(k) && k > 0 && k < 600);
  assert.equal(simulate(0, 0, 1000, 0, 0, false), null);
  const p = path(6000, 0.05, 500, 6, true, 24);
  assert.equal(p.length, 25);
  assert.ok(p[24] > p[0]);
  assert.ok(Math.abs(p[0] - 500) < 1e-12);
});

test("wording helpers", () => {
  assert.equal(dur(null), "50+ years");
  assert.equal(dur(0), "Already there");
  assert.equal(dur(14), "1 yr 2 mos");
  assert.equal(shift(10, 10), "No change");
  assert.equal(shift(10, 22), "1 yr later");
  assert.equal(shift(22, 10), "1 yr sooner");
  assert.equal(shift(null, null), "Both beyond 50 years");
  assert.equal(shift(5, null), "Pushes goal past 50 years");
  assert.equal(when(0, new Date(2026, 9, 13)), "Oct 2026");
  assert.equal(when(3, new Date(2026, 9, 13)), "Jan 2027");
  assert.equal(when(null), "Not within 50 years");
});

test("tax summary splits qualified and ordinary income", () => {
  const T = totals(hs);
  const t = taxSummary(hs, T, { qRate: 15, oRate: 24, stRate: 5 });
  assert.equal(t.q, 200);
  assert.equal(t.o, 120);
  assert.deepEqual(t.ordList, ["B"]);
  assert.ok(Math.abs(t.taxQ - 40) < 1e-9);
  assert.ok(Math.abs(t.taxO - 34.8) < 1e-9);
});
