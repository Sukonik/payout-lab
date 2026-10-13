import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { LINK, encodeSnapshot, decodeSnapshot, snapshotLink, workspaceLink, toB64u, fromB64u, rateLength, toPayload } from "../js/core/link.js";
import { parseFragment, buildFragment } from "../js/core/route.js";
import { newPacket, parsePacketText, serializePacket, LIMITS } from "../js/core/packet.js";
import { holdingFromMarket, manualHolding } from "../js/core/market.js";

const NOW = "2026-10-13T12:00:00.000Z";
const e = (o) => ({ n: "Realty Income Corporation", p: 54.3, d: 3.245, s: "Q3", q: true, src: "Tiingo", u: "2026-10-12T22:00:00Z", per: 0.27, last: "2026-09-23", ...o });
function portfolio(n = 7) {
  const p = newPacket({ name: "Retirement income", now: NOW });
  for (let i = 0; i < n; i++) p.holdings.push(holdingFromMarket(`T${i}`.padEnd(4, "X").slice(0, 4) + (i >= 100 ? i : ""), 10 + i + 0.25, e({ n: `Company number ${i} holdings`, p: 20 + i, d: 1 + (i % 7) / 4, s: ["M", "Q1", "Q2", "Q3", "S", "A"][i % 6] })));
  p.settings = { ...p.settings, target: 3200, growth: 7.5, reinvest: false, dividendBasis: "indicated" };
  return p;
}
const strip = (pk) => pk.holdings.map((h) => ({ t: h.ticker, n: h.name, s: h.shares, f: h.fields }));

test("a snapshot link round-trips values, provenance and settings, as a new portfolio that remembers its origin", async () => {
  const p = portfolio(7);
  p.holdings.push(manualHolding("MINE", 3.5));
  p.holdings.at(-1).fields.price.v = 12.34; p.holdings.at(-1).fields.price.src = "csv";
  p.holdings[0].fields.tax.manual = true; p.holdings[0].fields.tax.src = "user";
  const enc = await encodeSnapshot(p, { now: NOW });
  const dec = await decodeSnapshot(enc.params);
  assert.equal(dec.ok, true, JSON.stringify(dec.error));
  assert.deepEqual(strip(dec.packet).map((h) => ({ ...h, f: undefined })), strip(p).map((h) => ({ ...h, f: undefined })));
  p.holdings.forEach((h, i) => {
    const g = dec.packet.holdings[i].fields, f = h.fields;
    for (const k of ["price", "dividend", "schedule"]) assert.deepEqual([g[k].v, g[k].src, g[k].asOf, g[k].manual], [f[k].v, f[k].src, f[k].asOf, f[k].manual], `${h.ticker} ${k}`);
    assert.equal(g.dividend.basis, f.dividend.basis); assert.equal(g.schedule.basis, f.schedule.basis); assert.equal(g.schedule.exDate, f.schedule.exDate);
    assert.equal(g.tax.v, f.tax.v); assert.equal(g.tax.manual, f.tax.manual);
  });
  assert.equal(dec.packet.holdings.find((h) => h.ticker === "MINE").shares, 3.5);
  assert.deepEqual({ ...dec.packet.settings }, { ...p.settings });
  assert.equal(dec.packet.portfolioName, "Retirement income (snapshot)");
  assert.notEqual(dec.packet.portfolioId, p.portfolioId, "opening a link never reuses an identity");
  assert.deepEqual(dec.packet.origin, { portfolioId: p.portfolioId, revisionId: p.revisionId, relation: "copy" });
  assert.equal(dec.madeAt, NOW);
  assert.equal(parsePacketText(serializePacket(dec.packet)).ok, true, "and the result is a valid packet");
  assert.deepEqual(dec.packet.snapshots, [], "saved reports are never in a link");
});

test("updating the portfolio makes a new link and leaves the old one unchanged", async () => {
  const p = portfolio(5);
  const l1 = await encodeSnapshot(p, { now: NOW });
  const before = await decodeSnapshot(l1.params);
  p.holdings[0].shares = 999; p.settings.target = 1;
  const l2 = await encodeSnapshot(p, { now: "2026-11-01T00:00:00.000Z" });
  assert.notEqual(l2.params.d, l1.params.d);
  const again = await decodeSnapshot(l1.params);
  assert.deepEqual(strip(again.packet).map((h) => h.s), strip(before.packet).map((h) => h.s));
  assert.equal(again.packet.settings.target, before.packet.settings.target);
  assert.equal((await decodeSnapshot(l2.params)).packet.holdings[0].shares, 999);
});

