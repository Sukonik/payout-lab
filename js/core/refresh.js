// Refresh preview: compare a portfolio's values with the latest public data and let the user choose what to apply.
// Market data never rewrites a holding by itself. Your own values (manual) are protected unless you choose to replace them.
import { asOfOf, indicatedAnnual, marketDividend } from "./market.js";

const DAY = 86400000;
export const STALE_DAYS = 7;
const EPS = 1e-6;

const PROVIDER = (e) => { const s = String(e.src || "").toLowerCase(); return s.startsWith("tiingo") ? "tiingo" : s.startsWith("yahoo") ? "yahoo" : null; };
const differs = (a, b) => Math.abs(a - b) > EPS * Math.max(1, Math.abs(a), Math.abs(b));
const ageDays = (asOf, now) => (asOf ? Math.floor((now - Date.parse(asOf + "T00:00:00Z")) / DAY) : null);

export const FIELD_LABEL = { price: "Price", dividend: "Dividend per year", schedule: "Pay schedule" };

// Build the list of proposed changes. Pure: reads the packet and the market, writes nothing.
export function buildRefreshPlan(packet, tickers, { now = Date.now() } = {}) {
  const basis = packet.settings.dividendBasis;
  const rows = [];
  for (let index = 0; index < packet.holdings.length; index++) {
    const h = packet.holdings[index];
    const e = tickers[h.ticker];
    const f = h.fields;
    const row = { ticker: h.ticker, name: h.name, index, holdingId: h.id, changes: [], notes: [], status: "unchanged", obs: null };
    const providerSourced = [f.price, f.dividend, f.schedule].some((x) => !x.manual && PROVIDER({ src: x.src }));

    if (!e || !(e.p > 0)) {
      if (providerSourced) { row.status = "missing"; row.notes.push("No provider data for this ticker right now. Your values were left as they are."); }
      rows.push(row); continue;
    }
    const provider = PROVIDER(e), asOf = asOfOf(e);
    if (!provider || !asOf) {
      // A starter estimate has no observation date, so it can never replace a dated or personal value.
      if (providerSourced) row.notes.push("Only a starter estimate is available now, so nothing was proposed.");
      row.status = providerSourced ? "estimate-only" : "unchanged";
      rows.push(row); continue;
    }
    const age = ageDays(asOf, now);
    row.obs = { provider, asOf, ageDays: age, stale: age > STALE_DAYS };
    if (row.obs.stale) row.notes.push(`The provider's own data is ${age} days old, so a refresh may not help yet.`);

    const prop = (field, newV, extra = {}) => {
      const cur = f[field];
      const same = typeof newV === "number" ? !differs(cur.v, newV) : cur.v === newV;
      const basisChange = field === "dividend" && cur.basis !== basis;
      const newer = !cur.asOf || cur.asOf < asOf || cur.src !== provider;
      if (cur.manual) {
        if (!same) row.changes.push({ key: `${h.id}:${field}`, field, kind: "protected", from: cur.v, to: newV, defaultOn: false, extra });
        return;
      }
      if (!same || basisChange) row.changes.push({ key: `${h.id}:${field}`, field, kind: "update", from: cur.v, to: newV, defaultOn: true, extra });
      else if (newer) row.changes.push({ key: `${h.id}:${field}`, field, kind: "confirm", from: cur.v, to: newV, defaultOn: true, extra });
    };

    prop("price", e.p);
    if (e.est === true) row.notes.push("No provider dividend data for this ticker. Your dividend value was not touched.");
    else prop("dividend", marketDividend(e, basis), { basis });
    prop("schedule", e.s || f.schedule.v, { exDate: typeof e.last === "string" ? e.last : null });

    const real = row.changes.some((c) => c.kind === "update" || c.kind === "protected");
    row.status = row.changes.length ? (real ? "update" : "confirm") : "unchanged";
    rows.push(row);
  }
  const all = rows.flatMap((r) => r.changes);
  return {
    rows, basis,
    counts: {
      update: all.filter((c) => c.kind === "update").length,
      confirm: all.filter((c) => c.kind === "confirm").length,
      protected: all.filter((c) => c.kind === "protected").length,
      missing: rows.filter((r) => r.status === "missing").length,
      staleAtProvider: rows.filter((r) => r.obs?.stale).length,
    },
  };
}

// Apply only the chosen changes. A chosen "protected" change replaces your value and clears the protection.
export function applyRefreshPlan(packet, plan, selected, tickers) {
  const chosen = new Set(selected);
  let applied = 0;
  for (const row of plan.rows) {
    const h = packet.holdings.find((x) => x.id === row.holdingId);
    const e = tickers[row.ticker];
    if (!h || !e) continue;
    const provider = PROVIDER(e), asOf = asOfOf(e);
    for (const c of row.changes) {
      if (!chosen.has(c.key)) continue;
      const f = h.fields[c.field];
      f.v = c.to; f.src = provider; f.asOf = asOf; f.manual = false;
      if (c.field === "dividend") f.basis = c.extra.basis;
      if (c.field === "schedule") { f.basis = "ex-date"; f.exDate = c.extra.exDate ?? null; f.payDate = null; }
      applied++;
    }
  }
  return applied;
}

export { indicatedAnnual };
