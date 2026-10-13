// Browser-only holdings import: a strict CSV parser, column mapping, row validation and an import plan.
// Files are read locally and never uploaded. Only the columns the user maps are read; everything else is discarded
// (account numbers and other identifying columns are never stored, shown or exported). This is a holdings import,
// not a transaction ledger or a broker connection.
import { LIMITS, TICKER_RE_PUBLIC } from "./packet.js";
import { SCHED } from "./calc.js";
import { holdingFromMarket, lookup, manualHolding, resolveTicker } from "./market.js";

export const CSV_LIMITS = { maxChars: 5 * 1024 * 1024, maxRows: 5000, maxCols: 60, maxCell: 500, previewRows: 50 };

// ---------- parser ----------
// RFC 4180 style: quoted fields may contain delimiters, doubled quotes and line breaks. Handles BOM, CRLF, LF and CR.
export function parseCsv(text) {
  if (typeof text !== "string") return fail("bad_input", "That file could not be read as text.");
  if (text.length > CSV_LIMITS.maxChars) return fail("too_large", "That file is too large to be a holdings list.");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (/\u0000/.test(text)) return fail("binary", "That does not look like a text CSV file.");

  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [], cell = "", inQ = false, i = 0, cellStarted = false;
  const push = () => { row.push(cell.trim()); cell = ""; cellStarted = false; };
  const endRow = () => {
    push();
    if (row.some((c) => c !== "")) {
      if (row.length > CSV_LIMITS.maxCols) throw err("too_many_columns", `That file has more than ${CSV_LIMITS.maxCols} columns.`);
      rows.push(row);
      if (rows.length > CSV_LIMITS.maxRows + 1) throw err("too_many_rows", `That file has more than ${CSV_LIMITS.maxRows} rows.`);
    }
    row = [];
  };
  try {
    for (; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
      } else if (ch === '"' && !cellStarted) { inQ = true; cellStarted = true; }
      else if (ch === delimiter) push();
      else if (ch === "\n") endRow();
      else if (ch === "\r") { if (text[i + 1] === "\n") i++; endRow(); }
      else { cell += ch; cellStarted = true; }
      if (cell.length > CSV_LIMITS.maxCell) throw err("cell_too_long", "A cell in that file is far too long to be a holding.");
    }
    if (inQ) throw err("bad_quote", "That file has an opening quote that never closes. Nothing was imported.");
    if (cell !== "" || row.length) endRow();
  } catch (e) { if (e.code) return { ok: false, error: { code: e.code, message: e.message } }; throw e; }

  if (rows.length < 2) return fail("empty", "That file has no data rows.");
  const h = findHeaderRow(rows);
  return { ok: true, delimiter, headers: rows[h], rows: rows.slice(h + 1), skippedPreamble: h };
}

const err = (code, message) => Object.assign(new Error(message), { code });
const fail = (code, message) => ({ ok: false, error: { code, message } });

