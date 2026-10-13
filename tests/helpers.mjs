import { newPacket } from "../js/core/packet.js";
import { holdingFromMarket, manualHolding } from "../js/core/market.js";

export const NOW = "2026-10-13T12:00:00.000Z";

export function samplePacket() {
  const p = newPacket({ name: "Test portfolio", now: NOW });
  const schd = holdingFromMarket("SCHD", 12.5, { n: "Schwab US Dividend Equity ETF", p: 32.65, d: 1.055, s: "Q3", q: true, src: "Tiingo", u: "2026-10-12T22:00:00.000Z" });
  const o = holdingFromMarket("O", 80.333, { n: "Realty Income", p: 54.3, d: 3.245, s: "M", q: false, src: "Yahoo Finance", u: "2026-10-12T22:00:00.000Z" });
  const manual = manualHolding("XYZ", 7);
  manual.fields.price.v = 12.34; manual.fields.dividend.v = 0.9; manual.fields.dividend.basis = null; manual.fields.schedule.v = "S";
  p.holdings.push(schd, o, manual);
  p.settings = { ...p.settings, target: 3500, growth: 7.5, cutT: "O", cutPct: 35 };
  return p;
}

export function sampleReceipt(p, id = "rc_aaaaaaaaaaaaa") {
  return {
    id, portfolioId: p.portfolioId, portfolioName: p.portfolioName, originRevisionId: p.revisionId,
    capturedAt: NOW, label: "Q3 check", formulaVersion: "calc-1",
    dataAsOf: { oldest: "2026-10-12", newest: "2026-10-12", sources: ["tiingo", "yahoo"] },
    holdings: p.holdings.map((h) => ({ ticker: h.ticker, name: h.name, shares: h.shares, price: h.fields.price.v, dividend: h.fields.dividend.v, schedule: h.fields.schedule.v, qualified: h.fields.tax.v,
      provenance: { price: { src: h.fields.price.src, asOf: h.fields.price.asOf, manual: h.fields.price.manual }, dividend: { src: h.fields.dividend.src, asOf: h.fields.dividend.asOf, manual: h.fields.dividend.manual }, schedule: { src: h.fields.schedule.src, asOf: h.fields.schedule.asOf, manual: h.fields.schedule.manual } } })),
    assumptions: { ...p.settings },
    outputs: { value: 1000.5, income: 55.25, yield: 0.0552, monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], goalMonthsExpected: 120, goalMonthsSlow: null },
  };
}
