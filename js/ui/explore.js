// Per-share ticker research (the "what does it pay per share?" search).
import { $, esc, money, pct } from "./dom.js";
import { SCHED, SCHED_LABEL } from "../core/calc.js";
import { getMarket } from "../core/market.js";

const per = (e) => (e.per > 0 ? e.per : e.d / (SCHED[e.s] || SCHED.Q3).length);

function histHtml(e) {
  const h = e.hist;
  let o = "";
  if (h && h.length > 1) {
    const max = Math.max(...h.map((x) => x.a)), min = Math.min(...h.map((x) => x.a));
    o += `<div class="hist" aria-label="Recent payments per share">${h.map((x) => `<div title="${esc(x.d)}: ${money(x.a, 4)}"><i style="height:${Math.max(6, Math.round((x.a / max) * 56))}px"></i><span>${esc(x.d.slice(2, 7))}</span></div>`).join("")}</div>`;
    o += `<p class="note">Last ${h.length} payments, ${money(min, 4)} to ${money(max, 4)}. ${max / min > 1.15 ? "Payments vary a lot from one to the next." : "Payments are steady."}</p>`;
  }
  if (e.g3 != null || e.g5 != null) o += `<p class="note">Dividend growth per year: ${e.g3 != null ? "3-year " + pct(e.g3, 1) : ""}${e.g3 != null && e.g5 != null ? ", " : ""}${e.g5 != null ? "5-year " + pct(e.g5, 1) : ""}.</p>`;
  if (e.type === "ADR_VARIABLE") o += '<p class="note"><b>Foreign ADR:</b> the dollar amount moves with the exchange rate and foreign tax withholding, so it can change every payment even if the company keeps its dividend flat.</p>';
  else if (e.type === "ETF_PASS_THROUGH") o += '<p class="note"><b>ETF:</b> each payout is a pass-through of whatever its holdings paid that quarter, so amounts rise and fall.</p>';
  else if (e.type === "EQUITY_STANDARD" && e.g5 != null) o += '<p class="note"><b>Stock:</b> payouts are set by the board, so they usually step up in small, regular increments.</p>';
  return o;
}

export function fillTickers() {
  const T = getMarket().tickers;
  $("tickers").innerHTML = Object.keys(T).map((k) => `<option value="${k}">${esc(T[k].n)}</option>`).join("");
}

export function renderExplore() {
  const T = getMarket().tickers;
  const q = $("psq").value.trim().toUpperCase(), qn = q.toLowerCase();
  const all = Object.keys(T).sort().filter((k) => T[k].p > 0 && (!q || k.indexOf(q) === 0 || (T[k].n || "").toLowerCase().includes(qn)));
  const keys = all.slice(0, 40);
  const card = $("psCard");
  if (q && T[q] && T[q].p > 0) {
    const e = T[q], pp = per(e), n = (SCHED[e.s] || SCHED.Q3).length;
    card.innerHTML = e.d > 0
      ? `<div class="psbig"><div><span>${esc(q)} pays</span><b>${money(pp, 4)} <small>per share, ${n}x a year</small></b></div>` +
        `<div><span>Per year</span><b>${money(e.d, 2)}</b></div><div><span>Yield</span><b>${pct(e.p > 0 ? e.d / e.p : 0, 2)}</b></div><div><span>Months</span><b style="font-size:1rem">${SCHED_LABEL[e.s]}</b></div></div>` +
        histHtml(e) + `<p class="note">100 shares would pay about ${money(pp * 100, 2)} each time and ${money(e.d * 100, 2)} a year.</p>`
      : `<div class="psbig"><div><span>${esc(q)}</span><b>No dividend</b></div></div><p class="note">No dividend was reported for this ticker in the last 12 months.</p>`;
  } else card.innerHTML = "";
  $("psRows").innerHTML = keys.length
    ? keys.map((k) => { const e = T[k]; return `<tr><td><b>${esc(k)}</b>${e.est ? '<span class="badge">estimate</span>' : ""}<div class="sub">${esc(e.n)}</div></td><td class="num">${money(e.p, 2)}</td><td class="num"><b>${e.d > 0 ? money(per(e), 4) : "—"}</b></td><td>${e.d > 0 ? SCHED_LABEL[e.s] : "No dividend"}</td><td class="num">${money(e.d, 2)}</td><td class="num">${pct(e.p > 0 ? e.d / e.p : 0, 2)}</td><td><button class="ghost" data-add="${esc(k)}">Add</button></td></tr>`; }).join("") +
      (all.length > keys.length ? `<tr><td colspan="7" class="empty">Showing ${keys.length} of ${all.length}. Type to narrow it down.</td></tr>` : "")
    : '<tr><td colspan="7" class="empty">No match. You can still add any ticker below and enter its numbers yourself.</td></tr>';
}
