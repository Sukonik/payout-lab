// Render functions for the analysis panels. They read calc holdings + settings and write into the DOM.
// Formulas live in core/calc.js; nothing here changes a result.
import { $, esc, money, pct } from "./dom.js";
import { dur, inc, path, shift, simulate, taxSummary, when, num } from "../core/calc.js";

function fillSelect(id, hs, settings, key) {
  const sel = $(id);
  let cur = settings[key];
  if (!hs.some((h) => h.t === cur)) { cur = hs.length ? hs[0].t : ""; settings[key] = cur; }
  sel.innerHTML = hs.length
    ? hs.map((h) => `<option value="${esc(h.t)}"${h.t === cur ? " selected" : ""}>${esc(h.t)}</option>`).join("")
    : '<option value="">No holdings</option>';
}

export function renderConc(hs, T) {
  const arr = hs.map((h) => ({ t: h.t, v: inc(h) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  if (!arr.length) { $("concBig").innerHTML = ""; $("conc").innerHTML = ""; $("concNote").textContent = "Add holdings that pay a dividend to see this."; return; }
  const t1 = arr[0].v / T.income, t2 = (arr[0].v + (arr[1] ? arr[1].v : 0)) / T.income;
  $("concBig").innerHTML = `<div class="stat"><span>Top holding</span><b>${pct(t1, 0)}</b><small>${esc(arr[0].t)}</small></div>` +
    `<div class="stat"><span>Top two</span><b>${pct(t2, 0)}</b><small>${arr.slice(0, 2).map((x) => esc(x.t)).join(" + ")}</small></div>` +
    `<div class="stat"><span>Paying holdings</span><b>${arr.length}</b><small>of ${hs.length} total</small></div>`;
  $("conc").innerHTML = arr.map((x, i) => `<div class="hbar${i < 2 ? " top" : ""}"><b>${esc(x.t)}</b><div class="ht"><div class="hf" style="width:${(x.v / arr[0].v) * 100}%"></div></div><span class="hv">${pct(x.v / T.income, 1)}</span></div>`).join("");
  $("concNote").textContent = t1 >= 0.4 ? "Over 40% of your income comes from one holding, so a cut there would hit your total hard."
    : t2 >= 0.5 ? "Half or more of your income comes from your top two holdings." : "Your income is spread fairly evenly; no single holding dominates.";
}

export function renderCut(hs, T, S) {
  fillSelect("cutT", hs, S, "cutT");
  $("cutPctV").textContent = S.cutPct + "%";
  const h = hs.find((x) => x.t === S.cutT);
  if (!h || T.income <= 0) { $("cutOut").innerHTML = '<p class="muted note">Add a dividend-paying holding to run this test.</p>'; return; }
  const loss = (inc(h) * S.cutPct) / 100, after = T.income - loss;
  const a = simulate(T.income, T.yield, S.target, S.contrib, S.growth, S.reinvest);
  const b = simulate(after, T.value > 0 ? after / T.value : 0, S.target, S.contrib, S.growth, S.reinvest);
  $("cutOut").innerHTML = `<div class="stats">` +
    `<div class="stat"><span>Income lost</span><b class="neg">-${money(loss)}/yr</b><small>${money(loss / 12)} a month</small></div>` +
    `<div class="stat"><span>New yearly income</span><b>${money(after)}</b><small>${pct(loss / T.income, 1)} below today</small></div>` +
    `<div class="stat"><span>Goal date</span><b>${shift(a, b)}</b><small>${when(b)}</small></div></div>`;
}

export function renderGoal(hs, T, S) {
  $("growthV").textContent = S.growth + "%"; $("slowV").textContent = S.slow + "%";
  if (T.income <= 0) { $("goalOut").innerHTML = '<p class="muted note">Add a dividend-paying holding to project your timeline.</p>'; return; }
  const a = simulate(T.income, T.yield, S.target, S.contrib, S.growth, S.reinvest);
  const b = simulate(T.income, T.yield, S.target, S.contrib, S.slow, S.reinvest);
  const now = T.income / 12, prog = S.target > 0 ? Math.min(1, now / S.target) : 1;
  let html = `<div class="progress" role="progressbar" aria-valuenow="${Math.round(prog * 100)}" aria-valuemin="0" aria-valuemax="100"><div style="width:${prog * 100}%"></div></div>` +
    `<div class="muted" style="font-size:.85rem">${money(now)} of ${money(S.target)} a month today (${pct(prog, 0)})</div>` +
    `<div class="stats">` +
    `<div class="stat"><span>At ${S.growth}% growth</span><b>${dur(a)}</b><small>${when(a)}</small></div>` +
    `<div class="stat"><span>At ${S.slow}% growth</span><b>${dur(b)}</b><small>${when(b)}</small></div>` +
    `<div class="stat"><span>Slowdown costs</span><b class="${b !== a ? "neg" : ""}">${shift(a, b)}</b><small>difference in goal date</small></div></div>`;
  let n = Math.min(600, Math.max(24, a === null ? 0 : a, b === null ? 0 : b) + 12);
  if (a === null && b === null) n = 600;
  const pa = path(T.income, T.yield, S.contrib, S.growth, S.reinvest, n), pb = path(T.income, T.yield, S.contrib, S.slow, S.reinvest, n);
  const top = Math.max(S.target * 1.15, pa[n], pb[n]), W = 600, H = 200, P = 6;
  const pts = (p) => p.map((v, i) => (P + (i / n) * (W - 2 * P)).toFixed(1) + "," + (H - P - (v / top) * (H - 2 * P)).toFixed(1)).join(" ");
  const ty = (H - P - (S.target / top) * (H - 2 * P)).toFixed(1);
  html += `<svg class="path" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly income projection over ${Math.round(n / 12)} years">` +
    `<line x1="${P}" x2="${W - P}" y1="${ty}" y2="${ty}" style="stroke:var(--muted);stroke-dasharray:4 4;stroke-width:1"/>` +
    `<text x="${W - P}" y="${ty - 6}" text-anchor="end" style="fill:var(--muted);font-size:12px">Goal ${money(S.target)}/mo</text>` +
    `<polyline points="${pts(pb)}" style="fill:none;stroke:var(--amber);stroke-width:2.5"/>` +
    `<polyline points="${pts(pa)}" style="fill:none;stroke:var(--accent);stroke-width:2.5"/>` +
    `<text x="${P}" y="${H - P - 4}" style="fill:var(--muted);font-size:12px">Today</text>` +
    `<text x="${W - P}" y="${H - P - 4}" text-anchor="end" style="fill:var(--muted);font-size:12px">+${Math.round(n / 12)} yrs</text></svg>` +
    `<div class="legend"><span><i style="background:var(--accent)"></i>Expected growth</span><span><i style="background:var(--amber)"></i>Slow growth</span></div>`;
  $("goalOut").innerHTML = html;
}

export function renderAdd(hs, T, S) {
  fillSelect("addT", hs, S, "addT");
  const h = hs.find((x) => x.t === S.addT);
  if (!h) { $("addOut").innerHTML = '<p class="muted note">Add a holding to run this test.</p>'; return; }
  if (!(num(h.price) > 0)) { $("addOut").innerHTML = `<p class="muted note">Enter a price for ${esc(h.t)} in the table to run this test.</p>`; return; }
  const amt = num(S.addAmt), sh = amt / num(h.price), add = sh * num(h.div), ni = T.income + add, nv = T.value + amt;
  const a = simulate(T.income, T.yield, S.target, S.contrib, S.growth, S.reinvest);
  const b = simulate(ni, nv > 0 ? ni / nv : 0, S.target, S.contrib, S.growth, S.reinvest);
  $("addOut").innerHTML = `<div class="stats">` +
    `<div class="stat"><span>Buys about</span><b>${sh.toFixed(sh < 10 ? 2 : 0)} shares</b><small>at ${money(num(h.price), 2)} each</small></div>` +
    `<div class="stat"><span>Added income</span><b class="pos">+${money(add)}/yr</b><small>${money(add / 12)} a month</small></div>` +
    `<div class="stat"><span>Goal date</span><b>${shift(a, b)}</b><small>${when(b)}</small></div></div>`;
}

export function renderTax(hs, T, S) {
  if (T.income <= 0) { $("taxOut").innerHTML = '<p class="muted note">Add a dividend-paying holding to compare accounts.</p>'; return; }
  const t = taxSummary(hs, T, S);
  $("taxOut").innerHTML = `<div class="stats">` +
    `<div class="stat"><span>Taxable account</span><b>${money(t.net / 12)}/mo</b><small>${money(t.net)}/yr after ${money(t.taxQ + t.taxO)} tax</small></div>` +
    `<div class="stat"><span>Roth IRA</span><b class="pos">${money(T.income / 12)}/mo</b><small>No tax on qualified withdrawals</small></div>` +
    `<div class="stat"><span>Traditional IRA</span><b>${money(T.income / 12)}/mo</b><small>Untaxed while invested; about ${money(t.trad / 12)}/mo if withdrawn at your ordinary rate</small></div>` +
    `<div class="stat"><span>Tax drag in taxable</span><b class="neg">${pct(T.income > 0 ? (t.taxQ + t.taxO) / T.income : 0, 1)}</b><small>of your dividend income</small></div></div>` +
    `<p class="note muted">${t.ordList.length ? "Taxed as ordinary income in a taxable account: " + t.ordList.map(esc).join(", ") + ". These lose the most to tax outside an IRA." : "All your income is set as qualified."} Rates are your inputs; this is a rough estimate, not tax advice.</p>`;
}
