import test from "node:test";
import assert from "node:assert/strict";
import { buildReceipt, compareReceipts, addReceipt, historyIsFull, serializeReceipt, parseReceiptText, receiptCalc } from "../js/core/receipt.js";
import { newPacket, parsePacketText, serializePacket, LIMITS, validateReceipt } from "../js/core/packet.js";
import { holdingFromMarket } from "../js/core/market.js";
import { totals, calendar } from "../js/core/calc.js";
import { buildRefreshPlan, applyRefreshPlan } from "../js/core/refresh.js";

const NOW = "2026-10-13T12:00:00.000Z";
const e = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: "2026-10-12T22:00:00Z", per: 1, ...o });
function packet(extra = {}) {
  const p = newPacket({ name: "Test", now: NOW });
  p.holdings.push(holdingFromMarket("AAA", 100, e({ p: 50, d: 2 })), holdingFromMarket("BBB", 40, e({ p: 120, d: 6, s: "M" })));
  p.settings = { ...p.settings, target: 1500, contrib: 200, growth: 5, slow: 1, ...extra };
  return p;
}
const snap = (p, now = NOW) => buildReceipt(p, { label: "x", now });
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
const clone = (p) => JSON.parse(JSON.stringify(p));

test("a receipt freezes values, sources, dates, assumptions, outputs and the formula version", () => {
  const p = packet();
  const r = snap(p);
  const hs = receiptCalc(r), T = totals(hs);
  assert.equal(r.formulaVersion, "calc-1");
  assert.equal(r.originRevisionId, p.revisionId);
  near(r.outputs.income, T.income, "income"); near(r.outputs.value, T.value, "value");
  assert.deepEqual(r.outputs.monthly, calendar(hs));
  assert.equal(r.holdings[0].provenance.price.src, "tiingo");
  assert.equal(r.dataAsOf.newest, "2026-10-12");
  assert.deepEqual(r.dataAsOf.sources, ["tiingo"]);
  assert.equal(r.assumptions.target, 1500);
  assert.doesNotThrow(() => validateReceipt(JSON.parse(JSON.stringify(r)), 0));
});

test("a receipt survives the packet round trip exactly", () => {
  const p = packet(); p.snapshots.push(snap(p));
  const back = parsePacketText(serializePacket(p));
  assert.equal(back.ok, true, JSON.stringify(back.error));
  assert.deepEqual(back.packet.snapshots, p.snapshots);
});

test("comparing a receipt with itself gives zero change everywhere", () => {
  const r = snap(packet());
  const c = compareReceipts(r, r);
  assert.equal(c.unchanged, true);
  for (const k of ["income", "monthlyAvg", "value", "yield"]) assert.equal(c.headline[k].delta, 0, k);
  assert.deepEqual([c.income.holdings, c.income.market, c.income.overlap, c.income.total], [0, 0, 0, 0]);
  assert.ok(c.holdings.every((h) => h.status === "same"));
  assert.deepEqual(c.assumptions, []);
  assert.ok(c.goal.steps.every((s) => s.from === s.to));
  assert.ok(c.months.every((m) => m.delta === 0));
});

function assertSums(c) {
  near(c.income.holdings + c.income.market + c.income.overlap, c.headline.income.delta, "income split adds up");
  near(c.value.holdings + c.value.market + c.value.overlap, c.headline.value.delta, "value split adds up");
  if (c.goal.steps) assert.equal(c.goal.steps.reduce((s, x) => s + (x.to - x.from), 0), c.goal.to - c.goal.from, "goal steps add up");
}

test("only shares change: explained entirely by your holdings", () => {
  const p = packet(); const a = snap(p);
  const q = clone(p); q.holdings[0].shares = 160; const b = snap(q, "2026-11-01T00:00:00Z");
  const c = compareReceipts(a, b);
  assertSums(c);
  near(c.income.holdings, 60 * 2, "60 more shares at the old dividend of 2");
  assert.equal(c.income.market, 0); assert.equal(c.income.overlap, 0);
  near(c.value.holdings, 60 * 50, "60 shares at the old price"); assert.equal(c.value.market, 0);
  assert.equal(c.holdings.find((h) => h.ticker === "AAA").status, "changed");
  assert.deepEqual(c.holdings.find((h) => h.ticker === "AAA").shares, [100, 160]);
  assert.ok(c.goal.steps[0].from !== c.goal.steps[0].to || c.goal.from === c.goal.to);
  assert.equal(c.goal.steps[1].from, c.goal.steps[1].to); assert.equal(c.goal.steps[2].from, c.goal.steps[2].to);
});

