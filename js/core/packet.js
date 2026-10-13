// Portable portfolio packet: schema, validation, identity, revisions, legacy migration.
// A packet is plain JSON. Importing never executes content: every field is whitelisted, type-checked and bounded
// before anything reaches application state. See docs/packet-format.md.
import { sha256Hex } from "./sha256.js";
import { SCHED } from "./calc.js";

export const FORMAT = "payout-packet";
export const SCHEMA_VERSION = 1;
export const FILE_EXTENSION = ".payout";
export const APP_VERSION = "2.0.0";

export const LIMITS = {
  maxChars: 5 * 1024 * 1024,
  maxHoldings: 500,
  maxSnapshots: 50,
  maxLineage: 200,
  maxName: 80,
  maxShares: 1e12,
  maxPrice: 1e7,
  maxDividend: 1e6,
  maxMoney: 1e13,
};

export const DEFAULT_SETTINGS = Object.freeze({
  target: 2000, contrib: 500, growth: 6, slow: 2, reinvest: true,
  cutT: "", cutPct: 50, addT: "", addAmt: 10000, qRate: 15, oRate: 24, stRate: 5,
  dividendBasis: "trailing",
});

// ---------- identity ----------
const B32 = "0123456789abcdefghjkmnpqrstvwxyz";

function randomBytes(n) {
  const b = new Uint8Array(n);
  if (!globalThis.crypto?.getRandomValues) throw new Error("This browser has no secure random source");
  globalThis.crypto.getRandomValues(b);
  return b;
}

// Random identifier from browser cryptographic randomness (~65 bits). Identity label only: not a password.
export function newId(prefix) {
  const b = randomBytes(9);
  let bits = 0, acc = 0, out = "";
  for (const byte of b) {
    acc = (acc << 8) | byte; bits += 8;
    while (bits >= 5 && out.length < 13) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5; }
    acc &= (1 << bits) - 1;
  }
  return `${prefix}_${out}`;
}

const ID_RE = { pf: /^pf_[0-9a-z]{8,32}$/, rv: /^rv_[0-9a-z]{8,32}$/, h: /^h_[0-9a-z]{4,32}$/, rc: /^rc_[0-9a-z]{8,32}$/ };

// ---------- errors ----------
export class PacketError extends Error {
  constructor(code, message, path) { super(message); this.code = code; this.path = path || ""; }
}
const bad = (code, message, path) => { throw new PacketError(code, message, path); };

// ---------- primitive validators ----------
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

function str(v, path, { max = 200, min = 0, allowEmpty = true } = {}) {
  if (typeof v !== "string") bad("bad_type", `${path} must be text`, path);
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/ {2,}/g, " ").trim();
  if (s.length > max) bad("too_long", `${path} is too long (max ${max} characters)`, path);
  if (!allowEmpty && s.length < Math.max(1, min)) bad("empty", `${path} is required`, path);
  return s;
}

function numIn(v, path, min, max) {
  if (typeof v !== "number" || !Number.isFinite(v)) bad("bad_number", `${path} must be a finite number`, path);
  if (v < min || v > max) bad("out_of_range", `${path} must be between ${min} and ${max}`, path);
  return v;
}

function bool(v, path) { if (typeof v !== "boolean") bad("bad_type", `${path} must be true or false`, path); return v; }

function isoDate(v, path, nullable = true) {
  if (v === null || v === undefined) { if (nullable) return null; bad("empty", `${path} is required`, path); }
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/.test(v) || Number.isNaN(Date.parse(v))) {
    bad("bad_date", `${path} must be an ISO date`, path);
  }
  return v;
}

function id(kind, v, path) {
  if (typeof v !== "string" || !ID_RE[kind].test(v)) bad("bad_id", `${path} is not a valid identifier`, path);
  return v;
}

function oneOf(v, list, path) {
  if (!list.includes(v)) bad("bad_value", `${path} must be one of ${list.join(", ")}`, path);
  return v;
}

const SRC_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/i;
function src(v, path) {
  if (typeof v !== "string" || !SRC_RE.test(v)) bad("bad_value", `${path} must be a short source label`, path);
  return v.toLowerCase();
}

