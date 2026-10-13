import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment, buildFragment, VIEWS } from "../js/core/route.js";
import { calendar, calendarDetail } from "../js/core/calc.js";

test("each view round-trips", () => {
  for (const v of VIEWS) assert.deepEqual(parseFragment(buildFragment(v)), { view: v, params: {}, valid: true, explicit: true });
});

test("empty hash is the overview, unknown routes recover to it and are flagged", () => {
  assert.deepEqual(parseFragment(""), { view: "overview", params: {}, valid: true, explicit: false });
  assert.deepEqual(parseFragment("#"), { view: "overview", params: {}, valid: true, explicit: false });
  for (const bad of ["#/nope", "#/Overview", "#overview", "#/lab/extra", "#/<script>", "#/%00", "#//", "#/lab?"]) {
    const r = parseFragment(bad);
    if (bad === "#/lab?") assert.equal(r.view, "lab"); else { assert.equal(r.view, "overview", bad); assert.equal(r.valid, false, bad); }
  }
});

test("params are validated; hostile keys and values are dropped", () => {
  const r = parseFragment("#/portfolio?p=pf_abc123&v=1&__proto__=x&bad key=1&x=%3Cscript%3E&long=" + "a".repeat(100));
  assert.equal(r.view, "portfolio");
  assert.deepEqual(r.params, { p: "pf_abc123", v: "1" });
  assert.equal(({}).x, undefined);
  assert.equal(buildFragment("lab", { p: "pf_abc", bad: "<x>", "BAD": "1" }), "#/lab?p=pf_abc");
  assert.equal(buildFragment("nope"), "#/overview");
});

test("calendar detail agrees with the calendar and names each payer", () => {
  const hs = [{ t: "A", shares: 100, price: 50, div: 2, s: "Q3", q: true }, { t: "B", shares: 10, price: 100, div: 12, s: "M", q: false }, { t: "Z", shares: 5, price: 10, div: 0, s: "Q1", q: true }];
  const d = calendarDetail(hs), m = calendar(hs);
  d.forEach((list, i) => assert.ok(Math.abs(list.reduce((s, x) => s + x.amount, 0) - m[i]) < 1e-9));
  assert.deepEqual(d[2].map((x) => x.t), ["A", "B"], "sorted by amount, non-payers omitted");
  assert.deepEqual(d[0].map((x) => x.t), ["B"]);
});