test("measured link sizes: what fits where (these numbers are quoted in the docs)", async () => {
  const sizes = {};
  for (const n of [1, 7, 15, 30, 60, 100, 200, 500]) { const r = await encodeSnapshot(portfolio(n), { now: NOW }); sizes[n] = { chars: r.chars, rating: r.rating, json: r.jsonBytes }; }
  console.log("# link sizes (holdings: encoded characters, rating):", Object.entries(sizes).map(([n, s]) => `${n}: ${s.chars} ${s.rating}`).join(" | "));
  assert.equal(sizes[7].rating, "short", "a typical portfolio is a short link");
  assert.ok(sizes[7].chars < sizes[7].json, "compression helps");
  assert.equal(sizes[500].rating, "too-large", "a very large one is refused, never truncated");
  assert.ok(sizes[30].chars < sizes[100].chars && sizes[100].chars < sizes[500].chars, "size grows with holdings");
  assert.equal(rateLength(LINK.warnChars), "short"); assert.equal(rateLength(LINK.warnChars + 1), "medium");
  assert.equal(rateLength(LINK.maxChars), "medium"); assert.equal(rateLength(LINK.maxChars + 1), "too-large");
});

test("without built-in compression a link still works (just longer)", async () => {
  const keep = globalThis.CompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    const p = portfolio(4);
    const enc = await encodeSnapshot(p, { now: NOW });
    assert.equal(enc.params.c, "0"); assert.equal(enc.compressed, false);
    const dec = await decodeSnapshot(enc.params);
    assert.equal(dec.ok, true);
    assert.equal(dec.packet.holdings.length, 4);
    const comp = await (async () => { globalThis.CompressionStream = keep; return encodeSnapshot(p, { now: NOW }); })();
    globalThis.CompressionStream = undefined;
    const dec2 = await decodeSnapshot(comp.params);
    assert.equal(dec2.ok, false); assert.equal(dec2.error.code, "unsupported");
    assert.match(dec2.error.message, /packet file/);
  } finally { globalThis.CompressionStream = keep; }
});

const params = (payload, c = 1) => ({ v: "1", c: String(c), d: toB64u(c ? zlib.deflateRawSync(Buffer.from(JSON.stringify(payload))) : Buffer.from(JSON.stringify(payload))) });
const good = () => toPayload(portfolio(3), { now: NOW });

test("damaged, hostile and oversized links fail safely and say why", async () => {
  const enc = await encodeSnapshot(portfolio(5), { now: NOW });
  const code = async (p) => { const r = await decodeSnapshot(p); assert.equal(r.ok, false, JSON.stringify(p).slice(0, 80)); assert.ok(r.error.message.length > 10); return r.error.code; };
  assert.equal(await code({ ...enc.params, d: enc.params.d.slice(0, Math.floor(enc.params.d.length / 2)) }), "corrupt", "cut short");
  assert.equal(await code({ ...enc.params, d: "not!base64" }), "bad_link");
  // a stray trailing character may be harmless or damaging depending on padding; either way it must never throw
  await assert.doesNotReject(() => decodeSnapshot({ ...enc.params, d: enc.params.d + "A" }));
  assert.equal(await code({ ...enc.params, v: "2" }), "future_version");
  assert.equal(await code({ ...enc.params, v: "0" }), "bad_link");
  assert.equal(await code({ ...enc.params, c: "7" }), "bad_link");
  assert.equal(await code({ ...enc.params, d: "A".repeat(LINK.maxChars + 1) }), "too_long");
  // a deliberately tiny file that inflates to megabytes
  const bomb = { v: "1", c: "1", d: toB64u(zlib.deflateRawSync(Buffer.alloc(4 * 1024 * 1024, 0x20))) };
  assert.ok(bomb.d.length < LINK.maxChars, "the bomb is small enough to pass the length check");
  const t0 = Date.now(); assert.equal(await code(bomb), "too_big"); assert.ok(Date.now() - t0 < 2000, "and is stopped quickly");
  // random bytes never crash it
  for (let i = 0; i < 25; i++) { const bytes = new Uint8Array(40 + i * 3).map(() => Math.floor(Math.random() * 256)); const r = await decodeSnapshot({ v: "1", c: i % 2 ? "1" : "0", d: toB64u(bytes) }); assert.equal(r.ok, false); }
});