export function normalizeTickerText(t) { return String(t ?? "").trim().toUpperCase(); }
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;
export const TICKER_RE_PUBLIC = TICKER_RE;

// ---------- holdings ----------
// Every value field carries provenance: { v, src, asOf, manual }.
//   src    who produced the value: a provider ("tiingo", "yahoo"), "seed" (starter estimate), "csv", "user" or "legacy"
//   asOf   date of the provider observation, or null when unknown
//   manual true when the user set it; manual values are protected from provider refreshes
export const SCHEDULE_BASES = ["ex-date", "user", "unknown"];

function field(raw, path, valueFn, extra) {
  if (!isObj(raw)) bad("bad_type", `${path} must be an object`, path);
  const out = {
    v: valueFn(raw.v, `${path}.v`),
    src: src(raw.src ?? "user", `${path}.src`),
    asOf: isoDate(raw.asOf ?? null, `${path}.asOf`),
    manual: raw.manual === undefined ? false : bool(raw.manual, `${path}.manual`),
  };
  if (extra) Object.assign(out, extra(raw, path));
  return out;
}

function validateHolding(raw, i) {
  const p = `holdings[${i}]`;
  if (!isObj(raw)) bad("bad_type", `${p} must be an object`, p);
  const ticker = normalizeTickerText(str(raw.ticker, `${p}.ticker`, { max: 15, allowEmpty: false }));
  if (!TICKER_RE.test(ticker)) bad("bad_ticker", `${p}.ticker "${ticker}" is not a valid symbol`, `${p}.ticker`);
  const f = isObj(raw.fields) ? raw.fields : bad("bad_type", `${p}.fields must be an object`, `${p}.fields`);
  return {
    id: raw.id === undefined ? newId("h") : id("h", raw.id, `${p}.id`),
    ticker,
    name: raw.name === undefined ? "" : str(raw.name, `${p}.name`, { max: 120 }),
    shares: numIn(raw.shares, `${p}.shares`, 0, LIMITS.maxShares),
    fields: {
      price: field(f.price, `${p}.fields.price`, (v, q) => numIn(v, q, 0, LIMITS.maxPrice)),
      dividend: field(f.dividend, `${p}.fields.dividend`, (v, q) => numIn(v, q, 0, LIMITS.maxDividend), (r, q) => ({
        basis: r.basis === undefined || r.basis === null ? null : oneOf(r.basis, ["trailing", "indicated"], `${q}.basis`),
      })),
      // exDate: last ex-dividend date the provider reported. payDate: actual cash date, null unless a permitted source supplies it.
      // They are distinct on purpose: months derived from ex-dates are estimates of when cash arrives.
      schedule: field(f.schedule, `${p}.fields.schedule`, (v, q) => oneOf(v, Object.keys(SCHED), q), (r, q) => ({
        basis: oneOf(r.basis ?? "unknown", SCHEDULE_BASES, `${q}.basis`),
        exDate: isoDate(r.exDate ?? null, `${q}.exDate`),
        payDate: isoDate(r.payDate ?? null, `${q}.payDate`),
      })),
      tax: field(f.tax, `${p}.fields.tax`, bool),
    },
  };
}

