import test from "node:test";
import assert from "node:assert/strict";
import {
  newId, newPacket, parsePacketText, serializePacket, validatePacket, nextRevision, compareRevisions,
  asSeparateCopy, packetFileName, migrateLegacyV1, canonicalJson, LIMITS, SCHEMA_VERSION,
} from "../js/core/packet.js";
import { samplePacket, sampleReceipt, NOW } from "./helpers.mjs";

const roundTrip = (p) => parsePacketText(serializePacket(p));

test("ids use browser randomness, have the expected shape and do not repeat", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId("pf")));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^pf_[0-9a-z]{13}$/);
});

test("round trip keeps fractional shares, manual values, provenance, settings and snapshots", () => {
  const p = samplePacket();
  p.snapshots.push(sampleReceipt(p));
  const r = roundTrip(p);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.packet, validatePacket(JSON.parse(JSON.stringify(p))));
  const o = r.packet.holdings.find((h) => h.ticker === "O");
  assert.equal(o.shares, 80.333);
  assert.equal(o.fields.price.src, "yahoo");
  assert.equal(o.fields.price.asOf, "2026-10-12");
  const x = r.packet.holdings.find((h) => h.ticker === "XYZ");
  assert.equal(x.fields.price.manual, true);
  assert.equal(x.fields.price.v, 12.34);
  assert.equal(r.packet.settings.growth, 7.5);
  assert.equal(r.packet.settings.cutT, "O");
  assert.equal(r.packet.snapshots.length, 1);
  assert.equal(r.packet.snapshots[0].outputs.goalMonthsSlow, null);
  assert.equal(r.packet.snapshots[0].holdings[0].provenance.price.src, "tiingo");
});

test("a packet with no checksum opens with a note; an edited packet opens with a warning", () => {
  const p = samplePacket();
  const body = JSON.parse(serializePacket(p));
  delete body.checksum;
  assert.deepEqual(parsePacketText(JSON.stringify(body)).warnings.map((w) => w.code), ["no_checksum"]);
  const withSum = JSON.parse(serializePacket(p));
  withSum.holdings[0].shares = 999;
  const r = parsePacketText(JSON.stringify(withSum));
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings.map((w) => w.code), ["checksum_mismatch"]);
});

test("checksum ignores formatting but not content", () => {
  const p = samplePacket();
  const compact = JSON.stringify(JSON.parse(serializePacket(p)));
  assert.deepEqual(parsePacketText(compact).warnings, []);
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
});

test("rejects malformed, oversized, wrong and future-version files without throwing", () => {
  const cases = {
    "not json": ["{nope", "bad_json"],
    "empty": ["", "bad_json"],
    "array": ["[]", "not_packet"],
    "wrong format": [JSON.stringify({ format: "other" }), "not_packet"],
    "oversized": ["x".repeat(LIMITS.maxChars + 1), "too_large"],
  };
  for (const [name, [text, code]] of Object.entries(cases)) {
    const r = parsePacketText(text);
    assert.equal(r.ok, false, name);
    assert.equal(r.error.code, code, name);
  }
  const future = JSON.parse(serializePacket(samplePacket()));
  future.schemaVersion = SCHEMA_VERSION + 1;
  const r = parsePacketText(JSON.stringify(future));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "future_version");
  assert.match(r.error.message, /Nothing was changed/);
  assert.equal(parsePacketText(null).ok, false);
});

