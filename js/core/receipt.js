// Report receipts: an immutable, dated copy of a portfolio and what it produced, plus comparison that explains changes.
// A receipt freezes holdings, where each value came from, the assumptions, the outputs and the formula version. Opening a
// receipt never applies today's data to it, and comparing never touches the working portfolio.
import { LIMITS, canonicalJson, checksumOf, newId, validateReceipt, PacketError } from "./packet.js";
import { FORMULA_VERSION, MONTHS, calendar, simulate, totals } from "./calc.js";

// ---------- build ----------
export function buildReceipt(packet, { label = "", now = new Date().toISOString() } = {}) {
  const hs = packet.holdings.map((h) => ({ t: h.ticker, n: h.name, shares: h.shares, price: h.fields.price.v, div: h.fields.dividend.v, s: h.fields.schedule.v, q: h.fields.tax.v }));
  const T = totals(hs), S = packet.settings;
  const dates = [], sources = new Set();
  const holdings = packet.holdings.map((h) => {
    const prov = (f) => ({ src: f.src, asOf: f.asOf, manual: f.manual });
    for (const f of [h.fields.price, h.fields.dividend, h.fields.schedule]) { if (!f.manual && f.asOf) dates.push(f.asOf); if (!f.manual) sources.add(f.src); }
    return { ticker: h.ticker, name: h.name, shares: h.shares, price: h.fields.price.v, dividend: h.fields.dividend.v, schedule: h.fields.schedule.v, qualified: h.fields.tax.v,
      provenance: { price: prov(h.fields.price), dividend: prov(h.fields.dividend), schedule: prov(h.fields.schedule) } };
  });
  dates.sort();
  return {
    id: newId("rc"), portfolioId: packet.portfolioId, portfolioName: packet.portfolioName, originRevisionId: packet.revisionId,
    capturedAt: now, label: String(label || "").slice(0, 120).trim(), formulaVersion: FORMULA_VERSION,
    dataAsOf: { oldest: dates[0] ?? null, newest: dates[dates.length - 1] ?? null, sources: [...sources].filter((s) => /^[a-z0-9][a-z0-9_-]{0,23}$/i.test(s)).slice(0, 8) },
    holdings, assumptions: { ...S },
    outputs: {
      value: T.value, income: T.income, yield: T.yield, monthly: calendar(hs),
      goalMonthsExpected: simulate(T.income, T.yield, S.target, S.contrib, S.growth, S.reinvest),
      goalMonthsSlow: simulate(T.income, T.yield, S.target, S.contrib, S.slow, S.reinvest),
    },
  };
}

export const receiptCalc = (r) => r.holdings.map((h) => ({ t: h.ticker, n: h.name, shares: h.shares, price: h.price, div: h.dividend, s: h.schedule, q: h.qualified }));

// ---------- history ----------
// Add a receipt to a packet's history. Duplicates (same id) are ignored. The caller decides what to do when the history is full:
// it is never trimmed silently.
export function historyIsFull(packet) { return packet.snapshots.length >= LIMITS.maxSnapshots; }
export function addReceipt(packet, receipt, { trimOldest = false } = {}) {
  if (packet.snapshots.some((s) => s.id === receipt.id)) return { added: false, reason: "duplicate" };
  let trimmed = null;
  if (historyIsFull(packet)) {
    if (!trimOldest) return { added: false, reason: "full" };
    const oldest = [...packet.snapshots].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))[0];
    packet.snapshots = packet.snapshots.filter((s) => s.id !== oldest.id);
    trimmed = oldest;
  }
  packet.snapshots.push(receipt);
  packet.snapshots.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  return { added: true, trimmed };
}

// ---------- files ----------
export const RECEIPT_FORMAT = "payout-receipt";
export function serializeReceipt(r) {
  const body = { format: RECEIPT_FORMAT, schemaVersion: 1, receipt: JSON.parse(JSON.stringify(r)) };
  return JSON.stringify({ ...body, checksum: { alg: "sha-256", value: checksumOf(body) } }, null, 1) + "\n";
}
export function parseReceiptText(text) {
  try {
    if (typeof text !== "string" || text.length > 1024 * 1024) throw new PacketError("too_large", "That file is too large to be a report.");
    let raw;
    try { raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); } catch { throw new PacketError("bad_json", "That file is not valid report data."); }
    if (!raw || raw.format !== RECEIPT_FORMAT) throw new PacketError("not_receipt", "That file is not a Payout Lab report.");
    if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) throw new PacketError("bad_version", "That report has no valid version.");
    if (raw.schemaVersion > 1) throw new PacketError("future_version", `That report was made by a newer version of Payout Lab (format ${raw.schemaVersion}). Nothing was changed.`);
    const receipt = validateReceipt(raw.receipt, 0);
    const warnings = [];
    if (raw.checksum?.alg === "sha-256") { const { checksum, ...rest } = raw; if (checksumOf(rest) !== String(checksum.value).toLowerCase()) warnings.push("The file changed after it was saved. That can mean accidental damage or an edit."); }
    return { ok: true, receipt, warnings };
  } catch (e) {
    if (e instanceof PacketError) return { ok: false, error: { code: e.code, message: e.message } };
    return { ok: false, error: { code: "unexpected", message: "That file could not be opened." } };
  }
}