// ---------- receipts (frozen snapshots; created from V3 onwards but part of the schema now) ----------
export function validateReceipt(raw, i) {
  const p = `snapshots[${i}]`;
  if (!isObj(raw)) bad("bad_type", `${p} must be an object`, p);
  const holdings = Array.isArray(raw.holdings) ? raw.holdings : bad("bad_type", `${p}.holdings must be a list`, `${p}.holdings`);
  if (holdings.length > LIMITS.maxHoldings) bad("too_many", `${p} has too many holdings`, `${p}.holdings`);
  const a = isObj(raw.assumptions) ? raw.assumptions : bad("bad_type", `${p}.assumptions must be an object`, `${p}.assumptions`);
  const o = isObj(raw.outputs) ? raw.outputs : bad("bad_type", `${p}.outputs must be an object`, `${p}.outputs`);
  const da = isObj(raw.dataAsOf) ? raw.dataAsOf : {};
  const months = Array.isArray(o.monthly) && o.monthly.length === 12 ? o.monthly : bad("bad_type", `${p}.outputs.monthly must list 12 months`, `${p}.outputs.monthly`);
  const goal = (v, q) => (v === null ? null : numIn(v, q, 0, 600));
  return {
    id: id("rc", raw.id, `${p}.id`),
    portfolioId: id("pf", raw.portfolioId, `${p}.portfolioId`),
    portfolioName: str(raw.portfolioName ?? "", `${p}.portfolioName`, { max: LIMITS.maxName }),
    originRevisionId: id("rv", raw.originRevisionId, `${p}.originRevisionId`),
    capturedAt: isoDate(raw.capturedAt, `${p}.capturedAt`, false),
    label: raw.label === undefined || raw.label === null ? "" : str(raw.label, `${p}.label`, { max: 120 }),
    formulaVersion: str(raw.formulaVersion ?? "", `${p}.formulaVersion`, { max: 24, allowEmpty: false }),
    dataAsOf: {
      oldest: isoDate(da.oldest ?? null, `${p}.dataAsOf.oldest`),
      newest: isoDate(da.newest ?? null, `${p}.dataAsOf.newest`),
      sources: (Array.isArray(da.sources) ? da.sources : []).slice(0, 8).map((s, k) => src(s, `${p}.dataAsOf.sources[${k}]`)),
    },
    holdings: holdings.map((h, k) => {
      const q = `${p}.holdings[${k}]`;
      if (!isObj(h)) bad("bad_type", `${q} must be an object`, q);
      const t = normalizeTickerText(str(h.ticker, `${q}.ticker`, { max: 15, allowEmpty: false }));
      if (!TICKER_RE.test(t)) bad("bad_ticker", `${q}.ticker is not a valid symbol`, `${q}.ticker`);
      const prov = (r, name) => (isObj(r) ? { src: src(r.src ?? "user", `${q}.${name}.src`), asOf: isoDate(r.asOf ?? null, `${q}.${name}.asOf`), manual: !!r.manual } : { src: "user", asOf: null, manual: false });
      return {
        ticker: t,
        name: h.name === undefined ? "" : str(h.name, `${q}.name`, { max: 120 }),
        shares: numIn(h.shares, `${q}.shares`, 0, LIMITS.maxShares),
        price: numIn(h.price, `${q}.price`, 0, LIMITS.maxPrice),
        dividend: numIn(h.dividend, `${q}.dividend`, 0, LIMITS.maxDividend),
        schedule: oneOf(h.schedule, Object.keys(SCHED), `${q}.schedule`),
        qualified: bool(h.qualified, `${q}.qualified`),
        provenance: isObj(h.provenance)
          ? { price: prov(h.provenance.price, "provenance.price"), dividend: prov(h.provenance.dividend, "provenance.dividend"), schedule: prov(h.provenance.schedule, "provenance.schedule") }
          : undefined,
      };
    }).map((h) => { if (h.provenance === undefined) delete h.provenance; return h; }),
    assumptions: normalizeSettings(a, `${p}.assumptions`),
    outputs: {
      value: numIn(o.value, `${p}.outputs.value`, 0, LIMITS.maxMoney),
      income: numIn(o.income, `${p}.outputs.income`, 0, LIMITS.maxMoney),
      yield: numIn(o.yield, `${p}.outputs.yield`, 0, 1000),
      monthly: months.map((m, k) => numIn(m, `${p}.outputs.monthly[${k}]`, 0, LIMITS.maxMoney)),
      goalMonthsExpected: goal(o.goalMonthsExpected ?? null, `${p}.outputs.goalMonthsExpected`),
      goalMonthsSlow: goal(o.goalMonthsSlow ?? null, `${p}.outputs.goalMonthsSlow`),
    },
  };
}

// ---------- settings ----------
// Missing keys fall back to defaults (older/newer files); present-but-invalid keys are rejected.
// Bounds for each scenario setting. Typed values are clamped to these so the app can never write a packet it cannot read back.
export const SETTING_RANGE = {
  target: [0, 1e7], contrib: [0, 1e7], growth: [0, 50], slow: [0, 50], cutPct: [0, 100], addAmt: [0, 1e9], qRate: [0, 100], oRate: [0, 100], stRate: [0, 100],
};
export function clampSetting(key, v) {
  const r = SETTING_RANGE[key];
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!r) return v;
  return Number.isFinite(n) ? Math.min(r[1], Math.max(r[0], n)) : r[0];
}

