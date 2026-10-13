// Workspace bookmarks and portable snapshot links, generated and read entirely in the browser.
//
//   Workspace bookmark   #/<view>?p=<portfolioId>   Selects a portfolio that already lives on this browser. It carries no data and
//                                                    cannot recover anything: on a device that does not have the portfolio it asks for a packet.
//   Snapshot link        #/snapshot?v=1&c=1&d=...   A dated, compressed COPY of holdings and settings inside the address. Fixed in time:
//                                                    changing your portfolio makes a new link and leaves old ones unchanged.
//
// The fragment (the part after #) is not sent to a server when a page loads, but it is NOT encrypted: your browser history, the page
// itself and anyone you give the link to can read it. A snapshot link therefore shows its holdings to whoever holds it.
import { DEFAULT_SETTINGS, FORMAT, LIMITS, SCHEMA_VERSION, PacketError, APP_VERSION, newId, normalizeSettings, validatePacket } from "./packet.js";
import { VIEWS } from "./route.js";

export const LINK = {
  version: 1,
  warnChars: 2000,          // above this some chat and email apps start cutting links
  maxChars: 8000,           // hard cap on the encoded payload: beyond it a packet is the right tool
  maxInflated: 256 * 1024,  // a link may never expand to more than this, so a tiny "compression bomb" cannot hog memory
};

const SRC = { tiingo: "t", yahoo: "y", seed: "s", user: "u", csv: "c", legacy: "l", data: "d" };
const SRC_BACK = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [v, k]));
const BASIS_D = { trailing: "t", indicated: "i" }, BASIS_D_BACK = { t: "trailing", i: "indicated" };
const BASIS_S = { "ex-date": "x", user: "u", unknown: "" }, BASIS_S_BACK = { x: "ex-date", u: "user", "": "unknown" };

// ---------- workspace bookmark ----------
export function workspaceLink(base, portfolioId, view = "overview") {
  if (!/^pf_[0-9a-z]{8,32}$/.test(portfolioId) || !VIEWS.includes(view)) throw new Error("Cannot build a bookmark for that portfolio.");
  return `${base}#/${view}?p=${portfolioId}`;
}

// ---------- base64url ----------
export function toB64u(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64u(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s)) throw new PacketError("bad_link", "That link is damaged: it has characters that cannot be part of a snapshot.");
  if (s.length % 4 === 1) throw new PacketError("corrupt", "That link is damaged or cut short and could not be read.");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---------- compression (built-in browser streams; no library) ----------
export const canCompress = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new PacketError("too_big", "That link expands to far more data than a portfolio snapshot can hold, so it was not opened."); }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof PacketError) throw e;
    throw new PacketError("corrupt", "That link is damaged or cut short and could not be read.");
  }
  const out = new Uint8Array(total); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ---------- payload ----------
const dateOrEmpty = (d) => d || "";
export function toPayload(packet, { name = packet.portfolioName, now = new Date().toISOString() } = {}) {
  const s = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (packet.settings[k] !== DEFAULT_SETTINGS[k]) s[k] = packet.settings[k];
  return {
    k: "payout-link", v: LINK.version, n: String(name).slice(0, LIMITS.maxName), t: now, i: packet.portfolioId, r: packet.revisionId, s,
    h: packet.holdings.map((h) => {
      const f = h.fields;
      return [h.ticker, h.name, h.shares,
        [f.price.v, SRC[f.price.src] ?? "u", dateOrEmpty(f.price.asOf), f.price.manual ? 1 : 0],
        [f.dividend.v, SRC[f.dividend.src] ?? "u", dateOrEmpty(f.dividend.asOf), f.dividend.manual ? 1 : 0, BASIS_D[f.dividend.basis] ?? ""],
        [f.schedule.v, SRC[f.schedule.src] ?? "u", dateOrEmpty(f.schedule.asOf), f.schedule.manual ? 1 : 0, BASIS_S[f.schedule.basis] ?? "", dateOrEmpty(f.schedule.exDate)],
        (f.tax.v ? 1 : 0) + (f.tax.manual ? 2 : 0)];
    }),
  };
}

// Returns { fragmentParams: {v, c, d}, chars, compressed, jsonBytes, rating }. Never truncates: oversize is reported, not shortened.
export async function encodeSnapshot(packet, opts = {}) {
  const json = new TextEncoder().encode(JSON.stringify(toPayload(packet, opts)));
  let bytes = json, c = 0;
  if (canCompress()) { bytes = await deflate(json); c = 1; }
  const d = toB64u(bytes);
  return { params: { v: String(LINK.version), c: String(c), d }, chars: d.length, compressed: c === 1, jsonBytes: json.length, rating: rateLength(d.length) };
}

export function rateLength(chars) { return chars > LINK.maxChars ? "too-large" : chars > LINK.warnChars ? "medium" : "short"; }
export function snapshotLink(base, params) { return `${base}#/snapshot?v=${params.v}&c=${params.c}&d=${params.d}`; }

const num = (v, lo, hi, what) => { if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw new PacketError("invalid", `${what} is not a valid number.`); return v; };
const str = (v, max, what) => { if (typeof v !== "string" || v.length > max) throw new PacketError("invalid", `${what} is not valid text.`); return v; };
const day = (v) => (v === "" ? null : v);

