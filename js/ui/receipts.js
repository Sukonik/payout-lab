// Saved reports and comparison. Reads state, writes DOM. Never changes the working portfolio.
import { $, esc, money, pct, dateTime, shortDate } from "./dom.js";
import { MONTHS, dur } from "../core/calc.js";
import { buildReceipt, compareReceipts } from "../core/receipt.js";

const SRC = { tiingo: "Tiingo", yahoo: "Yahoo Finance", seed: "Starter estimate", user: "You", csv: "CSV import", legacy: "Earlier version", data: "Payout Lab data" };
export const titleOf = (r) => r.label || `Report · ${shortDate(r.capturedAt)}`;
const asOfText = (r) => (r.dataAsOf.newest ? `data as of ${r.dataAsOf.oldest === r.dataAsOf.newest ? shortDate(r.dataAsOf.newest) : shortDate(r.dataAsOf.oldest) + " to " + shortDate(r.dataAsOf.newest)}${r.dataAsOf.sources.length ? " from " + r.dataAsOf.sources.map((s) => SRC[s] || s).join(" and ") : ""}` : "no dated data");

export function renderReports(packet, workbench) {
  const list = $("rcList");
  if (!packet.snapshots.length) {
    list.innerHTML = '<li class="muted note" style="margin:0">No saved reports yet. Save one now to keep a dated copy you can compare later.</li>';
  } else {
    list.innerHTML = packet.snapshots.map((r) => `<li class="rcrow" data-id="${esc(r.id)}"><div><h3>${esc(titleOf(r))}${r.portfolioId !== packet.portfolioId ? '<span class="badge2" title="Saved from a different portfolio">other portfolio</span>' : ""}</h3><small>Saved ${esc(dateTime(r.capturedAt))} · ${esc(asOfText(r))}</small></div>` +
      `<div class="rcnums"><span>Income <b>${money(r.outputs.income)}</b>/yr</span><span>Value <b>${money(r.outputs.value)}</b></span><span>Yield <b>${pct(r.outputs.yield, 2)}</b></span><span>${r.holdings.length} holding${r.holdings.length === 1 ? "" : "s"}</span></div>` +
      `<div class="rcact"><button class="btn sm" data-act="compare" data-id="${esc(r.id)}">Compare with today</button><button class="btn sm ghost" data-act="print" data-id="${esc(r.id)}">Print</button><button class="btn sm ghost" data-act="export" data-id="${esc(r.id)}">Export</button><button class="btn sm ghost" data-act="delete" data-id="${esc(r.id)}">Delete</button></div></li>`).join("");
  }
  const total = packet.snapshots.length + workbench.length;
  $("cmpCard").hidden = total === 0;
}

export function optionList(packet, workbench) {
  return [{ id: "cur", name: "Today's portfolio (not saved)" }, ...packet.snapshots.map((r) => ({ id: r.id, name: `${titleOf(r)} · ${shortDate(r.capturedAt)}` })), ...workbench.map((r) => ({ id: "wb:" + r.id, name: `${titleOf(r)} · ${shortDate(r.capturedAt)} (opened file)` }))];
}

export function resolveReceipt(id, packet, workbench) {
  if (id === "cur") return buildReceipt(packet, { label: "Today's portfolio" });
  if (id && id.startsWith("wb:")) return workbench.find((r) => "wb:" + r.id === id) || null;
  return packet.snapshots.find((r) => r.id === id) || null;
}

const sgn = (n) => (n > 0 ? "+" : "");
const cls = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const dcell = (x, f) => `<span class="${cls(x.delta)}">${sgn(x.delta)}${f(x.delta)}</span>`;
const row = (label, x, f) => `<tr><td>${label}</td><td>${f(x.from)}</td><td>${f(x.to)}</td><td>${dcell(x, f)}</td></tr>`;

function bars(s, label) {
  const parts = [["Your holdings", "shares added, removed or changed", s.holdings], ["Market data", "prices or dividends moved", s.market], ["Both at once", "overlap", s.overlap]];
  const max = Math.max(...parts.map((p) => Math.abs(p[2])), 1e-9);
  return `<h4 class="cmp-h">${esc(label)}</h4>` + parts.map(([n, h, v]) => `<div class="abar"><span>${esc(n)}<br><small class="muted">${esc(h)}</small></span><span class="tr"><i class="fl ${v >= 0 ? "p" : "n"}" style="width:${(Math.abs(v) / max) * 50}%"></i></span><b class="${cls(v)}">${sgn(v)}${money(v)}</b></div>`).join("") +
    `<div class="abar"><b>Total change</b><span></span><b class="${cls(s.total)}">${sgn(s.total)}${money(s.total)}</b></div>`;
}