test("only a dividend observation changes: explained entirely by market data", () => {
  const p = packet(); const a = snap(p);
  const q = clone(p); q.holdings[1].fields.dividend.v = 7.5; const b = snap(q);
  const c = compareReceipts(a, b);
  assertSums(c);
  near(c.income.market, 40 * 1.5, "40 shares x +1.50"); assert.equal(c.income.holdings, 0); assert.equal(c.income.overlap, 0);
  assert.equal(c.value.market, 0);
  assert.equal(c.holdings.find((h) => h.ticker === "BBB").dividend[1], 7.5);
});

test("only a price changes: income is untouched and value moves through market data", () => {
  const p = packet(); const a = snap(p);
  const q = clone(p); q.holdings[0].fields.price.v = 65; const b = snap(q);
  const c = compareReceipts(a, b);
  assertSums(c);
  assert.equal(c.headline.income.delta, 0);
  near(c.value.market, 100 * 15, "100 shares x +15"); assert.equal(c.value.holdings, 0);
  assert.ok(c.headline.yield.delta < 0, "same income on a higher value lowers the yield");
});

test("only a goal assumption changes: no holdings or market effect, the goal moves, and the step says why", () => {
  const p = packet(); const a = snap(p);
  const q = clone(p); q.settings.target = 3000; q.settings.growth = 8; const b = snap(q);
  const c = compareReceipts(a, b);
  assertSums(c);
  assert.equal(c.headline.income.delta, 0); assert.equal(c.headline.value.delta, 0);
  assert.deepEqual(c.assumptions.map((x) => x.key).sort(), ["growth", "target"]);
  assert.ok(c.goal.steps && c.goal.steps[2].to !== c.goal.steps[2].from, "assumptions step carries the change");
  assert.equal(c.goal.steps[0].from, c.goal.steps[0].to); assert.equal(c.goal.steps[1].from, c.goal.steps[1].to);
});

test("shares and dividend both change: the overlap is shown separately and nothing is double counted", () => {
  const p = packet(); const a = snap(p);
  const q = clone(p); q.holdings[0].shares = 150; q.holdings[0].fields.dividend.v = 3; const b = snap(q);
  const c = compareReceipts(a, b);
  assertSums(c);
  near(c.income.holdings, 50 * 2, "extra shares at the old rate");
  near(c.income.market, 100 * 1, "old shares at the new rate");
  near(c.income.overlap, 50 * 1, "the part caused by both");
  near(c.income.total, 150 * 3 - 100 * 2, "total change");
});

test("added and removed holdings are holdings changes", () => {
  const p = packet(); const a = snap(p);
  const q = clone(p); q.holdings.shift(); q.holdings.push(holdingFromMarket("CCC", 10, e({ p: 30, d: 1.5 }))); const b = snap(q);
  const c = compareReceipts(a, b);
  assertSums(c);
  assert.deepEqual(c.holdings.map((h) => [h.ticker, h.status]), [["AAA", "removed"], ["BBB", "same"], ["CCC", "added"]]);
  near(c.income.holdings, 10 * 1.5 - 100 * 2, "new holding in, old one out");
  assert.equal(c.income.market, 0);
});

test("a goal that is out of reach in one version is reported without false precision", () => {
  const p = packet({ target: 1e6, contrib: 0, growth: 0 }); const a = snap(p);
  const q = clone(p); q.settings.target = 500; const b = snap(q);
  const c = compareReceipts(a, b);
  assert.equal(a.outputs.goalMonthsExpected, null);
  assert.equal(c.goal.steps, null);
  assert.match(c.goal.note, /within 50 years/);
});

test("separate portfolios and different formula versions are flagged, not hidden", () => {
  const a = snap(packet()), b = snap(packet());
  assert.equal(compareReceipts(a, b).samePortfolio, false);
  const old = { ...a, formulaVersion: "calc-0" };
  const c = compareReceipts(old, a);
  assert.equal(c.formulaMatch, false);
  assert.deepEqual(c.formulas, ["calc-0", "calc-1"]);
  assert.equal(compareReceipts(a, a).samePortfolio, true);
});