test("a well-formed link with bad contents is rejected field by field", async () => {
  const mut = (fn) => { const p = good(); fn(p); return params(p); };
  const bad = [
    ["negative shares", (p) => { p.h[0][2] = -5; }], ["huge shares", (p) => { p.h[0][2] = 1e15; }], ["string shares", (p) => { p.h[0][2] = "5"; }],
    ["markup ticker", (p) => { p.h[0][0] = "<img onerror=x>"; }], ["long name", (p) => { p.h[0][1] = "x".repeat(500); }],
    ["unknown source", (p) => { p.h[0][3][1] = "z"; }], ["bad tax flag", (p) => { p.h[0][6] = 9; }], ["bad schedule", (p) => { p.h[0][5][0] = "Weekly"; }],
    ["bad basis", (p) => { p.h[0][4][4] = "q"; }], ["wrong shape", (p) => { p.h[0] = [1, 2, 3]; }], ["not a list", (p) => { p.h = "x"; }],
    ["too many holdings", (p) => { p.h = Array.from({ length: LIMITS.maxHoldings + 1 }, () => p.h[0]); }], ["wrong kind", (p) => { p.k = "other"; }],
    ["bad setting", (p) => { p.s = { growth: 500 }; }], ["bad date", (p) => { p.h[0][3][2] = "yesterday"; }], ["duplicate tickers", (p) => { p.h[1][0] = p.h[0][0]; }],
    ["bad origin id", (p) => { p.i = "nope"; }],
  ];
  for (const [name, fn] of bad) { const r = await decodeSnapshot(mut(fn)); assert.equal(r.ok, false, name); }
  assert.equal((await decodeSnapshot(params(good()))).ok, true, "the unmodified payload is fine");
});

test("markup in names is kept as text and unknown payload fields are ignored", async () => {
  const p = good(); p.n = "<script>alert(1)</script>"; p.h[0][1] = "<img src=x onerror=1>"; p.zzz = { __proto__: { polluted: 1 } };
  const r = await decodeSnapshot(params(p));
  assert.equal(r.ok, true);
  assert.match(r.packet.portfolioName, /^<script>alert\(1\)<\/script> \(snapshot\)$/);
  assert.equal(r.packet.holdings[0].name, "<img src=x onerror=1>");
  assert.equal({}.polluted, undefined);
});

test("links are built from the page's own base, so they work under a project path and on a custom domain", async () => {
  const p = portfolio(3);
  const enc = await encodeSnapshot(p, { now: NOW });
  for (const base of ["https://sukonik.github.io/payout-lab/", "https://payoutlab.example/", "http://127.0.0.1:8000/"]) {
    const link = snapshotLink(base, enc.params);
    assert.ok(link.startsWith(base + "#/snapshot?v=1&c=1&d="));
    const parsed = parseFragment(link.slice(link.indexOf("#")));
    assert.equal(parsed.kind, "snapshot"); assert.equal(parsed.valid, true);
    assert.equal((await decodeSnapshot(parsed.params)).ok, true);
    assert.equal(workspaceLink(base, p.portfolioId, "lab"), `${base}#/lab?p=${p.portfolioId}`);
  }
  assert.throws(() => workspaceLink("x", "nope"), /Cannot build/);
  assert.throws(() => workspaceLink("x", p.portfolioId, "../etc"), /Cannot build/);
});

test("fragment grammar: snapshot links are strict, bookmarks carry only a valid portfolio id", () => {
  assert.equal(parseFragment("#/snapshot?v=1&c=1&d=" + "A".repeat(100)).valid, true);
  for (const bad of ["#/snapshot", "#/snapshot?v=1&c=1", "#/snapshot?v=1&c=9&d=AAAA", "#/snapshot?v=x&c=1&d=AAAA", "#/snapshot?v=1&c=1&d=" + "A".repeat(12001), "#/snapshot?v=1&c=1&d=<script>", "#/snapshot?v=1&c=1&d=AA%41"]) {
    const r = parseFragment(bad);
    assert.equal(r.kind, "snapshot", bad); assert.equal(r.valid, false, bad); assert.deepEqual(r.params, {}, bad);
  }
  const wb = parseFragment("#/lab?p=pf_abcdefghijkl2");
  assert.deepEqual([wb.view, wb.params.p, wb.kind], ["lab", "pf_abcdefghijkl2", undefined]);
  assert.equal(buildFragment("receipts", { p: "pf_abcdefghijkl2" }), "#/receipts?p=pf_abcdefghijkl2");
});

test("base64url round trips arbitrary bytes", () => {
  for (const n of [0, 1, 2, 3, 4, 100, 1000, 70000]) { const b = new Uint8Array(n).map((_, i) => (i * 31) % 256); assert.deepEqual([...fromB64u(toB64u(b))], [...b], String(n)); }
  assert.equal(toB64u(new Uint8Array([251, 255, 254])).match(/[+/=]/), null);
});