export function compareHtml(c, A, B) {
  const nameA = titleOf(A), nameB = titleOf(B);
  let h = `<p class="cmp-h"><b>${esc(nameA)}</b> (saved ${esc(shortDate(A.capturedAt))}, ${esc(asOfText(A))}) → <b>${esc(nameB)}</b> (saved ${esc(shortDate(B.capturedAt))}, ${esc(asOfText(B))})</p>`;
  if (!c.samePortfolio) h += `<div class="cmp-note"><b>These come from different portfolios.</b> A portfolio id is a label, not proof of who owns it, so differences may reflect different accounts rather than your own changes.</div>`;
  if (!c.formulaMatch) h += `<div class="cmp-note"><b>Different formula versions</b> (${esc(c.formulas.join(" and "))}). Frozen outputs are shown exactly as saved.</div>`;
  if (c.unchanged) return h + `<div class="cmp-zero">No change between these two. Same holdings, same values, same assumptions.</div>`;
  h += `<div class="cmp-wrap"><table class="cmp-t"><thead><tr><th></th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>${row("Income each year", c.headline.income, (v) => money(v))}${row("Average month", c.headline.monthlyAvg, (v) => money(v))}${row("Portfolio value", c.headline.value, (v) => money(v))}${row("Yield", c.headline.yield, (v) => pct(v, 2))}</tbody></table></div>`;
  h += bars(c.income, "What changed your income") + bars(c.value, "What changed your value");
  h += `<details class="cmp-h"><summary>How this is worked out</summary><p class="note">Your holdings = change in shares at the <i>old</i> price or dividend. Market data = change in price or dividend on the <i>old</i> shares. Both at once = the part caused by shares and rates changing together. The three always add up exactly to the total, so nothing is counted twice and nothing is guessed. Yield is income divided by value and is not split.</p></details>`;
  const changed = c.holdings.filter((r) => r.status !== "same");
  if (changed.length) h += `<h4 class="cmp-h">Holdings that changed</h4><div class="cmp-wrap"><table class="cmp-t"><thead><tr><th>Ticker</th><th>Shares</th><th>Price</th><th>Dividend</th></tr></thead><tbody>${changed.map((r) => `<tr><td><b>${esc(r.ticker)}</b> <small class="muted">${esc(r.status)}</small></td><td>${esc(r.shares[0])} → ${esc(r.shares[1])}</td><td>${r.price[0] === null ? "new" : money(r.price[0], 2)} → ${r.price[1] === null ? "removed" : money(r.price[1], 2)}</td><td>${r.dividend[0] === null ? "new" : money(r.dividend[0], 2)} → ${r.dividend[1] === null ? "removed" : money(r.dividend[1], 2)}</td></tr>`).join("")}</tbody></table></div>`;
  if (c.assumptions.length) h += `<h4 class="cmp-h">Assumptions that changed</h4><table class="cmp-t"><tbody>${c.assumptions.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(String(x.from))} → ${esc(String(x.to))}</td></tr>`).join("")}</tbody></table>`;
  const g = c.goal;
  const gtxt = (m) => (m === null ? "beyond 50 years" : dur(m));
  h += `<h4 class="cmp-h">Goal timeline</h4><p>At expected growth: <b>${esc(gtxt(g.from))}</b> → <b>${esc(gtxt(g.to))}</b>. At slow growth: ${esc(gtxt(g.slow.from))} → ${esc(gtxt(g.slow.to))}.</p>`;
  if (g.steps) h += `<table class="cmp-t"><tbody>${g.steps.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(gtxt(s.from))} → ${esc(gtxt(s.to))}</td><td class="${cls(s.to - s.from)}">${s.to === s.from ? "no change" : (s.to < s.from ? "sooner by " : "later by ") + esc(dur(Math.abs(s.to - s.from)))}</td></tr>`).join("")}</tbody></table>`;
  h += `<p class="note muted">${esc(g.note)}</p>`;
  h += `<h4 class="cmp-h">Income by month (estimates)</h4><div class="mon">${c.months.map((m) => `<span>${m.month}<b class="${cls(m.delta)}">${m.delta === 0 ? "·" : sgn(m.delta) + money(m.delta)}</b></span>`).join("")}</div><p class="note muted">Months follow ex-dividend dates, so cash usually arrives a few weeks later.</p>`;
  return h;
}
