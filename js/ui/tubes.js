// The income rack: twelve graduated test tubes, one per month. SVG glass, meniscus, faint bubbles.
// Liquid level is a CSS transform, so tubes animate smoothly (and update in place) when your numbers change.
// Tap or focus a tube to see who pays that month. Colours come from CSS variables, so both themes work.
import { compactMoney, esc, money } from "./dom.js";
import { MONTHS, calendar, calendarDetail } from "../core/calc.js";

const TOP = 14, BOTTOM = 180, H = BOTTOM - TOP; // interior of the glass in the 40x200 viewBox

function tubeHtml(i) {
  const id = `tc${i}`;
  return `<button type="button" class="tube empty" data-month="${i}" aria-pressed="false">` +
    `<span class="amt"><span class="full"></span><span class="short"></span></span>` +
    `<svg viewBox="0 0 40 200" class="tsvg" aria-hidden="true" focusable="false">` +
    `<defs><clipPath id="${id}"><path d="M10 ${TOP}V170a10 10 0 0 0 20 0V${TOP}z"/></clipPath></defs>` +
    `<path class="well" d="M10 ${TOP}V170a10 10 0 0 0 20 0V${TOP}z"/>` +
    `<g clip-path="url(#${id})"><g class="liqg" style="transform:translateY(${H + 8}px)"><rect class="liq" x="8" y="${TOP}" width="24" height="${H + 6}"/><ellipse class="men" cx="20" cy="${TOP}" rx="10" ry="2.2"/>` +
    `<g class="bubs"><circle class="bub b1" cx="16" cy="${BOTTOM - 8}" r="1.6"/><circle class="bub b2" cx="24" cy="${BOTTOM - 5}" r="1.1"/><circle class="bub b3" cx="20" cy="${BOTTOM - 10}" r="1.3"/></g></g></g>` +
    `<line class="avg" x1="5" x2="35" y1="${BOTTOM}" y2="${BOTTOM}" style="display:none"/>` +
    `<path class="glass" d="M8 8V170a12 12 0 0 0 24 0V8"/><path class="rim" d="M5 8H35"/>` +
    `<path class="tick" d="M32 ${(BOTTOM - H * 0.25).toFixed(1)}h3M32 ${(BOTTOM - H * 0.5).toFixed(1)}h4M32 ${(BOTTOM - H * 0.75).toFixed(1)}h3"/>` +
    `<rect class="gleam" x="12" y="20" width="2.2" height="120" rx="1.1"/></svg>` +
    `<span class="mlab">${MONTHS[i]}</span></button>`;
}

function patchTube(btn, i, v, max, avg) {
  const thin = avg > 0 && v < avg * 0.5;
  const frac = v > 0 ? Math.max(0.03, v / max) : 0;
  const avgFrac = avg > 0 ? avg / max : 0;
  const label = `${MONTHS[i]}: ${money(v)}${thin ? ", a thin month" : ""}`;
  btn.classList.toggle("thin", thin);
  btn.classList.toggle("empty", frac === 0);
  btn.dataset.amt = money(v);
  btn.setAttribute("aria-label", label);
  btn.querySelector(".amt .full").textContent = money(v);
  btn.querySelector(".amt .short").textContent = compactMoney(v);
  const svg = btn.querySelector(".tsvg");
  svg.style.setProperty("--rise", `-${Math.max(10, frac * H - 14).toFixed(0)}px`);
  btn.querySelector(".liqg").style.transform = `translateY(${frac === 0 ? H + 8 : ((1 - frac) * H).toFixed(2)}px)`;
  const line = btn.querySelector(".avg");
  if (avgFrac > 0) { const y = (BOTTOM - avgFrac * H).toFixed(2); line.setAttribute("y1", y); line.setAttribute("y2", y); line.style.display = ""; } else line.style.display = "none";
}

export function renderRack(root, detailEl, hs, T, selected = null) {
  const m = calendar(hs), detail = calendarDetail(hs);
  const avg = T.income / 12, max = Math.max(...m, 1e-9);
  if (root.children.length !== 12) {
    root.innerHTML = Array.from({ length: 12 }, (_, i) => tubeHtml(i)).join("");
    root.getBoundingClientRect(); // commit the empty state so the first fill animates
  }
  m.forEach((v, i) => {
    const btn = root.children[i];
    patchTube(btn, i, v, max, avg);
    btn.classList.toggle("sel", selected === i);
    btn.setAttribute("aria-pressed", String(selected === i));
  });
  showDetail(detailEl, selected, m, detail);
  return { months: m, detail };
}

export function showDetail(el, i, m, detail) {
  if (i === null || i === undefined) { el.innerHTML = '<span class="muted">Tap a tube to see who pays that month.</span>'; return; }
  const list = detail[i];
  el.innerHTML = `<b>${MONTHS[i]}</b> · ${esc(money(m[i]))}` + (list.length
    ? ` <span class="muted">from</span> ${list.map((x) => `${esc(x.t)} <span class="muted">${esc(money(x.amount))}</span>`).join(" · ")}`
    : ` <span class="muted">nothing is expected this month</span>`);
}

// A static, empty rack for the empty state.
export function emptyRackHtml() {
  return Array.from({ length: 6 }, () => `<svg viewBox="0 0 40 200" class="tsvg" aria-hidden="true" focusable="false"><path class="well" d="M10 ${TOP}V170a10 10 0 0 0 20 0V${TOP}z"/><path class="glass" d="M8 8V170a12 12 0 0 0 24 0V8"/><path class="rim" d="M5 8H35"/><path class="tick" d="M32 ${(BOTTOM - H * 0.25).toFixed(1)}h3M32 ${(BOTTOM - H * 0.5).toFixed(1)}h4M32 ${(BOTTOM - H * 0.75).toFixed(1)}h3"/><rect class="gleam" x="12" y="20" width="2.2" height="120" rx="1.1"/></svg>`).join("");
}
