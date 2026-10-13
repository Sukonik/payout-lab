import test from "node:test";
import assert from "node:assert/strict";
import { buildRefreshPlan, applyRefreshPlan } from "../js/core/refresh.js";
import { dividendHint, holdingFromMarket, indicatedAnnual, manualHolding, marketDividend } from "../js/core/market.js";
import { newPacket } from "../js/core/packet.js";
import { sampleReceipt } from "./helpers.mjs";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const entry = (o) => ({ n: "Test", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: "2026-10-12T22:00:00.000Z", last: "2026-09-23", per: 1, ...o });

function setup(market, mutate) {
  const p = newPacket({ now: "2026-10-01T00:00:00Z" });
  // portfolio built from yesterday-ish data so there is something to refresh
  for (const [t, e] of Object.entries(market)) p.holdings.push(holdingFromMarket(t, 10, e));
  mutate?.(p);
  return p;
}
const plan = (p, market) => buildRefreshPlan(p, market, { now: NOW });
const keys = (pl) => pl.rows.flatMap((r) => r.changes.map((c) => c.key));
const row = (pl, t) => pl.rows.find((r) => r.ticker === t);

test("nothing to do when values already match the latest data", () => {
  const m = { AAA: entry({}) };
  const pl = plan(setup(m), m);
  assert.deepEqual(keys(pl), []);
  assert.equal(row(pl, "AAA").status, "unchanged");
});

test("a changing payout and price are proposed as updates and applied on request", () => {
  const old = { AAA: entry({ p: 100, d: 4, per: 1 }) };
  const p = setup(old);
  const now = { AAA: entry({ p: 112.5, d: 4.4, per: 1.1, u: "2026-10-13T03:00:00.000Z" }) };
  const pl = plan(p, now);
  const r = row(pl, "AAA");
  assert.equal(r.status, "update");
  assert.deepEqual(r.changes.map((c) => [c.field, c.kind, c.from, c.to]), [["price", "update", 100, 112.5], ["dividend", "update", 4, 4.4], ["schedule", "confirm", "Q3", "Q3"]]);
  assert.equal(p.holdings[0].fields.price.v, 100, "planning changes nothing");
  assert.equal(applyRefreshPlan(p, pl, keys(pl), now), 3);
  const f = p.holdings[0].fields;
  assert.equal(f.price.v, 112.5);
  assert.equal(f.price.asOf, "2026-10-13");
  assert.equal(f.dividend.v, 4.4);
  assert.deepEqual(keys(plan(p, now)), [], "applying twice proposes nothing more");
});

test("manual values are protected: shown as a choice, never applied by default", () => {
  const m = { AAA: entry({ p: 100 }) };
  const p = setup(m, (pk) => { const f = pk.holdings[0].fields.price; f.v = 95; f.src = "user"; f.manual = true; });
  const now = { AAA: entry({ p: 110, u: "2026-10-13T03:00:00.000Z" }) };
  const pl = plan(p, now);
  const c = row(pl, "AAA").changes.find((x) => x.field === "price");
  assert.equal(c.kind, "protected");
  assert.equal(c.defaultOn, false);
  assert.equal(c.from, 95);
  const defaults = pl.rows.flatMap((r) => r.changes).filter((x) => x.defaultOn).map((x) => x.key);
  applyRefreshPlan(p, pl, defaults, now);
  assert.equal(p.holdings[0].fields.price.v, 95, "still yours");
  assert.equal(p.holdings[0].fields.price.manual, true);
  applyRefreshPlan(p, pl, [c.key], now);
  assert.equal(p.holdings[0].fields.price.v, 110);
  assert.equal(p.holdings[0].fields.price.manual, false, "choosing the provider value clears the protection");
  assert.equal(p.holdings[0].fields.price.src, "tiingo");
});

test("a stale ticker is flagged even when other tickers are fresh", () => {
  const m = { OLD: entry({ u: "2026-09-01T22:00:00.000Z" }), NEW: entry({ u: "2026-10-12T22:00:00.000Z" }) };
  const pl = plan(setup(m), m);
  assert.equal(row(pl, "OLD").obs.stale, true);
  assert.equal(row(pl, "OLD").obs.ageDays, 42);
  assert.match(row(pl, "OLD").notes[0], /42 days old/);
  assert.equal(row(pl, "NEW").obs.stale, false);
  assert.equal(pl.counts.staleAtProvider, 1);
});

test("a ticker that disappears from the data keeps its values and says so", () => {
  const m = { AAA: entry({}), BBB: entry({}) };
  const p = setup(m);
  const pl = plan(p, { AAA: m.AAA });
  assert.equal(row(pl, "BBB").status, "missing");
  assert.match(row(pl, "BBB").notes[0], /left as they are/);
  assert.equal(pl.counts.missing, 1);
  applyRefreshPlan(p, pl, keys(pl), { AAA: m.AAA });
  assert.equal(p.holdings[1].fields.price.v, 100);
});