// Decode and rebuild a packet from a snapshot link. The result is a NEW portfolio (new ids) that remembers where it came from.
export async function decodeSnapshot({ v, c, d }) {
  try {
    if (!/^\d{1,2}$/.test(String(v))) throw new PacketError("bad_link", "That link is damaged.");
    if (Number(v) > LINK.version) throw new PacketError("future_version", `That link was made by a newer version of Payout Lab (format ${v}). Nothing was changed.`);
    if (Number(v) < 1) throw new PacketError("bad_link", "That link is damaged.");
    if (String(d).length > LINK.maxChars) throw new PacketError("too_long", "That link is longer than Payout Lab will open. Ask for a packet file instead.");
    const bytes = fromB64u(String(d));
    let raw;
    if (String(c) === "1") {
      if (!canCompress()) throw new PacketError("unsupported", "This browser cannot unpack compressed links. Try a current version of Chrome, Edge, Safari or Firefox, or ask for a packet file.");
      raw = await inflate(bytes, LINK.maxInflated);
    } else if (String(c) === "0") {
      if (bytes.length > LINK.maxInflated) throw new PacketError("too_big", "That link holds more data than a portfolio snapshot can.");
      raw = bytes;
    } else throw new PacketError("bad_link", "That link is damaged.");
    let p;
    try { p = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); } catch { throw new PacketError("corrupt", "That link is damaged or cut short and could not be read."); }
    if (!p || p.k !== "payout-link") throw new PacketError("bad_link", "That is not a Payout Lab snapshot link.");
    if (p.v !== LINK.version) throw new PacketError("future_version", "That link was made by a different version of Payout Lab. Nothing was changed.");
    if (!Array.isArray(p.h) || p.h.length > LIMITS.maxHoldings) throw new PacketError("invalid", "That link has an invalid holdings list.");
    const now = new Date().toISOString();
    const rev = newId("rv");
    const holdings = p.h.map((h, i) => {
      if (!Array.isArray(h) || h.length !== 7 || !Array.isArray(h[3]) || !Array.isArray(h[4]) || !Array.isArray(h[5])) throw new PacketError("invalid", `Holding ${i + 1} is not valid.`);
      const [pv, ps, pa, pm] = h[3], [dv, ds, da, dm, db] = h[4], [sv, ss, sa, sm, sb, sx] = h[5], tax = h[6];
      if (!(ps in SRC_BACK) || !(ds in SRC_BACK) || !(ss in SRC_BACK)) throw new PacketError("invalid", `Holding ${i + 1} has an unknown source.`);
      if (!(db in BASIS_D_BACK) && db !== "") throw new PacketError("invalid", `Holding ${i + 1} has an unknown dividend basis.`);
      if (!(sb in BASIS_S_BACK)) throw new PacketError("invalid", `Holding ${i + 1} has an unknown schedule basis.`);
      if (!Number.isInteger(tax) || tax < 0 || tax > 3) throw new PacketError("invalid", `Holding ${i + 1} has an invalid tax flag.`);
      return {
        id: newId("h"), ticker: str(h[0], 15, "A ticker"), name: str(h[1], 120, "A name"), shares: num(h[2], 0, LIMITS.maxShares, "A share count"),
        fields: {
          price: { v: num(pv, 0, LIMITS.maxPrice, "A price"), src: SRC_BACK[ps], asOf: day(pa), manual: pm === 1 },
          dividend: { v: num(dv, 0, LIMITS.maxDividend, "A dividend"), src: SRC_BACK[ds], asOf: day(da), manual: dm === 1, basis: db === "" ? null : BASIS_D_BACK[db] },
          schedule: { v: sv, src: SRC_BACK[ss], asOf: day(sa), manual: sm === 1, basis: BASIS_S_BACK[sb], exDate: day(sx), payDate: null },
          tax: { v: (tax & 1) === 1, src: (tax & 2) === 2 ? "user" : "data", asOf: null, manual: (tax & 2) === 2 },
        },
      };
    });
    const packet = validatePacket({
      format: FORMAT, schemaVersion: SCHEMA_VERSION, portfolioId: newId("pf"),
      portfolioName: `${str(p.n ?? "", LIMITS.maxName, "The name") || "Shared snapshot"} (snapshot)`.slice(0, LIMITS.maxName),
      revisionId: rev, parentRevisionId: null, lineage: [rev], createdAt: now, savedAt: now, app: { name: "Payout Lab", version: APP_VERSION },
      holdings, settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...(p.s && typeof p.s === "object" ? p.s : {}) }), snapshots: [],
      origin: typeof p.i === "string" && typeof p.r === "string" ? { portfolioId: p.i, revisionId: p.r, relation: "copy" } : undefined,
    });
    return { ok: true, packet, madeAt: typeof p.t === "string" && !Number.isNaN(Date.parse(p.t)) ? p.t : null };
  } catch (e) {
    if (e instanceof PacketError) return { ok: false, error: { code: e.code, message: e.message } };
    return { ok: false, error: { code: "unexpected", message: "That link could not be opened." } };
  }
}
