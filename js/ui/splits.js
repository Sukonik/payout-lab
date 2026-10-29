// The Splits tab: a ledger of split events, announced splits, compare, what-if and your own holdings.
// Dates are shown as day, month and year blocks. Nothing here predicts a split.
import { $, esc, money, pct } from "./dom.js";
import { getMarket } from "../core/market.js";
import { afterSplit, compareTickers, dateParts, filterLedger, getSplits, holdingsWithSplits, kindOf, ledger, priceAfter, ratioLabel, upcomingView, yearGroups } from "../core/splits.js";

const PAGE = 60;
const ui = { kind: "forward", query: "", limit: PAGE, cmpA: "GOOGL", cmpB: "LCID", wi: { shares: 10, a: 20, b: 1 } };
let getHoldings = () => [];
const today = () => new Date().toISOString().slice(0, 10);
const num = (v, d = 2) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

// One tube becomes many (forward) or many become one (reverse). The liquid is the same amount, shared out.
const TUBE_CAP = 8;
function tubes(count, level, cls) {
  const n = Math.min(count, TUBE_CAP);
  const w = 11, gap = 3;
  let o = "";
  for (let i = 0; i < n; i++) {
    const x = i * (w + gap), h = 30 * level;
    o += `<g class="${cls}" transform="translate(${x} 0)"><rect class="sg-liq" x="1.5" y="${33 - h}" width="${w - 3}" height="${h}" rx="1.5"/><path class="sg-glass" d="M1 3v26a5 5 0 0 0 ${w - 2} 0V3"/></g>`;
  }
  return { svg: o, width: n * (w + gap) - gap, shown: n };
}
export function fission(s) {
  const fw = s.a > s.b, small = fw ? s.a : s.b, big = fw ? s.b : s.a;
  const L = tubes(big, 1, "sg-big"), R = tubes(small, Math.max(0.18, big / small), "sg-small");
  const left = fw ? L : R, right = fw ? R : L;
  const gapW = 22, W = left.width + gapW + right.width;
  const label = `${fw ? "1 tube becomes" : ""} ${s.a}-for-${s.b}`;
  const mult = fw ? `×${num(s.a / s.b, 2)}` : `÷${num(s.b / s.a, 2)}`;
  return `<span class="fwrap" aria-hidden="false"><svg class="fission" viewBox="0 0 ${W} 36" width="${W * 1.4}" height="${36 * 1.4}" role="img" aria-label="${esc(`${ratioLabel(s)} ${fw ? "forward" : "reverse"} split: ${s.b} old share${s.b > 1 ? "s" : ""} become ${s.a}`)}">` +
    `<g>${left.svg}</g><path class="sg-arrow" d="M${left.width + 4} 18h${gapW - 8}m-4-4 4 4-4 4"/><g transform="translate(${left.width + gapW} 0)">${right.svg}</g></svg><b class="mult">${mult}</b></span>`;
}

function dateBlock(iso, tag = "") {
  const p = dateParts(iso);
  return p ? `<time class="dblock" datetime="${p.iso}"${tag}><b>${p.day}</b><span>${p.month}</span><i>${p.year}</i></time>` : "";
}

const verBadge = (s) => (s.ver ? '<span class="pill ok"><i></i>Cross-checked</span>' : '<span class="pill warn" title="From the public record. The scheduled refresh replaces it with feed data."><i></i>Not yet cross-checked</span>');
const kindPill = (k) => (k === "forward" ? '<span class="pill ok"><i></i>Forward</span>' : '<span class="pill bad"><i></i>Reverse</span>');

function eventCard(r) {
  const price = r.pre && r.post ? `${money(r.pre, 2)} → ${money(r.post, 2)}` : "not recorded yet";
  const move = r.move == null ? "" : `<div><dt>Since then</dt><dd class="${r.move >= 0 ? "up" : "down"}">${r.move >= 0 ? "+" : ""}${pct(r.move, 0)}</dd></div>`;
  return `<li class="sevent ${r.kind}" data-t="${esc(r.t)}">${dateBlock(r.d)}` +
    `<div class="sbody"><div class="shead"><b class="stk">${esc(r.t)}</b><span class="sname">${esc(r.n)}</span></div>` +
    `<div class="spills"><span class="ratio">${esc(ratioLabel(r))}</span>${kindPill(r.kind)}${verBadge(r)}</div>` +
    `<div class="sfx">${fission(r)}<dl class="sdl"><div><dt>10 shares became</dt><dd>${num(afterSplit(10, r), 2)}</dd></div><div><dt>Price per share</dt><dd>${price}</dd></div>${move}</dl></div>` +
    (r.kind === "reverse" ? '<p class="note snote">Reverse split: fewer shares at a higher price. Companies often do this to keep a listing, so treat it as a warning sign worth reading about, not as good news.</p>' : "") +
    `<div class="sact"><button class="btn ghost sm" data-wi="${esc(r.t)}|${r.a}|${r.b}">What if…</button><button class="btn ghost sm" data-cmp="${esc(r.t)}">Compare</button></div></div></li>`;
}