test("rejects non-finite, negative and out-of-range numbers, bad tickers and duplicates", () => {
  const base = () => JSON.parse(serializePacket(samplePacket()));
  const mutate = (fn) => { const b = base(); fn(b); delete b.checksum; return parsePacketText(JSON.stringify(b)); };
  const expectFail = (r, code) => { assert.equal(r.ok, false); assert.equal(r.error.code, code); };
  expectFail(mutate((b) => { b.holdings[0].shares = -1; }), "out_of_range");
  expectFail(mutate((b) => { b.holdings[0].shares = "12"; }), "bad_number");
  expectFail(mutate((b) => { b.holdings[0].shares = 1e15; }), "out_of_range");
  expectFail(mutate((b) => { b.holdings[0].fields.price.v = null; }), "bad_number");
  expectFail(mutate((b) => { b.holdings[0].ticker = "<img src=x>"; }), "bad_ticker");
  expectFail(mutate((b) => { b.holdings[1].ticker = b.holdings[0].ticker; }), "duplicate_ticker");
  expectFail(mutate((b) => { b.settings.cutPct = 120; }), "out_of_range");
  expectFail(mutate((b) => { b.holdings[0].fields.schedule.v = "Weekly"; }), "bad_value");
  expectFail(mutate((b) => { b.revisionId = "nope"; }), "bad_id");
  expectFail(mutate((b) => { b.savedAt = "yesterday"; }), "bad_date");
  expectFail(mutate((b) => { b.holdings = new Array(LIMITS.maxHoldings + 1).fill(b.holdings[0]); }), "too_many");
  // JSON has no NaN/Infinity literal; make sure a hand-edited huge exponent is also rejected
  const r = parsePacketText(serializePacket(samplePacket()).replace('"shares": 12.5', '"shares": 1e999'));
  assert.equal(r.ok, false);
});

test("imported text is kept as plain text (never interpreted) and control characters are removed", () => {
  const b = JSON.parse(serializePacket(samplePacket()));
  b.portfolioName = "<script>alert(1)</script>\u0000\u0007 Mine";
  b.holdings[0].name = "<img onerror=x>";
  delete b.checksum;
  const r = parsePacketText(JSON.stringify(b));
  assert.equal(r.ok, true);
  assert.equal(r.packet.portfolioName, "<script>alert(1)</script> Mine");
  assert.equal(r.packet.holdings[0].name, "<img onerror=x>");
});

test("unknown extra fields are dropped, missing settings fall back to defaults", () => {
  const b = JSON.parse(serializePacket(samplePacket()));
  b.evil = { __proto__: { polluted: true } };
  b.holdings[0].extra = "x";
  delete b.settings.slow;
  delete b.checksum;
  const r = parsePacketText(JSON.stringify(b));
  assert.equal(r.ok, true);
  assert.equal("evil" in r.packet, false);
  assert.equal("extra" in r.packet.holdings[0], false);
  assert.equal(r.packet.settings.slow, 2);
  assert.equal({}.polluted, undefined);
});

test("revisions: next revision links to its parent and lineage is bounded", () => {
  let p = newPacket({ now: NOW });
  const first = p.revisionId;
  for (let i = 0; i < LIMITS.maxLineage + 20; i++) p = nextRevision(p);
  assert.equal(p.lineage.length, LIMITS.maxLineage);
  assert.equal(p.lineage.at(-1), p.revisionId);
  assert.equal(p.lineage.includes(first), false);
  assert.notEqual(p.parentRevisionId, p.revisionId);
  assert.equal(p.lineage.at(-2), p.parentRevisionId);
});

test("competing revisions are detected, never silently replaced", () => {
  const a = samplePacket();
  const b = nextRevision(a);
  const c = nextRevision(a);               // sibling of b: diverged
  const d = nextRevision(b);
  assert.equal(compareRevisions(a, a), "identical");
  assert.equal(compareRevisions(a, b), "incoming-newer");
  assert.equal(compareRevisions(d, a), "incoming-older");
  assert.equal(compareRevisions(b, c), "diverged");
  assert.equal(compareRevisions(a, newPacket()), "different-portfolio");
  // survives a file round trip
  const r = roundTrip(c);
  assert.equal(compareRevisions(b, r.packet), "diverged");
});

test("a diverging copy gets a new identity, keeps its content and records where it came from", () => {
  const a = samplePacket();
  a.snapshots.push(sampleReceipt(a));
  const copy = asSeparateCopy(a, { now: NOW });
  assert.notEqual(copy.portfolioId, a.portfolioId);
  assert.match(copy.portfolioName, /\(copy\)$/);
  assert.deepEqual(copy.origin, { portfolioId: a.portfolioId, revisionId: a.revisionId, relation: "copy" });
  assert.equal(copy.holdings.length, a.holdings.length);
  assert.equal(roundTrip(copy).ok, true, "history stays attached to the copy and the file still validates");
});

