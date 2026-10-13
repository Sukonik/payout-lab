// Renderers for the Overview, Portfolio and Receipts views. They read state and write DOM; they never change a result.
import { $, esc, money, pct, tween, shortDate } from "./dom.js";
import { MONTHS, SCHED_LABEL, inc, perPay } from "../core/calc.js";
import { SRC_LABEL } from "../core/market.js";
import { STALE_DAYS, ageDays } from "../core/refresh.js";
import { renderRack, emptyRackHtml } from "./tubes.js";

// ---------- data freshness (per value: provider-fresh, stale, estimate or manual) ----------
const toCalcLite = (h) => ({ shares: h.shares, div: h.fields.dividend.v });

export function fieldStatus(f, now = Date.now()) {
  if (f.manual) return "manual";
  if (f.src === "seed" || f.src === "legacy" || !f.asOf) return "estimate";
  return ageDays(f.asOf, now) > STALE_DAYS ? "stale" : "current";
}

// A holding's status is its weakest value: estimate < stale < current. Manual means the user owns the numbers.
export function holdingStatus(h, now = Date.now()) {
  const fs = [h.fields.price, h.fields.dividend, h.fields.schedule].map((f) => fieldStatus(f, now));
  if (fs.every((s) => s === "manual")) return "manual";
  const rest = fs.filter((s) => s !== "manual");
  if (rest.includes("estimate")) return "estimate";
  if (rest.includes("stale")) return "stale";
  return fs.includes("manual") ? "mixed" : "current";
}

export function freshnessSummary(packet, now = Date.now()) {
  const c = { current: 0, stale: 0, estimate: 0, manual: 0, mixed: 0 };
  const dates = [];
  for (const h of packet.holdings) {
    c[holdingStatus(h, now)]++;
    for (const f of [h.fields.price, h.fields.dividend]) if (!f.manual && f.asOf) dates.push(f.asOf);
  }
  dates.sort();
  return { counts: c, oldest: dates[0] || null, newest: dates[dates.length - 1] || null, total: packet.holdings.length };
}

export function provChip(h, now = Date.now()) {
  const f = h.fields;
  const st = holdingStatus(h, now);
  if (st === "manual") return '<span class="chipsrc manual" title="You entered these values. Data refreshes will not change them.">Your numbers</span>';
  // Describe the provider-supplied values; name the ones that are yours.
  const mine = [["price", f.price], ["dividend", f.dividend], ["months", f.schedule]].filter(([, x]) => x.manual).map(([n]) => n);
  const base = [f.price, f.dividend, f.schedule].find((x) => !x.manual);
  const label = SRC_LABEL[base.src] || base.src;
  let txt, cls = "";
  if (st === "estimate") { txt = base.src === "legacy" ? "Earlier version · no date" : "Estimate · not live"; cls = " warn"; }
  else if (st === "stale") { txt = `${label} · ${shortDate(base.asOf)} · stale`; cls = " warn"; }
  else txt = `${label} · ${shortDate(base.asOf)}`;
  if (mine.length) txt += ` · ${mine.join(" + ")} yours`;
  return `<span class="chipsrc${cls}" title="${esc(provDetail(h))}">${esc(txt)}</span>`;
}

// One line per value: who produced it and when. Pay months are estimates while only ex-dividend dates are known.
export function provDetail(h) {
  const f = h.fields;
  const one = (name, x, extra = "") => `${name}: ${x.manual ? "yours" : SRC_LABEL[x.src] || x.src}${x.asOf ? ", observed " + shortDate(x.asOf) : x.manual ? "" : ", no date"}${extra}`;
  return [
    one("Price", f.price),
    one(f.dividend.basis === "indicated" ? "Dividend (current rate)" : f.dividend.basis === "trailing" ? "Dividend (last 12 months)" : "Dividend", f.dividend),
    one("Pay months", f.schedule, f.schedule.basis === "ex-date" ? ` (estimated from ex-dividend dates${f.schedule.exDate ? ", last " + shortDate(f.schedule.exDate) : ""}; pay date not available)` : ""),
  ].join("\n");
}

