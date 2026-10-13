import test from "node:test";
import assert from "node:assert/strict";
import { loadMarket, sanitizeEntry, getMarket, holdingFromMarket } from "../js/core/market.js";
import { fieldStatus } from "../js/ui/views.js";
import { buildRefreshPlan, ageDays, STALE_DAYS } from "../js/core/refresh.js";
import { newPacket, parsePacketText, serializePacket } from "../js/core/packet.js";

const good = { n: "Good Co", p: 10, d: 1, s: "Q1", q: true, src: "Tiingo", u: "2026-10-12T22:00:00Z", per: 0.25, last: "2026-09-23" };

test("public data is rebuilt from known fields and bounds", () => {
  const e = sanitizeEntry("GOOD", { ...good, evil: "<script>", n: "A\u0000B".padEnd(300, "x") });
  assert.equal("evil" in e, false);
  assert.equal(e.n.length, 120);
  assert.equal(e.n.includes("\u0000"), false);
  assert.equal(sanitizeEntry("BAD", { ...good, s: "X" }).s, "Q3", "an unknown schedule falls back instead of leaking through");
  assert.equal(sanitizeEntry("BAD", { ...good, u: "yesterday" }).u, undefined);
  for (const bad of [{ ...good, p: 0 }, { ...good, p: -1 }, { ...good, p: 1e9 }, { ...good, d: -1 }, { ...good, d: "4" }, { ...good, p: NaN }, null, "x", []]) assert.equal(sanitizeEntry("BAD", bad), null, JSON.stringify(bad));
  for (const key of ["<img>", "", "A B", "x".repeat(40)]) assert.equal(sanitizeEntry(key, good), null, key);
  assert.deepEqual(sanitizeEntry("H", { ...good, hist: [{ d: "2026-01-01", a: 1 }, { d: "x", a: 1 }, { d: "2026-02-01", a: -4 }, null] }).hist, [{ d: "2026-01-01", a: 1 }]);
});

test("a hostile data.json cannot put an unreadable holding into a packet", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ updated: "2026-10-13T00:00:00Z", source: "x", tickers: { GOOD: good, EVIL: { ...good, s: "ZZ", n: 42 }, "<bad>": good } }) });
  const m = await loadMarket("data.json", fake);
  assert.equal(m.loaded, true);
  assert.deepEqual(Object.keys(m.tickers).sort(), ["EVIL", "GOOD"]);
  const p = newPacket();
  p.holdings.push(holdingFromMarket("EVIL", 3, getMarket().tickers.EVIL));
  assert.equal(parsePacketText(serializePacket(p)).ok, true);
});

test("one staleness rule everywhere: the overview and the review sheet agree", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const field = (asOf) => ({ v: 1, src: "tiingo", asOf, manual: false });
  for (const asOf of ["2026-10-13", "2026-10-07", "2026-10-06", "2026-10-05", "2026-09-01"]) {
    const stale = fieldStatus(field(asOf), now) === "stale";
    const p = newPacket();
    const h = holdingFromMarket("AAA", 1, { ...good, u: asOf + "T00:00:00Z" });
    p.holdings.push(h);
    const row = buildRefreshPlan(p, { AAA: { ...good, u: asOf + "T00:00:00Z" } }, { now }).rows[0];
    assert.equal(row.obs.stale, stale, `${asOf}: overview says ${stale}, review sheet says ${row.obs.stale}`);
    assert.equal(ageDays(asOf, now) > STALE_DAYS, stale);
  }
});