function upcomingCard(u) {
  const when = u.days === 0 ? "today" : u.days === 1 ? "tomorrow" : `in ${u.days} days`;
  const status = { announced: '<span class="pill ok"><i></i>Announced</span>', confirmed: '<span class="pill ok"><i></i>Confirmed</span>', unverified: '<span class="pill warn"><i></i>Unverified: check before relying on it</span>' }[u.status];
  const src = u.url ? `<a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">${esc(u.src)}</a>` : esc(u.src);
  return `<li class="sevent upc ${u.kind}">${dateBlock(u.exDate)}<div class="sbody"><div class="shead"><b class="stk">${esc(u.t)}</b><span class="sname">${esc(u.n)}</span></div>` +
    `<div class="spills"><span class="ratio">${esc(ratioLabel(u))}</span>${kindPill(u.kind)}${status}<span class="pill"><i></i>${when}</span></div>` +
    `<div class="sfx">${fission(u)}<dl class="sdl"><div><dt>First day at new count</dt><dd>${esc(dateParts(u.exDate).day + " " + dateParts(u.exDate).month + " " + dateParts(u.exDate).year)}</dd></div>${u.announced ? `<div><dt>Announced</dt><dd>${esc(u.announced)}</dd></div>` : ""}<div><dt>Source</dt><dd>${src}</dd></div></dl></div></li>`;
}

function renderUpcoming(f) {
  const list = upcomingView(f, today(), { kind: ui.kind });
  $("spUp").innerHTML = list.length
    ? `<ul class="sevents">${list.map(upcomingCard).join("")}</ul>`
    : `<p class="note muted">No ${ui.kind === "all" ? "" : ui.kind + " "}splits on file that an issuer has announced and not yet carried out${f.upcomingAsOf ? `, as of ${esc(f.upcomingAsOf)}` : ""}. This list is kept by hand from issuer announcements and filings, never predicted. Missing one? Add it to <code>splits.json</code> with a source link.</p>`;
}

function renderLedger(f, market) {
  const rows = filterLedger(ledger(f, market.tickers), { kind: ui.kind, query: ui.query });
  const shown = rows.slice(0, ui.limit);
  const groups = yearGroups(shown);
  const left = rows.length - shown.length;
  $("spCount").textContent = `${rows.length} split${rows.length === 1 ? "" : "s"}`;
  $("spLedger").innerHTML = rows.length
    ? groups.map((g) => `<h3 class="syear"><span>${g.year}</span><i>${g.rows.length}</i></h3><ul class="sevents">${g.rows.map(eventCard).join("")}</ul>`).join("") +
      (left > 0 ? `<p class="note muted">Showing the newest ${shown.length} of ${rows.length}. Search a ticker to jump to one.</p><div class="row-actions"><button class="btn" type="button" data-spmore>Show ${Math.min(PAGE, left)} more</button></div>` : "")
    : `<p class="note muted">${ui.query ? "No splits match that search." : `No ${ui.kind === "all" ? "" : ui.kind + " "}splits recorded yet.`}</p>`;
}

function cmpCol(c) {
  if (!c.t) return "";
  if (!c.known) return `<div class="cmpcol"><h3>${esc(c.t)}</h3><p class="note muted">No split history on file for this ticker. That can mean it never split, or that it has not been checked yet.</p></div>`;
  const last = c.last;
  return `<div class="cmpcol"><h3>${esc(c.t)}</h3><p class="muted">${esc(c.n)}</p><dl class="sdl">` +
    `<div><dt>Splits on file</dt><dd>${c.count}</dd></div><div><dt>Forward</dt><dd>${c.forward}</dd></div><div><dt>Reverse</dt><dd>${c.reverse}</dd></div>` +
    `<div><dt>Latest</dt><dd>${last ? `${esc(ratioLabel(last))} · ${dateParts(last.d).day} ${dateParts(last.d).month} ${dateParts(last.d).year}` : "none"}</dd></div>` +
    `<div><dt>Shares from 1 held before</dt><dd>${num(c.factor, 4)}</dd></div><div><dt>Price now</dt><dd>${c.price ? money(c.price, 2) : "—"}</dd></div></dl>` +
    `<div class="cmpmini">${c.splits.map((s) => `<span class="ratio ${kindOf(s.a, s.b)}" title="${esc(s.d)}">${esc(ratioLabel(s))}</span>`).join(" ")}</div></div>`;
}

function renderCompare(f, market) {
  const [a, b] = compareTickers(f, market.tickers, ui.cmpA.trim().toUpperCase(), ui.cmpB.trim().toUpperCase());
  $("spCmpOut").innerHTML = `<div class="cmpgrid">${cmpCol(a)}${cmpCol(b)}</div>`;
}