test("a data refresh never changes a saved receipt", () => {
  const p = packet(); const r = snap(p); p.snapshots.push(r);
  const before = JSON.stringify(r);
  const market = { AAA: e({ p: 99, d: 5, u: "2026-10-20T00:00:00Z" }), BBB: e({ p: 200, d: 9, s: "M", u: "2026-10-20T00:00:00Z" }) };
  const plan = buildRefreshPlan(p, market, { now: Date.parse("2026-10-21T00:00:00Z") });
  applyRefreshPlan(p, plan, plan.rows.flatMap((x) => x.changes.map((c) => c.key)), market);
  assert.equal(JSON.stringify(p.snapshots[0]), before);
  assert.notEqual(snap(p).outputs.income, r.outputs.income, "today's portfolio did change");
  // and comparing the old receipt with today explains the move
  const c = compareReceipts(p.snapshots[0], snap(p));
  assertSums(c);
  assert.ok(c.income.market > 0);
});

test("history: duplicates are ignored, a full history is never trimmed silently, trimming drops the oldest", () => {
  const p = packet();
  const r = snap(p, "2026-01-01T00:00:00Z");
  assert.equal(addReceipt(p, r).added, true);
  assert.deepEqual(addReceipt(p, r), { added: false, reason: "duplicate" });
  assert.equal(p.snapshots.length, 1);
  for (let i = 1; i < LIMITS.maxSnapshots; i++) addReceipt(p, snap(p, `2026-02-${String(1 + (i % 27)).padStart(2, "0")}T00:00:00Z`));
  assert.equal(p.snapshots.length, LIMITS.maxSnapshots);
  assert.equal(historyIsFull(p), true);
  const extra = snap(p, "2026-09-01T00:00:00Z");
  assert.deepEqual(addReceipt(p, extra), { added: false, reason: "full" });
  assert.equal(p.snapshots.length, LIMITS.maxSnapshots, "nothing was dropped");
  const res = addReceipt(p, extra, { trimOldest: true });
  assert.equal(res.added, true);
  assert.equal(res.trimmed.id, r.id, "the oldest report went");
  assert.equal(p.snapshots.length, LIMITS.maxSnapshots);
  assert.equal(parsePacketText(serializePacket(p)).ok, true);
  assert.ok(p.snapshots[0].capturedAt >= p.snapshots.at(-1).capturedAt, "newest first");
});

test("report files round trip and reject damage, edits and newer formats", () => {
  const r = snap(packet());
  const ok = parseReceiptText(serializeReceipt(r));
  assert.equal(ok.ok, true); assert.deepEqual(ok.receipt, r); assert.deepEqual(ok.warnings, []);
  const f = JSON.parse(serializeReceipt(r)); f.receipt.outputs.income = 1e6;
  assert.equal(parseReceiptText(JSON.stringify(f)).warnings.length, 1, "an edited file opens with a warning");
  const fut = JSON.parse(serializeReceipt(r)); fut.schemaVersion = 9;
  assert.equal(parseReceiptText(JSON.stringify(fut)).error.code, "future_version");
  for (const bad of ["{", "[]", '{"format":"other"}', JSON.stringify({ format: "payout-receipt", schemaVersion: 1, receipt: { id: "x" } }), null]) assert.equal(parseReceiptText(bad).ok, false, String(bad));
  const neg = JSON.parse(serializeReceipt(r)); delete neg.checksum; neg.receipt.holdings[0].shares = -1;
  assert.equal(parseReceiptText(JSON.stringify(neg)).ok, false);
  assert.equal(parseReceiptText("x".repeat(2 * 1024 * 1024)).error.code, "too_large");
});

test("the printable report is self-contained: no scripts, links, images, fonts or remote requests, and everything is escaped", async () => {
  const { receiptReportHtml, comparisonReportHtml } = await import("../js/core/report.js");
  const p = packet(); p.holdings[0].name = '<img src=x onerror="alert(1)"> & Co'; p.portfolioName = "</title><script>alert(1)</script>";
  const r = buildReceipt(p, { label: '"><svg onload=alert(1)>', now: NOW });
  const html = receiptReportHtml(r);
  assert.doesNotMatch(html, /<(script|link|img|iframe|svg|object|embed|base|form)\b|@import|url\(|https?:\/\//i, "no live tags, imports or remote URLs");
  assert.match(html, /&lt;svg onload=alert\(1\)&gt;/, "hostile text is shown as text, not run");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /Formula version calc-1/);
  assert.match(html, /Months follow ex-dividend dates/);
  const c = compareReceipts(r, buildReceipt(p, { now: "2026-11-01T00:00:00Z" }));
  const ch = comparisonReportHtml(c, r, r, "A <b>", "B");
  assert.doesNotMatch(ch, /<(script|link|img|iframe)\b|https?:\/\//i);
  assert.match(ch, /A &lt;b&gt;/);
  assert.match(ch, /always add up to the total/);
});