export function normalizeSettings(raw, path = "settings") {
  const s = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  const pick = (k, fn) => (s[k] === undefined ? d[k] : fn(s[k], `${path}.${k}`));
  const tick = (v, q) => { const t = normalizeTickerText(str(v, q, { max: 15 })); if (t && !TICKER_RE.test(t)) bad("bad_ticker", `${q} is not a valid symbol`, q); return t; };
  return {
    target: pick("target", (v, q) => numIn(v, q, 0, 1e7)),
    contrib: pick("contrib", (v, q) => numIn(v, q, 0, 1e7)),
    growth: pick("growth", (v, q) => numIn(v, q, 0, 50)),
    slow: pick("slow", (v, q) => numIn(v, q, 0, 50)),
    reinvest: pick("reinvest", bool),
    cutT: pick("cutT", tick),
    cutPct: pick("cutPct", (v, q) => numIn(v, q, 0, 100)),
    addT: pick("addT", tick),
    addAmt: pick("addAmt", (v, q) => numIn(v, q, 0, 1e9)),
    qRate: pick("qRate", (v, q) => numIn(v, q, 0, 100)),
    oRate: pick("oRate", (v, q) => numIn(v, q, 0, 100)),
    stRate: pick("stRate", (v, q) => numIn(v, q, 0, 100)),
    dividendBasis: pick("dividendBasis", (v, q) => oneOf(v, ["trailing", "indicated"], q)),
  };
}

// ---------- packet ----------
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export function checksumOf(rawWithoutChecksum) { return sha256Hex(canonicalJson(rawWithoutChecksum)); }

export function newPacket({ name = "My portfolio", now = new Date().toISOString() } = {}) {
  const rev = newId("rv");
  return {
    format: FORMAT, schemaVersion: SCHEMA_VERSION,
    portfolioId: newId("pf"), portfolioName: name,
    revisionId: rev, parentRevisionId: null, lineage: [rev],
    createdAt: now, savedAt: now,
    app: { name: "Payout Lab", version: APP_VERSION },
    holdings: [], settings: { ...DEFAULT_SETTINGS }, snapshots: [],
  };
}

// Validate an already-parsed object and rebuild it from whitelisted fields.
export function validatePacket(raw) {
  if (!isObj(raw)) bad("not_packet", "This file is not a Payout Lab packet.");
  if (raw.format !== FORMAT) bad("not_packet", "This file is not a Payout Lab packet.");
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) bad("bad_version", "This packet has no valid version number.");
  if (raw.schemaVersion > SCHEMA_VERSION) {
    bad("future_version", `This packet was saved by a newer version of Payout Lab (format ${raw.schemaVersion}; this site reads up to ${SCHEMA_VERSION}). Nothing was changed. Open the newest version of the site to read it.`);
  }
  const holdingsRaw = Array.isArray(raw.holdings) ? raw.holdings : bad("bad_type", "holdings must be a list", "holdings");
  if (holdingsRaw.length > LIMITS.maxHoldings) bad("too_many", `Too many holdings (max ${LIMITS.maxHoldings})`, "holdings");
  const snapsRaw = raw.snapshots === undefined ? [] : Array.isArray(raw.snapshots) ? raw.snapshots : bad("bad_type", "snapshots must be a list", "snapshots");
  if (snapsRaw.length > LIMITS.maxSnapshots) bad("too_many", `Too many saved reports (max ${LIMITS.maxSnapshots})`, "snapshots");

  const revisionId = id("rv", raw.revisionId, "revisionId");
  let lineage = raw.lineage === undefined ? [revisionId] : Array.isArray(raw.lineage) ? raw.lineage.map((x, k) => id("rv", x, `lineage[${k}]`)) : bad("bad_type", "lineage must be a list", "lineage");
  if (lineage.length > LIMITS.maxLineage) lineage = lineage.slice(-LIMITS.maxLineage);
  if (lineage[lineage.length - 1] !== revisionId) lineage = [...lineage, revisionId].slice(-LIMITS.maxLineage);

  const holdings = holdingsRaw.map(validateHolding);
  const seen = new Set();
  for (const h of holdings) {
    if (seen.has(h.ticker)) bad("duplicate_ticker", `${h.ticker} appears more than once`, "holdings");
    seen.add(h.ticker);
  }
  const snapshots = snapsRaw.map(validateReceipt);
  const snapIds = new Set();
  for (const s of snapshots) { if (snapIds.has(s.id)) bad("duplicate_receipt", "A saved report appears twice", "snapshots"); snapIds.add(s.id); }

  const packet = {
    format: FORMAT, schemaVersion: SCHEMA_VERSION,
    portfolioId: id("pf", raw.portfolioId, "portfolioId"),
    portfolioName: str(raw.portfolioName ?? "", "portfolioName", { max: LIMITS.maxName }) || "My portfolio",
    revisionId,
    parentRevisionId: raw.parentRevisionId === null || raw.parentRevisionId === undefined ? null : id("rv", raw.parentRevisionId, "parentRevisionId"),
    lineage,
    createdAt: isoDate(raw.createdAt, "createdAt", false),
    savedAt: isoDate(raw.savedAt, "savedAt", false),
    app: { name: "Payout Lab", version: isObj(raw.app) && typeof raw.app.version === "string" ? raw.app.version.slice(0, 20) : "" },
    holdings,
    settings: normalizeSettings(raw.settings),
    snapshots,
  };
  if (isObj(raw.origin)) {
    packet.origin = { portfolioId: id("pf", raw.origin.portfolioId, "origin.portfolioId"), revisionId: id("rv", raw.origin.revisionId, "origin.revisionId"), relation: "copy" };
  }
  return packet;
}

