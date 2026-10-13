// App chrome: tab navigation (desktop bar + phone bottom bar), fragment router, appearance.
import { $ } from "./dom.js";
import { icon } from "./icons.js";
import { VIEWS, VIEW_LABELS, parseFragment } from "../core/route.js";

const THEME_KEY = "payoutlab.theme";

export function buildNav() {
  const html = VIEWS.map((v) => `<a href="#/${v}" data-view="${v}">${icon(v, 22)}<span>${VIEW_LABELS[v]}</span></a>`).join("");
  $("tabs").innerHTML = html;
  $("bottomnav").innerHTML = html;
  $("saveIco").innerHTML = icon("save", 20);
  $("gearIco").innerHTML = icon("gear", 22);
}

// Static client-side routing: #/overview, #/portfolio, #/lab, #/receipts, #/explore. Unknown routes recover to the overview.
export function startRouter(onShow) {
  let current = null;
  const apply = (userInitiated) => {
    const r = parseFragment(location.hash);
    if (!r.valid) history.replaceState(null, "", "#/overview");
    show(r.view, userInitiated);
    onShow?.(r, userInitiated);
  };
  function show(view, userInitiated) {
    const changed = view !== current;
    current = view;
    document.querySelectorAll(".view").forEach((s) => { s.hidden = s.dataset.view !== view; });
    document.querySelectorAll("#tabs a, #bottomnav a").forEach((a) => {
      if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = `${VIEW_LABELS[view]} · Payout Lab`;
    if (changed) {
      window.scrollTo(0, 0);
      if (userInitiated) $(`h-${view}`)?.focus({ preventScroll: true });
    }
  }
  window.addEventListener("hashchange", () => apply(true));
  apply(false);
  return { go(view) { location.hash = `#/${view}`; }, current: () => current };
}

// ---------- appearance ----------
export function currentTheme() {
  try { const t = localStorage.getItem(THEME_KEY); if (t === "light" || t === "dark") return t; } catch { /* ignore */ }
  return "auto";
}
export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode); else root.removeAttribute("data-theme");
  try { if (mode === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, mode); } catch { /* ignore */ }
}