test("a purely manual holding with no provider data is silent, not 'missing'", () => {
  const p = newPacket({ now: "2026-10-01T00:00:00Z" });
  p.holdings.push(manualHolding("XYZ", 5));
  const pl = plan(p, {});
  assert.equal(row(pl, "XYZ").status, "unchanged");
  assert.deepEqual(row(pl, "XYZ").notes, []);
});

test("trailing and indicated dividends differ when there was a special payment", () => {
  // Quarterly 0.50 plus a 1.00 special: the last 12 months total 3.00, the current rate is 2.00
  const e = entry({ d: 3, per: 0.5, s: "Q3" });
  assert.equal(marketDividend(e, "trailing"), 3);
  assert.equal(indicatedAnnual(e), 2);
  assert.equal(marketDividend(e, "indicated"), 2);
  assert.match(dividendHint(e), /special or extra payment/);
  const p = setup({ AAA: e });
  p.settings.dividendBasis = "indicated";
  const pl = plan(p, { AAA: e });
  const c = row(pl, "AAA").changes.find((x) => x.field === "dividend");
  assert.equal(c.kind, "update");
  assert.equal(c.to, 2);
  assert.equal(c.extra.basis, "indicated");
  applyRefreshPlan(p, pl, keys(pl), { AAA: e });
  assert.equal(p.holdings[0].fields.dividend.basis, "indicated");
});

test("a recent raise is hinted the other way", () => {
  assert.match(dividendHint(entry({ d: 4, per: 1.3 })), /current rate is higher/);
  assert.equal(dividendHint(entry({ d: 4, per: 1 })), null);
  assert.equal(dividendHint(entry({ d: 0, per: 0 })), null);
});

test("ex-date and pay date stay distinct; no pay date is ever invented", () => {
  const m = { AAA: entry({ last: "2026-09-23" }) };
  const p = setup(m);
  assert.equal(p.holdings[0].fields.schedule.exDate, "2026-09-23");
  assert.equal(p.holdings[0].fields.schedule.payDate, null);
  assert.equal(p.holdings[0].fields.schedule.basis, "ex-date");
  const now = { AAA: entry({ last: "2026-12-10", u: "2026-12-11T00:00:00.000Z", s: "Q3" }) };
  const pl = buildRefreshPlan(p, now, { now: Date.parse("2026-12-12T00:00:00Z") });
  applyRefreshPlan(p, pl, keys(pl), now);
  assert.equal(p.holdings[0].fields.schedule.exDate, "2026-12-10");
  assert.equal(p.holdings[0].fields.schedule.payDate, null);
});

test("starter estimates never replace dated or personal values", () => {
  const dated = { AAA: entry({}) };
  const p = setup(dated);
  const seed = { AAA: { n: "Test", p: 90, d: 3, s: "Q3", q: true } };           // no source, no date
  const pl = plan(p, seed);
  assert.deepEqual(keys(pl), []);
  assert.equal(row(pl, "AAA").status, "estimate-only");
});

test("an entry with no provider dividend (estimate flag) updates the price only", () => {
  const p = setup({ AAA: entry({}) });
  const now = { AAA: entry({ p: 120, est: true, u: "2026-10-13T03:00:00.000Z" }) };
  const pl = plan(p, now);
  assert.deepEqual(row(pl, "AAA").changes.map((c) => c.field).sort(), ["price", "schedule"]);
  assert.match(row(pl, "AAA").notes.join(" "), /dividend value was not touched/);
});

test("older values from the first version (no provider, no date) can be refreshed, because they are not yours", () => {
  const p = setup({ AAA: entry({}) }, (pk) => { for (const f of Object.values(pk.holdings[0].fields)) { f.src = "legacy"; f.asOf = null; } });
  const now = { AAA: entry({ p: 101, u: "2026-10-13T03:00:00.000Z" }) };
  const pl = plan(p, now);
  assert.ok(row(pl, "AAA").changes.some((c) => c.field === "price" && c.kind === "update"));
  assert.ok(row(pl, "AAA").changes.every((c) => c.kind !== "protected"));
});

test("same value with a newer date is a confirmation, applied without changing the number", () => {
  const p = setup({ AAA: entry({ u: "2026-10-01T00:00:00.000Z" }) });
  const now = { AAA: entry({ u: "2026-10-13T03:00:00.000Z" }) };
  const pl = plan(p, now);
  assert.equal(row(pl, "AAA").status, "confirm");
  assert.ok(row(pl, "AAA").changes.every((c) => c.kind === "confirm"));
  applyRefreshPlan(p, pl, keys(pl), now);
  assert.equal(p.holdings[0].fields.price.v, 100);
  assert.equal(p.holdings[0].fields.price.asOf, "2026-10-13");
});

test("saved reports are untouched by a refresh", () => {
  const m = { AAA: entry({}) };
  const p = setup(m);
  p.snapshots.push(sampleReceipt(p));
  const before = JSON.stringify(p.snapshots);
  const now = { AAA: entry({ p: 150, d: 6, u: "2026-10-13T03:00:00.000Z" }) };
  const pl = plan(p, now);
  applyRefreshPlan(p, pl, keys(pl), now);
  assert.equal(JSON.stringify(p.snapshots), before);
});