function detectDelimiter(text) {
  // Look at the first non-empty line outside quotes.
  let inQ = false, line = "";
  for (const ch of text) {
    if (ch === '"') inQ = !inQ;
    if (!inQ && (ch === "\n" || ch === "\r")) { if (line.trim()) break; line = ""; continue; }
    line += ch;
    if (line.length > 4000) break;
  }
  const n = (c) => line.split(c).length - 1;
  const counts = [[",", n(",")], [";", n(";")], ["\t", n("\t")]].sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

// ---------- columns ----------
export const FIELDS = [
  { key: "ticker", label: "Ticker", required: true },
  { key: "shares", label: "Shares", required: true },
  { key: "name", label: "Name", required: false },
  { key: "currency", label: "Currency", required: false },
  { key: "price", label: "Price", required: false },
  { key: "dividend", label: "Annual dividend per share", required: false },
  { key: "schedule", label: "Pay schedule", required: false },
];

const ALIASES = {
  ticker: ["ticker", "symbol", "instrument", "ticker symbol", "stock symbol", "security symbol"],
  shares: ["shares", "quantity", "qty", "units", "share count", "number of shares"],
  name: ["name", "security name", "description", "security description", "company", "company name"],
  currency: ["currency", "ccy"],
  price: ["price", "last price", "share price", "market price", "last"],
  dividend: ["annual dividend", "annual dividend per share", "dividend per share", "dividend share", "dividend per year", "yearly dividend", "annual_dividend", "annual dividend share"],
  schedule: ["schedule", "pay schedule", "payment schedule", "pays", "frequency", "payout schedule"],
};
const PRIVATE_RE = /account|acct|owner|ssn|social|tax ?id|taxpayer|email|e-mail|phone|address|birth|dob|routing|iban|swift|customer|client|holder|member/i;
const norm = (h) => String(h).toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

export function privateColumns(headers) { return headers.map((h, i) => (PRIVATE_RE.test(h) ? i : -1)).filter((i) => i >= 0); }

// Guess the mapping from header names only. These are guesses for the user to confirm, not a list of supported brokers.
export function guessMapping(headers) {
  const priv = new Set(privateColumns(headers));
  const hs = headers.map(norm);
  const map = {};
  for (const f of FIELDS) {
    let at = -1;
    for (const a of ALIASES[f.key]) { const j = hs.findIndex((h, i) => h === norm(a) && !priv.has(i) && !Object.values(map).includes(i)); if (j >= 0) { at = j; break; } }
    map[f.key] = at;
  }
  return map;
}

// Preamble lines before the real header (titles, account banners) are dropped so they cannot leak into anything.
function findHeaderRow(rows) {
  for (let r = 0; r < Math.min(rows.length - 1, 12); r++) {
    const m = guessMapping(rows[r]);
    if (m.ticker >= 0 && m.shares >= 0) return r;
  }
  return 0;
}

// ---------- values ----------
export function parseNumber(raw) {
  let s = String(raw ?? "").trim();
  if (s === "") return { empty: true };
  s = s.replace(/[$€£¥\s]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return { error: "not a number" };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: "not a finite number" };
  return { value: neg ? -n : n };
}

const SCHEDULE_WORDS = { monthly: "M", semiannual: "S", "semi annual": "S", "semi-annual": "S", biannual: "S", "twice a year": "S", "2x a year": "S", annual: "A", annually: "A", yearly: "A", "once a year": "A" };
export function parseSchedule(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { empty: true };
  const code = s.toUpperCase();
  if (Object.keys(SCHED).includes(code)) return { value: code };
  const w = SCHEDULE_WORDS[s.toLowerCase()];
  if (w) return { value: w };
  if (/^quarterly$/i.test(s)) return { warning: 'A "quarterly" schedule does not say which months. Use Q1, Q2 or Q3 to choose them. Schedule was not applied.' };
  return { warning: `Schedule "${s.slice(0, 20)}" was not recognised and was not applied. Use M, Q1, Q2, Q3, S or A.` };
}

// ---------- rows ----------
export function parseRows(rows, mapping) {
  const out = [];
  rows.forEach((cells, idx) => {
    const cell = (k) => (mapping[k] >= 0 ? (cells[mapping[k]] ?? "").trim() : "");
    const r = { row: idx + 1, ticker: "", aliasOf: null, shares: 0, name: "", price: null, dividend: null, schedule: null, errors: [], warnings: [], known: false };
    const raw = cell("ticker").toUpperCase();
    if (!raw) r.errors.push("No ticker.");
    else if (!TICKER_RE_PUBLIC.test(raw)) r.errors.push(`"${raw.slice(0, 20)}" is not a valid ticker symbol.`);
    else { const t = resolveTicker(raw); r.ticker = t.ticker; r.aliasOf = t.aliasOf; r.known = !!lookup(t.ticker); }

    const sh = parseNumber(cell("shares"));
    if (sh.empty) r.errors.push("No share count.");
    else if (sh.error) r.errors.push(`Shares "${cell("shares").slice(0, 20)}" is ${sh.error}.`);
    else if (sh.value <= 0) r.errors.push("Shares must be more than 0.");
    else if (sh.value > LIMITS.maxShares) r.errors.push("Share count is unrealistically large.");
    else r.shares = sh.value;

    const num = (key, label, max) => {
      const p = parseNumber(cell(key));
      if (p.empty) return;
      if (p.error) r.errors.push(`${label} "${cell(key).slice(0, 20)}" is ${p.error}.`);
      else if (p.value < 0) r.errors.push(`${label} cannot be negative.`);
      else if (p.value > max) r.errors.push(`${label} is unrealistically large.`);
      else r[key] = p.value;
    };
    num("price", "Price", LIMITS.maxPrice);
    num("dividend", "Annual dividend", LIMITS.maxDividend);
    const sc = parseSchedule(cell("schedule"));
    if (sc.value) r.schedule = sc.value; else if (sc.warning) r.warnings.push(sc.warning);
    // An export defuses formula-looking text with a leading apostrophe; take it back off so names round-trip.
    r.name = cell("name").replace(/^'(?=[=+\-@\t\r])/, "").slice(0, 120);
    const cur = cell("currency").toUpperCase();
    if (cur && cur !== "USD") r.warnings.push(`Currency ${cur.slice(0, 5)}: Payout Lab works in US dollars and does not convert.`);
    if (r.aliasOf) r.warnings.push(`${r.aliasOf} was matched to ${r.ticker}.`);
    out.push(r);
  });
  return out;
}

// Duplicate symbols in one file (several lots or accounts) are combined deterministically: shares add up, the first value wins.
export function consolidate(parsed) {
  const good = new Map(); let invalid = 0, merged = 0;
  for (const r of parsed) {
    if (r.errors.length) { invalid++; continue; }
    const g = good.get(r.ticker);
    if (!g) { good.set(r.ticker, { ...r, rows: [r.row], warnings: [...r.warnings] }); continue; }
    merged++;
    g.shares += r.shares; g.rows.push(r.row);
    for (const k of ["price", "dividend", "schedule", "name"]) {
      if (g[k] === null || g[k] === "") g[k] = r[k];
      else if (k !== "name" && r[k] !== null && r[k] !== "" && r[k] !== g[k]) g.warnings.push(`Rows ${g.rows.join(", ")} give different ${k} values. The first was kept.`);
    }
  }
  let list = [...good.values()];
  for (const g of list) if (g.rows.length > 1) g.warnings.unshift(`${g.ticker} appears on rows ${g.rows.join(", ")}. Shares were added together.`);
  // Combined lots must stay inside the same limits as a single row; otherwise the packet could not be reopened.
  const over = list.filter((g) => g.shares > LIMITS.maxShares);
  if (over.length) { invalid += over.length; list = list.filter((g) => g.shares <= LIMITS.maxShares); }
  return { rows: list, invalid, merged, overLimit: over.map((g) => g.ticker) };
}

// ---------- plan ----------
export const MODES = {
  set: "Update shares from the file (keep holdings that are not in it)",
  replace: "Replace all holdings with the file",
  add: "Add the file's shares to what I already have",
};

export function buildImportPlan(packet, rows, mode) {
  const existing = new Map(packet.holdings.map((h) => [h.ticker, h]));
  const items = rows.map((r) => {
    const h = existing.get(r.ticker);
    const own = ["price", "dividend", "schedule"].filter((k) => r[k] !== null && r[k] !== "");
    if (!h) return { ticker: r.ticker, action: "new", from: 0, to: r.shares, own, known: r.known };
    const to = Math.min(LIMITS.maxShares, mode === "add" ? h.shares + r.shares : r.shares);
    return { ticker: r.ticker, action: Math.abs(to - h.shares) < 1e-9 && !own.length ? "same" : mode === "add" ? "increase" : "update", from: h.shares, to, own, known: r.known };
  });
  const inFile = new Set(rows.map((r) => r.ticker));
  const removed = mode === "replace" ? packet.holdings.filter((h) => !inFile.has(h.ticker)).map((h) => ({ ticker: h.ticker, shares: h.shares })) : [];
  const total = mode === "replace" ? rows.length : new Set([...existing.keys(), ...inFile]).size;
  const counts = { new: 0, update: 0, increase: 0, same: 0, removed: removed.length, ownValues: items.filter((i) => i.own.length).length, unknown: items.filter((i) => i.action === "new" && !i.known && !i.own.includes("price")).length };
  for (const i of items) counts[i.action]++;
  return { mode, items, removed, counts, total, tooMany: total > LIMITS.maxHoldings };
}

// Apply a plan. Values from the file become the user's own (src "csv", manual) and never carry a provider label.
export function applyImportPlan(packet, rows, plan) {
  const basis = packet.settings.dividendBasis;
  if (plan.mode === "replace") {
    const keep = new Set(rows.map((r) => r.ticker));
    packet.holdings = packet.holdings.filter((h) => keep.has(h.ticker));
  }
  for (const r of rows) {
    let h = packet.holdings.find((x) => x.ticker === r.ticker);
    if (!h) {
      const e = lookup(r.ticker);
      h = e ? holdingFromMarket(r.ticker, 0, e, basis) : manualHolding(r.ticker, 0);
      packet.holdings.push(h);
      h.shares = r.shares;
    } else h.shares = plan.mode === "add" ? Math.min(LIMITS.maxShares, h.shares + r.shares) : r.shares;
    if (r.name && !h.name) h.name = r.name;
    const mine = (f, v, extra = {}) => { f.v = v; f.src = "csv"; f.asOf = null; f.manual = true; Object.assign(f, extra); };
    if (r.price !== null) mine(h.fields.price, r.price);
    if (r.dividend !== null) mine(h.fields.dividend, r.dividend, { basis: null });
    if (r.schedule) mine(h.fields.schedule, r.schedule, { basis: "user", exDate: null, payDate: null });
  }
  return plan.counts;
}

// ---------- template and export ----------
const HEADER = ["ticker", "shares", "name", "currency", "price", "annual_dividend", "schedule"];
export const TEMPLATE_CSV = [
  HEADER.join(","),
  "SCHD,100,Schwab US Dividend Equity ETF,USD,,,",
  "O,50.5,Realty Income,USD,,,",
  "MYFUND,10,My own fund,USD,25.00,1.20,Q1",
].join("\r\n") + "\r\n";

// Spreadsheet programs run text that starts with = + - @ (or a tab/CR) as a formula. Defuse it with a leading apostrophe.
export function neutralize(s) {
  const t = String(s ?? "");
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
}
const q = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// Holdings only (ticker, shares, name): re-importing your own export never turns provider values into "yours".
export function holdingsToCsv(packet) {
  const lines = [["ticker", "shares", "name", "currency"].join(",")];
  for (const h of packet.holdings) lines.push([q(neutralize(h.ticker)), String(h.shares), q(neutralize(h.name)), "USD"].join(","));
  return lines.join("\r\n") + "\r\n";
}
