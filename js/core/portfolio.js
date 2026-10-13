// Operations on the working packet. These mutate the packet they are given; the caller decides when to persist.
import { num } from "./calc.js";
import { LIMITS } from "./packet.js";
import { holdingFromMarket, lookup, manualHolding, resolveTicker, SAMPLE } from "./market.js";

// The calculators work on flat "calc holdings"; this is the only place packet holdings are flattened.
export function toCalc(packet) {
  return packet.holdings.map((h) => ({
    id: h.id, t: h.ticker, n: h.name, shares: h.shares,
    price: h.fields.price.v, div: h.fields.dividend.v, s: h.fields.schedule.v, q: h.fields.tax.v,
  }));
}

// Add shares of a ticker. Existing holdings gain shares; their values are left alone.
export function addHolding(packet, input, shares) {
  const { ticker, aliasOf } = resolveTicker(input);
  shares = num(shares);
  if (!ticker || !(shares > 0) || shares > LIMITS.maxShares) return { ok: false, reason: "invalid" };
  const existing = packet.holdings.find((h) => h.ticker === ticker);
  if (existing) { existing.shares = Math.min(LIMITS.maxShares, existing.shares + shares); return { ok: true, status: "merged", ticker, aliasOf }; }
  if (packet.holdings.length >= LIMITS.maxHoldings) return { ok: false, reason: "too_many" };
  const entry = lookup(ticker);
  packet.holdings.push(entry ? holdingFromMarket(ticker, shares, entry) : manualHolding(ticker, shares));
  return { ok: true, status: entry ? "added" : "added-manual", ticker, aliasOf };
}

export function loadSample(packet) {
  packet.holdings = [];
  for (const [t, s] of SAMPLE) addHolding(packet, t, s);
  return packet;
}

// A user edit protects that field from provider refreshes.
export function editField(packet, index, key, value, now = new Date().toISOString().slice(0, 10)) {
  const h = packet.holdings[index];
  if (!h) return false;
  if (key === "shares") { h.shares = Math.min(LIMITS.maxShares, Math.max(0, num(value))); return true; }
  const map = { price: "price", div: "dividend", s: "schedule", q: "tax" };
  const f = h.fields[map[key]];
  if (!f) return false;
  f.v = key === "s" ? value : key === "q" ? value === true || value === "1" : Math.max(0, num(value));
  f.src = "user"; f.manual = true; f.asOf = now;
  if (key === "s") f.basis = "user";
  if (key === "div") f.basis = null;
  return true;
}

export function removeHolding(packet, index) { packet.holdings.splice(index, 1); }
