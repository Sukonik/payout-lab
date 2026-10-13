import test from "node:test";
import assert from "node:assert/strict";
import { QR, cardModel, makeQr, qrPixels, qrSvg } from "../js/core/qr.js";
import { encodeSnapshot, snapshotLink, workspaceLink } from "../js/core/link.js";
import { newPacket } from "../js/core/packet.js";
import { holdingFromMarket } from "../js/core/market.js";

const e = (o) => ({ n: "Realty Income Corporation", p: 54.3, d: 3.245, s: "Q3", q: true, src: "Tiingo", u: "2026-10-12T22:00:00Z", per: 0.27, last: "2026-09-23", ...o });
function portfolio(n = 7) {
  const p = newPacket({ name: "Retirement income", now: "2026-10-13T12:00:00.000Z" });
  for (let i = 0; i < n; i++) p.holdings.push(holdingFromMarket(`T${i}`.padEnd(4, "X").slice(0, 4), 10 + i + 0.25, e({ n: `Company number ${i} holdings`, p: 20 + i, d: 1 + (i % 7) / 4 })));
  return p;
}

// jsQR is a test-only decoder, installed with `npm install --no-save jsqr`. In CI it must be present.
let jsQR = null;
try { jsQR = (await import("jsqr")).default; } catch { if (process.env.CI) throw new Error("jsqr is required in CI"); }
const decode = (qr, cell = 6) => { const { data, width, height } = qrPixels(qr, cell); const r = jsQR(data, width, height); return r?.data ?? null; };
const skip = jsQR ? false : "jsqr not installed";

test("a workspace bookmark scans back to exactly the same link", { skip }, () => {
  const link = workspaceLink("https://sukonik.github.io/payout-lab/", "pf_abcdefgh12", "overview");
  const qr = makeQr(link); assert.ok(qr.ok);
  assert.equal(decode(qr), link);
});

test("snapshot links of several sizes scan back unchanged", { skip }, async () => {
  for (const n of [1, 7, 15, 30]) {
    const e = await encodeSnapshot(portfolio(n), { now: "2026-10-13T12:00:00.000Z" });
    const link = snapshotLink("https://example.org/app/", e.params);
    const qr = makeQr(link);
    assert.ok(qr.ok, `${n} holdings`);
    assert.equal(decode(qr, 5), link, `${n} holdings (${link.length} chars, version ${qr.version})`);
  }
});

test("error correction is fixed and never silently changed", () => {
  assert.equal(QR.ecc, "MEDIUM");
  const small = makeQr("https://x.test/#/overview?p=pf_aaaaaaaa");
  assert.ok(small.ok);
  // a code damaged in a few modules still reads: ECC is really in effect
  if (jsQR) {
    const m = structuredClone(small); for (let i = 0; i < 6; i++) { const y = 10 + i, x = 12; m.modules[y][x] = !m.modules[y][x]; }
    assert.equal(decode(m), "https://x.test/#/overview?p=pf_aaaaaaaa");
  }
});

test("a link too big for any QR code is refused, never truncated or weakened", () => {
  const r = makeQr("https://example.org/#/snapshot?v=1&c=1&d=" + "A".repeat(4000));
  assert.equal(r.ok, false); assert.equal(r.code, "too_big"); assert.match(r.message, /packet/i);
  assert.equal(makeQr("").ok, false);
});

test("the image is black on white with a quiet zone, whatever the theme", () => {
  const qr = makeQr("https://x.test/"); const svg = qrSvg(qr, { label: "A <b>card</b>" });
  assert.match(svg, /fill="#fff"/); assert.match(svg, /fill="#000"/);
  assert.ok(!/<b>/.test(svg), "label is not markup");
  const { width, data } = qrPixels(qr, 4);
  assert.equal(width, (qr.size + 8) * 4);
  for (let i = 0; i < width * 4 * 4; i += 4) assert.equal(data[i], 255, "top quiet zone is white");
  const colors = new Set(); for (let i = 0; i < data.length; i += 4) colors.add(data[i] + "," + data[i + 3]);
  assert.deepEqual([...colors].sort(), ["0,255", "255,255"], "only pure black and white");
});

test("card text states what the card is and what it cannot do", () => {
  const p = portfolio(3);
  const w = cardModel(p, { type: "workspace", link: "x", now: "2026-10-13T00:00:00Z" });
  assert.match(w.typeLabel, /no portfolio data/); assert.match(w.explain, /cannot restore/);
  assert.equal(w.name, p.portfolioName); assert.ok(w.shortId.length === 8);
  assert.ok(!JSON.stringify(w).includes(p.holdings[0].ticker), "the bookmark card never names holdings");
  const s = cardModel(p, { type: "snapshot", link: "x", now: "2026-10-13T00:00:00Z" });
  assert.match(s.typeLabel, /copy of the holdings/); assert.match(s.explain, /Anyone who holds this card/);
  assert.equal(s.saved, "2026-10-13T00:00:00Z");
});