// ---------- overview ----------
export function concSummaryHtml(hs, T) {
  const arr = hs.map((h) => ({ t: h.t, v: inc(h) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  if (!arr.length) return '<p class="muted">Add a holding that pays a dividend to see how concentrated your income is.</p>';
  const t1 = arr[0].v / T.income, t2 = (arr[0].v + (arr[1] ? arr[1].v : 0)) / T.income;
  const note = t1 >= 0.4 ? "One holding carries a lot of your income, so a cut there would hit hard." : t2 >= 0.5 ? "Your top two holdings supply half or more of your income." : "Your income is spread fairly evenly.";
  return `<div class="stats" style="margin-top:0"><div class="stat"><span>Top holding</span><b>${pct(t1, 0)}</b><small>${esc(arr[0].t)}</small></div><div class="stat"><span>Paying holdings</span><b>${arr.length}</b><small>of ${hs.length}</small></div></div><p class="note">${note}</p>`;
}

export function renderOverview(ctx) {
  const { packet, hs, T, selectedMonth, plan } = ctx;
  const empty = !packet.holdings.length;
  $("ovEmpty").hidden = !empty;
  $("ovMain").hidden = empty;
  if (empty) { if (!$("emptyRack").innerHTML) $("emptyRack").innerHTML = emptyRackHtml(); return null; }
  tween($("roYear"), T.income, (v) => money(v));
  tween($("roVal"), T.value, (v) => money(v));
  tween($("roMo"), T.income / 12, (v) => money(v));
  $("roYld").textContent = pct(T.yield, 2);
  const payers = hs.filter((h) => inc(h) > 0).length;
  $("roPay").textContent = `${payers} of ${hs.length}`;
  $("roSub").textContent = T.income > 0 ? `${money(T.income / 12)} a month on average` : "None of these holdings pays a dividend";
  const rack = renderRack($("cal"), $("calDetail"), hs, T, selectedMonth);
  const m = rack.months, avg = T.income / 12;
  if (avg <= 0) $("calNote").textContent = "Add holdings that pay a dividend to fill the rack.";
  else {
    const hi = m.indexOf(Math.max(...m)), lo = m.indexOf(Math.min(...m));
    const thin = [];
    m.forEach((x, i) => { if (x < avg * 0.5) thin.push(MONTHS[i]); });
    $("calNote").innerHTML = `Average month: <b>${money(avg)}</b>. Biggest is ${MONTHS[hi]} at ${money(m[hi])}, smallest is ${MONTHS[lo]} at ${money(m[lo])}. ` +
      (thin.length ? `Thin months: <b>${thin.join(", ")}</b>.` : "No month falls below half the average.");
  }

  const f = freshnessSummary(packet);
  const rows = [["ok", "current", "Current", "Provider data from the last " + STALE_DAYS + " days"], ["warn", "stale", "Stale", `Provider data older than ${STALE_DAYS} days`], ["warn", "estimate", "Estimate", "Starter or undated values"], ["", "manual", "Yours", "Values you entered"], ["", "mixed", "Mixed", "Some values are yours, the rest from a provider"]];
  $("fresh").innerHTML = rows.filter(([, k]) => f.counts[k] > 0).map(([tone, k, name, hint]) => `<div class="fresh-row"><span><span class="pill ${tone}"><i></i>${name}</span> <span class="muted">${esc(hint)}</span></span><b>${f.counts[k]}</b></div>`).join("") +
    `<p class="note muted">${f.newest ? `Provider values observed ${f.oldest === f.newest ? shortDate(f.newest) : `${shortDate(f.oldest)} to ${shortDate(f.newest)}`}.` : "No dated provider values yet."}</p>`;
  const upd = plan ? plan.counts.update + plan.counts.protected : 0;
  $("fresh").insertAdjacentHTML("beforeend", upd ? `<p class="note"><a href="#/portfolio">${upd} value${upd > 1 ? "s have" : " has"} newer data. Review in Portfolio →</a></p>` : "");
  const exBased = packet.holdings.some((h) => inc(toCalcLite(h)) > 0 && h.fields.schedule.basis === "ex-date");
  $("calBasis").textContent = exBased
    ? "Months follow ex-dividend dates, so actual cash usually arrives a few weeks later. Exact pay dates are not available yet."
    : "Months follow the pay schedule you set for each holding.";
  $("concSummary").innerHTML = concSummaryHtml(hs, T);
  return rack;
}

// ---------- portfolio ----------
export function renderHoldingRows(packet) {
  const root = $("rows");
  if (!packet.holdings.length) { root.innerHTML = '<div class="empty">No holdings yet. Add a ticker above, or try the sample portfolio.</div>'; return; }
  root.innerHTML = packet.holdings.map((h, i) => {
    const f = h.fields;
    const opts = Object.keys(SCHED_LABEL).map((k) => `<option value="${k}"${f.schedule.v === k ? " selected" : ""}>${SCHED_LABEL[k]}</option>`).join("");
    const t = esc(h.ticker);
    return `<div class="hrow" data-row="${i}">` +
      `<div class="c-id"><div class="tk">${t}</div><div class="nm" title="${esc(h.name)}">${esc(h.name || "Enter price, dividend and schedule")}</div>${provChip(h)}</div>` +
      `<label class="c-sh"><span class="lab">Shares</span><input type="number" min="0" step="any" inputmode="decimal" data-i="${i}" data-k="shares" value="${h.shares}" aria-label="Shares of ${t}"></label>` +
      `<label class="c-pr"><span class="lab">Price</span><input type="number" min="0" step="any" inputmode="decimal" data-i="${i}" data-k="price" value="${f.price.v}" aria-label="Price of ${t}"></label>` +
      `<label class="c-dv"><span class="lab">Dividend / yr</span><input type="number" min="0" step="any" inputmode="decimal" data-i="${i}" data-k="div" value="${f.dividend.v}" aria-label="Yearly dividend per share of ${t}"></label>` +
      `<div class="c-pp"><span class="lab">Per payment</span><span class="val" id="pp${i}">${money(perPay({ div: f.dividend.v, s: f.schedule.v }), 4)}</span></div>` +
      `<label class="c-sc"><span class="lab">Pays</span><select data-i="${i}" data-k="s" aria-label="Pay schedule of ${t}">${opts}</select></label>` +
      `<label class="c-tx"><span class="lab">Tax</span><select data-i="${i}" data-k="q" aria-label="Tax type of ${t}"><option value="1"${f.tax.v ? " selected" : ""}>Qualified</option><option value="0"${!f.tax.v ? " selected" : ""}>Ordinary</option></select></label>` +
      `<div class="c-in"><span class="lab">Yearly income</span><span class="val" id="inc${i}">${money(h.shares * f.dividend.v)}</span></div>` +
      `<div class="c-rm"><button class="x" data-rm="${i}" aria-label="Remove ${t}">×</button></div></div>`;
  }).join("");
}

export function refreshRowChip(packet, i) {
  const h = packet.holdings[i], box = document.querySelector(`[data-row="${i}"] .c-id`);
  if (!h || !box) return;
  const old = box.querySelector(".chipsrc");
  const tmp = document.createElement("div");
  tmp.innerHTML = provChip(h);
  if (old) old.replaceWith(tmp.firstChild); else box.appendChild(tmp.firstChild);
}

// ---------- receipts (V2: packet + this device) ----------
export function renderReceiptsState(status, list) {
  const row = (s, title) => `<div class="state-row"><span class="pill ${s.tone}"><i></i>${esc(title)}</span><p>${esc(s.long)}</p></div>`;
  $("packetState").innerHTML = row(status.packet, status.packet.short === "saved" ? "Packet saved" : status.packet.short === "changed" ? "Packet out of date" : "No packet yet");
  $("localState").innerHTML = row(status.device, "This device") +
    (list.length ? `<p class="note muted">${list.length} portfolio${list.length > 1 ? "s" : ""} remembered here: ${list.slice(0, 4).map((x) => esc(x.name)).join(", ")}${list.length > 4 ? "…" : ""}.</p>` : "");
}