function renderWhatIf() {
  const { shares, a, b } = ui.wi;
  const ok = shares > 0 && Number.isInteger(a) && Number.isInteger(b) && a > 0 && b > 0 && a <= 1000 && b <= 1000 && a !== b;
  if (!ok) { $("spWiOut").innerHTML = '<p class="note muted">Enter a share count and a ratio such as 20 for 1.</p>'; return; }
  const s = { a, b }, sh = afterSplit(shares, s), whole = Math.floor(sh), frac = sh - whole;
  const ex = 100;
  $("spWiOut").innerHTML = `<div class="psbig"><div><span>You hold</span><b>${num(shares, 4)}</b></div><div><span>After ${esc(ratioLabel(s))}</span><b>${num(sh, 4)}</b></div><div><span>A $${ex} share becomes</span><b>${money(priceAfter(ex, s), 2)}</b></div></div>` +
    `<p class="note">Your total value does not change: ${num(shares, 4)} × ${money(ex, 2)} = ${money(shares * ex, 2)}, and ${num(sh, 4)} × ${money(priceAfter(ex, s), 2)} = ${money(sh * priceAfter(ex, s), 2)}. Dividend per share shrinks by the same ratio (a ${money(1, 2)} dividend becomes ${money(priceAfter(1, s), 4)}).</p>` +
    (b > a && frac > 0 ? `<p class="note"><b>Reverse splits can leave a fraction.</b> You would have ${whole} whole shares and ${num(frac, 4)} of one, which many brokers pay out in cash instead.</p>` : "");
}

function renderMine(f, market) {
  const mine = holdingsWithSplits(getHoldings(), f);
  const held = getHoldings().length;
  $("spMine").innerHTML = mine.length
    ? `<ul class="minelist">${mine.map((m) => `<li><b>${esc(m.ticker)}</b> <span class="muted">${esc(m.name || "")}</span><div class="spills">${m.splits.map((s) => `<span class="ratio ${kindOf(s.a, s.b)}" title="${esc(s.d)}">${esc(ratioLabel(s))} · ${dateParts(s.d).month} ${dateParts(s.d).year}</span>`).join(" ")}</div><p class="note">Over its split history, 1 old share is ${num(m.factor, 4)} shares today. Dividend per share before a split is not comparable to today's without that adjustment.</p></li>`).join("")}</ul>`
    : `<p class="note muted">${held ? "None of your holdings has a split on file." : "Add holdings in Portfolio to see which of them have split."} Only tickers already checked are covered.</p>`;
}

export function renderSplits() {
  const f = getSplits(), market = getMarket();
  if (!f.loaded) { $("spStatus").innerHTML = '<span class="pill warn"><i></i>Split data unavailable</span> The split file could not be loaded, so the lists below are empty.'; }
  else {
    const ver = Object.values(f.tickers).reduce((n, v) => n + v.s.filter((s) => s.ver).length, 0), all = Object.values(f.tickers).reduce((n, v) => n + v.s.length, 0);
    $("spStatus").innerHTML = `<span class="pill"><i></i>${all} splits, ${Object.keys(f.tickers).length} tickers</span> <span class="pill ${ver === all ? "ok" : "warn"}"><i></i>${ver} cross-checked</span> <span class="pill"><i></i>updated ${esc((f.updated || "").slice(0, 10) || "unknown")}</span>`;
  }
  document.querySelectorAll('input[name="spk"]').forEach((r) => { r.checked = r.value === ui.kind; });
  renderUpcoming(f); renderLedger(f, market); renderCompare(f, market); renderWhatIf(); renderMine(f, market);
}

export function initSplits({ holdings }) {
  getHoldings = holdings;
  const view = $("view-splits");
  view.addEventListener("change", (e) => {
    if (e.target.name === "spk") { ui.kind = e.target.value; ui.limit = PAGE; renderSplits(); }
  });
  $("spQ").addEventListener("input", (e) => { ui.query = e.target.value; ui.limit = PAGE; const f = getSplits(); renderLedger(f, getMarket()); });
  $("spCmpA").addEventListener("input", (e) => { ui.cmpA = e.target.value; renderCompare(getSplits(), getMarket()); });
  $("spCmpB").addEventListener("input", (e) => { ui.cmpB = e.target.value; renderCompare(getSplits(), getMarket()); });
  const wi = () => { ui.wi = { shares: Number($("spWiShares").value), a: Number($("spWiA").value), b: Number($("spWiB").value) }; renderWhatIf(); };
  ["spWiShares", "spWiA", "spWiB"].forEach((id) => $(id).addEventListener("input", wi));
  view.addEventListener("click", (e) => {
    const w = e.target.closest("[data-wi]"), c = e.target.closest("[data-cmp]");
    if (e.target.closest("[data-spmore]")) { ui.limit += PAGE; renderLedger(getSplits(), getMarket()); return; }
    if (w) { const [, a, b] = w.dataset.wi.split("|"); $("spWiA").value = a; $("spWiB").value = b; wi(); $("spWi").scrollIntoView({ behavior: "smooth", block: "center" }); }
    if (c) { ui.cmpB = ui.cmpA; ui.cmpA = c.dataset.cmp; $("spCmpA").value = ui.cmpA; $("spCmpB").value = ui.cmpB; renderCompare(getSplits(), getMarket()); $("spCmp").scrollIntoView({ behavior: "smooth", block: "center" }); }
  });
  $("spCmpA").value = ui.cmpA; $("spCmpB").value = ui.cmpB;
  $("spWiShares").value = ui.wi.shares; $("spWiA").value = ui.wi.a; $("spWiB").value = ui.wi.b;
}
