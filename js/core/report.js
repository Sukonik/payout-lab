// A printable, self-contained report. It is a single HTML document with inline styles only: no scripts, no fonts, no images,
// no links. A Content-Security-Policy blocks every remote request even if the file is edited later. All text is escaped.
import { MONTHS, SCHED_LABEL } from "./calc.js";

const E = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (v, d = 0) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const P = (v, d = 2) => (v * 100).toFixed(d) + "%";
const D = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "unknown");
const SRC = { tiingo: "Tiingo", yahoo: "Yahoo Finance", seed: "Starter estimate", user: "You", csv: "CSV import", legacy: "Earlier version", data: "Payout Lab data" };
const prov = (p) => (p ? `${p.manual ? "yours" : E(SRC[p.src] || p.src)}${p.asOf ? ", " + E(p.asOf) : p.manual ? "" : ", no date"}` : "");

const CSS = `body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14262f;margin:32px auto;max-width:820px;padding:0 20px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.1rem;margin:26px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
.sub{color:#56666c}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border-bottom:1px solid #ddd;padding:5px 8px;text-align:left;vertical-align:top}
th{font-size:.78rem;color:#56666c}td.n,th.n{text-align:right}.k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}
.k div{border:1px solid #ccc;border-radius:8px;padding:8px 10px}.k b{display:block;font-size:1.2rem}.k span{font-size:.75rem;color:#56666c}
.note{font-size:.85rem;color:#56666c}.pos{color:#0a6b64}.neg{color:#b13a2a}small{color:#56666c}
@media print{body{margin:0}h2{break-after:avoid}table{break-inside:avoid}}`;

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${E(title)}</title><style>${CSS}</style></head><body>${body}<p class="note" style="margin-top:28px">Made with Payout Lab. An educational calculator, not tax or investment advice. This file contains no scripts and loads nothing from the internet. It contains holdings and share counts, so keep it private.</p></body></html>`;
}

export function receiptReportHtml(r) {
  const o = r.outputs, a = r.assumptions;
  const goal = (m) => (m === null ? "not within 50 years" : m === 0 ? "already there" : `${Math.floor(m / 12)} yr ${m % 12} mo`);
  const rows = r.holdings.map((h) => `<tr><td><b>${E(h.ticker)}</b><br><small>${E(h.name)}</small></td><td class="n">${E(h.shares)}</td><td class="n">${$(h.price, 2)}<br><small>${prov(h.provenance?.price)}</small></td><td class="n">${$(h.dividend, 4)}<br><small>${prov(h.provenance?.dividend)}</small></td><td>${E(SCHED_LABEL[h.schedule] || h.schedule)}<br><small>${prov(h.provenance?.schedule)}</small></td><td class="n">${$(h.shares * h.dividend)}</td></tr>`).join("");
  const body = `<h1>${E(r.label || "Report")}</h1><p class="sub">${E(r.portfolioName)} · saved ${E(D(r.capturedAt))} · data as of ${E(r.dataAsOf.newest ? (r.dataAsOf.oldest === r.dataAsOf.newest ? r.dataAsOf.newest : `${r.dataAsOf.oldest} to ${r.dataAsOf.newest}`) : "unknown")}${r.dataAsOf.sources.length ? " (" + E(r.dataAsOf.sources.map((s) => SRC[s] || s).join(", ")) + ")" : ""}</p>` +
    `<div class="k"><div><b>${$(o.income)}</b><span>Income each year</span></div><div><b>${$(o.income / 12)}</b><span>Average month</span></div><div><b>${$(o.value)}</b><span>Portfolio value</span></div><div><b>${P(o.yield)}</b><span>Yield</span></div></div>` +
    `<h2>Holdings</h2><table><thead><tr><th>Holding</th><th class="n">Shares</th><th class="n">Price</th><th class="n">Dividend per year</th><th>Pays</th><th class="n">Yearly income</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<h2>Income by month (estimates)</h2><table><thead><tr>${MONTHS.map((m) => `<th class="n">${m}</th>`).join("")}</tr></thead><tbody><tr>${o.monthly.map((v) => `<td class="n">${$(v)}</td>`).join("")}</tr></tbody></table><p class="note">Months follow ex-dividend dates, so cash usually arrives a few weeks later. Exact pay dates are not known.</p>` +
    `<h2>Assumptions</h2><table><tbody><tr><td>Monthly income goal</td><td class="n">${$(a.target)}</td><td>Added each month</td><td class="n">${$(a.contrib)}</td></tr><tr><td>Expected dividend growth</td><td class="n">${E(a.growth)}%</td><td>Slow-growth scenario</td><td class="n">${E(a.slow)}%</td></tr><tr><td>Reinvest dividends</td><td class="n">${a.reinvest ? "Yes" : "No"}</td><td>Dividend per share means</td><td class="n">${a.dividendBasis === "indicated" ? "Current rate" : "Last 12 months"}</td></tr><tr><td>Qualified / ordinary / state tax rate</td><td class="n" colspan="3">${E(a.qRate)}% / ${E(a.oRate)}% / ${E(a.stRate)}%</td></tr></tbody></table>` +
    `<h2>Goal timeline</h2><p>At ${E(a.growth)}% growth: <b>${goal(o.goalMonthsExpected)}</b>. At ${E(a.slow)}% growth: <b>${goal(o.goalMonthsSlow)}</b>.</p>` +
    `<p class="note">Formula version ${E(r.formulaVersion)} · report ${E(r.id)} · made from revision ${E(r.originRevisionId.slice(3, 9))}. Values are frozen as saved on ${E(D(r.capturedAt))}; later data updates do not change this report. The special-payment effect on the 12-month dividend total cannot be separated with the available data.</p>`;
  return shell(`${r.label || "Report"} · ${r.portfolioName}`, body);
}

export function comparisonReportHtml(c, A, B, nameA, nameB) {
  const d = (x, f) => `<span class="${x.delta > 0 ? "pos" : x.delta < 0 ? "neg" : ""}">${x.delta > 0 ? "+" : ""}${f(x.delta)}</span>`;
  const line = (label, x, f) => `<tr><td>${E(label)}</td><td class="n">${f(x.from)}</td><td class="n">${f(x.to)}</td><td class="n">${d(x, f)}</td></tr>`;
  const split = (s) => `<tr><td>Your holdings (shares added, removed or changed)</td><td class="n">${$(s.holdings)}</td></tr><tr><td>Market data (prices or dividends)</td><td class="n">${$(s.market)}</td></tr><tr><td>Both at once (overlap)</td><td class="n">${$(s.overlap)}</td></tr><tr><td><b>Total change</b></td><td class="n"><b>${$(s.total)}</b></td></tr>`;
  const body = `<h1>Comparison</h1><p class="sub">${E(nameA)} (saved ${E(D(A.capturedAt))}) → ${E(nameB)} (saved ${E(D(B.capturedAt))})</p>` +
    (c.samePortfolio ? "" : `<p class="note"><b>These come from different portfolios.</b> A portfolio id is a label, not proof of who owns it, so differences may reflect different accounts, not your own changes.</p>`) +
    (c.formulaMatch ? "" : `<p class="note"><b>Different formula versions</b> (${E(c.formulas.join(" and "))}). Frozen outputs are shown as saved.</p>`) +
    `<table><thead><tr><th></th><th class="n">Before</th><th class="n">After</th><th class="n">Change</th></tr></thead><tbody>${line("Income each year", c.headline.income, (v) => $(v))}${line("Average month", c.headline.monthlyAvg, (v) => $(v))}${line("Portfolio value", c.headline.value, (v) => $(v))}${line("Yield", c.headline.yield, (v) => P(v))}</tbody></table>` +
    `<h2>What changed your income</h2><table><tbody>${split(c.income)}</tbody></table><h2>What changed your value</h2><table><tbody>${split(c.value)}</tbody></table>` +
    `<p class="note">Method: holdings = change in shares at the old rate; market data = change in rate on the old shares; overlap = both together. The three always add up to the total.</p>` +
    (c.assumptions.length ? `<h2>Assumptions that changed</h2><table><tbody>${c.assumptions.map((x) => `<tr><td>${E(x.label)}</td><td class="n">${E(x.from)}</td><td class="n">${E(x.to)}</td></tr>`).join("")}</tbody></table>` : "") +
    `<p class="note">Report data: before as of ${E(A.dataAsOf.newest || "unknown")}, after as of ${E(B.dataAsOf.newest || "unknown")}.</p>`;
  return shell("Comparison · Payout Lab", body);
}