// ---------- compare ----------
const byTicker = (r) => new Map(r.holdings.map((h) => [h.ticker, h]));
const nearly = (x, y) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
const delta = (from, to) => ({ from, to, delta: to - from });

export const ASSUMPTION_LABEL = {
  target: "Monthly income goal", contrib: "Added each month", growth: "Expected dividend growth (%)", slow: "Slow-growth scenario (%)", reinvest: "Reinvest dividends",
  cutT: "Cut test holding", cutPct: "Cut size (%)", addT: "Add-money holding", addAmt: "Add-money amount", qRate: "Qualified rate (%)", oRate: "Ordinary rate (%)", stRate: "State rate (%)", dividendBasis: "Dividend per share means",
};

// Split a change in a sum of (shares x rate) exactly into: holdings (shares changed or holdings added/removed, at the OLD rate),
// market data (rate changed, on the OLD shares) and an explicit overlap (both changed). The three always add up to the total.
function split(a, b, tickers, rate) {
  let holdings = 0, market = 0, overlap = 0;
  for (const t of tickers) {
    const x = a.get(t), y = b.get(t);
    if (x && y) { holdings += (y.shares - x.shares) * rate(x); market += x.shares * (rate(y) - rate(x)); overlap += (y.shares - x.shares) * (rate(y) - rate(x)); }
    else if (y) holdings += y.shares * rate(y);      // new holding: its whole effect is a holdings change
    else holdings -= x.shares * rate(x);             // removed holding
  }
  return { holdings, market, overlap };
}

export function compareReceipts(A, B) {
  const a = byTicker(A), b = byTicker(B);
  const tickers = [...new Set([...a.keys(), ...b.keys()])].sort();
  const rows = tickers.map((t) => {
    const x = a.get(t), y = b.get(t);
    const status = !x ? "added" : !y ? "removed" : (!nearly(x.shares, y.shares) || !nearly(x.price, y.price) || !nearly(x.dividend, y.dividend) || x.schedule !== y.schedule) ? "changed" : "same";
    return { ticker: t, name: (y || x).name, status, shares: [x?.shares ?? 0, y?.shares ?? 0], price: [x?.price ?? null, y?.price ?? null], dividend: [x?.dividend ?? null, y?.dividend ?? null], schedule: [x?.schedule ?? null, y?.schedule ?? null] };
  });
  const income = split(a, b, tickers, (h) => h.dividend), value = split(a, b, tickers, (h) => h.price);
  const oa = A.outputs, ob = B.outputs;
  const sum = (s) => s.holdings + s.market + s.overlap;

  const changedAssumptions = Object.keys(ASSUMPTION_LABEL).filter((k) => A.assumptions[k] !== B.assumptions[k]).map((k) => ({ key: k, label: ASSUMPTION_LABEL[k], from: A.assumptions[k], to: B.assumptions[k] }));

  // Goal timeline: a declared sequence of counterfactual steps. Order matters, so it is stated: holdings, then market data, then assumptions.
  const goalAt = (hs, s) => { const T = totals(hs); return simulate(T.income, T.yield, s.target, s.contrib, s.growth, s.reinvest); };
  const calcA = receiptCalc(A), calcB = receiptCalc(B);
  const step1 = tickers.filter((t) => b.has(t)).map((t) => { const y = b.get(t), x = a.get(t) || y; return { t, shares: y.shares, price: x.price, div: x.dividend, s: x.schedule, q: x.qualified }; });
  const g0 = goalAt(calcA, A.assumptions), g1 = goalAt(step1, A.assumptions), g2 = goalAt(calcB, A.assumptions), g3 = goalAt(calcB, B.assumptions);
  const anyNull = [g0, g1, g2, g3].some((g) => g === null);
  const goal = {
    from: oa.goalMonthsExpected, to: ob.goalMonthsExpected, slow: { from: oa.goalMonthsSlow, to: ob.goalMonthsSlow },
    steps: anyNull ? null : [{ name: "Your holdings", from: g0, to: g1 }, { name: "Market data", from: g1, to: g2 }, { name: "Your assumptions", from: g2, to: g3 }],
    note: anyNull ? "At least one version does not reach the goal within 50 years, so the change cannot be split into steps." : "Steps are applied in this order, so any overlap is counted in the later step.",
  };

  const months = oa.monthly.map((v, i) => ({ month: MONTHS[i], ...delta(v, ob.monthly[i]) }));
  const headline = { income: delta(oa.income, ob.income), monthlyAvg: delta(oa.income / 12, ob.income / 12), value: delta(oa.value, ob.value), yield: delta(oa.yield, ob.yield) };
  const unchanged = rows.every((r) => r.status === "same") && changedAssumptions.length === 0 && nearly(oa.income, ob.income) && nearly(oa.value, ob.value) && goal.from === goal.to;
  return {
    samePortfolio: A.portfolioId === B.portfolioId,
    formulaMatch: A.formulaVersion === B.formulaVersion, formulas: [A.formulaVersion, B.formulaVersion],
    dates: { A: { capturedAt: A.capturedAt, dataAsOf: A.dataAsOf }, B: { capturedAt: B.capturedAt, dataAsOf: B.dataAsOf } },
    headline, months, income: { ...income, total: sum(income) }, value: { ...value, total: sum(value) },
    holdings: rows, assumptions: changedAssumptions, goal, unchanged,
  };
}
export { canonicalJson };