test("file names are predictable and safe", () => {
  const p = samplePacket();
  assert.match(packetFileName(p), /^test-portfolio-20261013-[0-9a-z]{6}\.payout$/);
  p.portfolioName = "../../Étienne's <IRA>/ 💰";
  assert.match(packetFileName(p), /^[a-z0-9-]+-20261013-[0-9a-z]{6}\.payout$/);
  assert.doesNotMatch(packetFileName(p), /[\\/<>]/);
});

test("legacy V1 storage migrates without losing holdings, manual values or sliders", () => {
  const legacy = {
    holdings: [
      { t: "SCHD", n: "Schwab", shares: 300, price: 27.5, div: 1.03, s: "Q3", q: true },
      { t: "ZZZ", n: "Enter price", shares: 10.25, price: 8, div: 0.5, s: "S", q: false, manual: true },
      { t: "bad ticker!", shares: 1 }, { t: "SCHD", shares: 5 },
    ],
    target: 2500, contrib: 250, growth: 8, slow: 1, reinvest: false, cutT: "SCHD", cutPct: 20, addT: "ZZZ", addAmt: 5000, qRate: 18, oRate: 30, stRate: 4, junk: 1,
  };
  const { packet, skipped } = migrateLegacyV1(legacy, { now: NOW });
  assert.deepEqual(skipped.sort(), ["SCHD", "bad ticker!"].sort());
  assert.equal(packet.holdings.length, 2);
  const z = packet.holdings.find((h) => h.ticker === "ZZZ");
  assert.equal(z.shares, 10.25);
  assert.equal(z.fields.price.manual, true);
  assert.equal(z.fields.price.src, "user");
  const s = packet.holdings.find((h) => h.ticker === "SCHD");
  assert.equal(s.fields.price.src, "legacy", "old values never get a provider label");
  assert.equal(s.fields.price.asOf, null);
  assert.equal(s.fields.price.manual, false);
  assert.deepEqual({ ...packet.settings, dividendBasis: undefined }, { target: 2500, contrib: 250, growth: 8, slow: 1, reinvest: false, cutT: "SCHD", cutPct: 20, addT: "ZZZ", addAmt: 5000, qRate: 18, oRate: 30, stRate: 4, dividendBasis: undefined });
  assert.equal(roundTrip(packet).ok, true);
});

test("legacy migration tolerates garbage", () => {
  for (const raw of [null, undefined, {}, { holdings: "x" }, { holdings: [null, 5, {}], target: "abc", growth: 9999 }]) {
    const { packet } = migrateLegacyV1(raw, { now: NOW });
    assert.equal(roundTrip(packet).ok, true);
  }
});

test("typed values are clamped to what a packet can hold, so the app never writes an unreadable file", async () => {
  const { clampSetting, SETTING_RANGE } = await import("../js/core/packet.js");
  assert.equal(clampSetting("growth", 150), 50);
  assert.equal(clampSetting("growth", -5), 0);
  assert.equal(clampSetting("qRate", "abc"), 0);
  assert.equal(clampSetting("target", 5e12), 1e7);
  assert.equal(clampSetting("addAmt", 12345), 12345);
  // every clamped extreme passes validation
  const p = samplePacket();
  for (const [k, [lo, hi]] of Object.entries(SETTING_RANGE)) for (const v of [lo, hi]) p.settings[k] = clampSetting(k, v);
  assert.equal(roundTrip(p).ok, true);
});

test("legacy migration stops at the holdings limit instead of producing an unopenable packet", () => {
  const holdings = Array.from({ length: LIMITS.maxHoldings + 40 }, (_, i) => ({ t: `T${i}`, shares: 1, price: 1, div: 0, s: "Q3", q: true }));
  const { packet, skipped } = migrateLegacyV1({ holdings }, { now: NOW });
  assert.equal(packet.holdings.length, LIMITS.maxHoldings);
  assert.equal(skipped.length, 40);
  assert.equal(roundTrip(packet).ok, true);
});

test("history stays comparable across hundreds of revisions (the window is wide, and the app mints few)", () => {
  assert.ok(LIMITS.maxLineage >= 200);
  let a = newPacket({ now: NOW });
  const b0 = a;
  for (let i = 0; i < 150; i++) a = nextRevision(a);
  assert.equal(compareRevisions(b0, a), "incoming-newer");
  assert.equal(compareRevisions(a, b0), "incoming-older");
});