// Parse the text of a .payout file. Returns { ok, packet, warnings } or { ok:false, error }. Never throws.
export function parsePacketText(text) {
  try {
    if (typeof text !== "string") bad("not_packet", "This file could not be read as text.");
    if (text.length > LIMITS.maxChars) bad("too_large", "This file is too large to be a portfolio packet.");
    let raw;
    try { raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); } catch { bad("bad_json", "This file is not valid packet data (it could not be read as JSON)."); }
    const packet = validatePacket(raw);
    const warnings = [];
    if (isObj(raw) && isObj(raw.checksum)) {
      const { checksum, ...rest } = raw;
      if (checksum.alg === "sha-256" && typeof checksum.value === "string" && checksumOf(rest) !== checksum.value.toLowerCase()) {
        warnings.push({ code: "checksum_mismatch", message: "The file changed after it was saved. That can mean accidental damage or a deliberate edit. Check the summary before opening it." });
      }
    } else warnings.push({ code: "no_checksum", message: "This file has no integrity check." });
    return { ok: true, packet, warnings };
  } catch (e) {
    if (e instanceof PacketError) return { ok: false, error: { code: e.code, message: e.message, path: e.path } };
    return { ok: false, error: { code: "unexpected", message: "This file could not be opened.", path: "" } };
  }
}

// Serialize with an integrity checksum. The checksum detects accidental damage only; it is not a signature.
export function serializePacket(packet) {
  const body = JSON.parse(JSON.stringify(packet));
  return JSON.stringify({ ...body, checksum: { alg: "sha-256", value: checksumOf(body) } }, null, 1) + "\n";
}

// ---------- revisions ----------
// Create the next revision of a working copy.
export function nextRevision(packet, now = new Date().toISOString()) {
  const revisionId = newId("rv");
  return { ...packet, revisionId, parentRevisionId: packet.revisionId, lineage: [...packet.lineage, revisionId].slice(-LIMITS.maxLineage), savedAt: now };
}

// How does an incoming packet relate to the copy we already have?
export function compareRevisions(local, incoming) {
  if (local.portfolioId !== incoming.portfolioId) return "different-portfolio";
  if (local.revisionId === incoming.revisionId) return "identical";
  if (incoming.lineage.includes(local.revisionId)) return "incoming-newer";
  if (local.lineage.includes(incoming.revisionId)) return "incoming-older";
  return "diverged";
}

// A separate copy of an incoming packet: new identity, remembers where it came from.
export function asSeparateCopy(packet, { suffix = " (copy)", now = new Date().toISOString() } = {}) {
  const rev = newId("rv");
  const name = `${packet.portfolioName}${suffix}`.slice(0, LIMITS.maxName);
  return {
    ...packet, portfolioId: newId("pf"), portfolioName: name, revisionId: rev, parentRevisionId: null, lineage: [rev],
    createdAt: now, savedAt: now, origin: { portfolioId: packet.portfolioId, revisionId: packet.revisionId, relation: "copy" },
    snapshots: packet.snapshots.map((s) => ({ ...s })),
  };
}

export function summarize(packet) {
  return {
    name: packet.portfolioName, holdings: packet.holdings.length,
    tickers: packet.holdings.map((h) => h.ticker),
    savedAt: packet.savedAt, revisionId: packet.revisionId, snapshots: packet.snapshots.length,
  };
}

export function slug(name) {
  return (String(name).normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40)) || "portfolio";
}

export function packetFileName(packet) {
  const d = packet.savedAt.slice(0, 10).replace(/-/g, "");
  return `${slug(packet.portfolioName)}-${d}-${packet.revisionId.slice(3, 9)}${FILE_EXTENSION}`;
}

// ---------- legacy (payoutlab.v1) migration ----------
function clampNum(v, min, max, fallback) { const n = typeof v === "string" ? parseFloat(v) : v; return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }

// Convert the V1 localStorage object into a packet. Lenient: bad rows are skipped and reported, never fatal.
export function migrateLegacyV1(raw, { now = new Date().toISOString(), name = "My portfolio" } = {}) {
  const skipped = [];
  const packet = newPacket({ name, now });
  const seen = new Set();
  for (const h of Array.isArray(raw?.holdings) ? raw.holdings : []) {
    const ticker = normalizeTickerText(h?.t);
    if (!TICKER_RE.test(ticker) || seen.has(ticker) || packet.holdings.length >= LIMITS.maxHoldings) { skipped.push(String(h?.t ?? "?")); continue; }
    seen.add(ticker);
    const manual = !!h.manual;
    const mk = (v, max) => ({ v: clampNum(v, 0, max, 0), src: manual ? "user" : "legacy", asOf: null, manual });
    packet.holdings.push({
      id: newId("h"), ticker, name: typeof h.n === "string" ? h.n.slice(0, 120) : "",
      shares: clampNum(h.shares, 0, LIMITS.maxShares, 0),
      fields: {
        price: mk(h.price, LIMITS.maxPrice),
        dividend: { ...mk(h.div, LIMITS.maxDividend), basis: null },
        schedule: { v: Object.keys(SCHED).includes(h.s) ? h.s : "Q3", src: manual ? "user" : "legacy", asOf: null, manual, basis: manual ? "user" : "unknown", exDate: null, payDate: null },
        tax: { v: h.q !== false, src: manual ? "user" : "legacy", asOf: null, manual },
      },
    });
  }
  const s = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (raw && raw[k] !== undefined) s[k] = raw[k];
  const d = DEFAULT_SETTINGS;
  packet.settings = {
    target: clampNum(s.target, 0, 1e7, d.target), contrib: clampNum(s.contrib, 0, 1e7, d.contrib),
    growth: clampNum(s.growth, 0, 50, d.growth), slow: clampNum(s.slow, 0, 50, d.slow),
    reinvest: typeof s.reinvest === "boolean" ? s.reinvest : d.reinvest,
    cutT: TICKER_RE.test(normalizeTickerText(s.cutT)) ? normalizeTickerText(s.cutT) : "", cutPct: clampNum(s.cutPct, 0, 100, d.cutPct),
    addT: TICKER_RE.test(normalizeTickerText(s.addT)) ? normalizeTickerText(s.addT) : "", addAmt: clampNum(s.addAmt, 0, 1e9, d.addAmt),
    qRate: clampNum(s.qRate, 0, 100, d.qRate), oRate: clampNum(s.oRate, 0, 100, d.oRate), stRate: clampNum(s.stRate, 0, 100, d.stRate),
    dividendBasis: "trailing",
  };
  return { packet, skipped };
}
