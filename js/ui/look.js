// The theme menu: light/dark, and six looks (colour theme + app icon + header logo). Saved on this device only.
import { $ } from "./dom.js";
import { icon } from "./icons.js";
import { effectiveTheme, applyTheme, currentTheme, syncThemeButton } from "./shell.js";
import { DEFAULT_ICON, ICON_FILES, LOOKS, headerLogo, lookById, lookVars, normalizeLook } from "../core/looks.js";

const KEY = "payoutlab.look";
export const currentLook = () => { try { return normalizeLook(localStorage.getItem(KEY)); } catch { return null; } };
const applied = new Set();

export function applyLook(id, { save = false } = {}) {
  const root = document.documentElement, mode = effectiveTheme(), look = lookById(id);
  applied.forEach((k) => root.style.removeProperty(k)); applied.clear();
  for (const [k, v] of Object.entries(lookVars(look?.id, mode))) { root.style.setProperty(k, v); applied.add(k); }
  if (look) root.dataset.look = look.id; else delete root.dataset.look;
  const f = ICON_FILES(look?.id ?? DEFAULT_ICON);
  $("favSvg").href = f.svg; $("fav32").href = f.png32; $("fav16").href = f.png16; $("appleIcon").href = f.apple;
  const logo = headerLogo(look?.id, mode); $("logoImg").src = `assets/logo/${logo}/payout-lab-atom-${logo}.svg`;
  document.querySelectorAll(".look-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === look?.id)));
  $("lookReset").hidden = !look;
  $("lookNow").textContent = look ? `${look.name}: colors and app icon.` : "Default: Green Ion colors, forest + gold app icon, and a header mark that follows light and dark.";
  const dot = $("lookIco"); if (dot) dot.innerHTML = icon("look", 22);
  if (save) { try { if (look) localStorage.setItem(KEY, look.id); else localStorage.removeItem(KEY); } catch { /* storage blocked: the look still applies for this visit */ } }
}

export function initLook() {
  const grid = $("lookGrid");
  grid.innerHTML = LOOKS.map((l) => `<button type="button" class="look-btn" data-id="${l.id}" aria-pressed="false" title="${l.name}: ${l.tip}" style="--g1:${l.g[0]};--g2:${l.g[1]}">` +
    `<span class="look-glass" data-chip="${l.chip}"><img src="assets/logo/${l.id}/payout-lab-atom-${l.id}.svg" alt="" width="34" height="34"></span><span class="look-name">${l.name}</span></button>`).join("");
  grid.addEventListener("click", (e) => { const b = e.target.closest(".look-btn"); if (b) applyLook(b.dataset.id, { save: true }); });
  $("lookReset").addEventListener("click", () => applyLook(null, { save: true }));
  document.querySelectorAll('input[name="thememode"]').forEach((r) => r.addEventListener("change", () => { if (r.checked) applyTheme(r.value); }));
  document.querySelectorAll('input[name="thememode"]').forEach((r) => { r.checked = r.value === currentTheme(); });
  document.addEventListener("payout-theme", () => applyLook(currentLook()));
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => { applyLook(currentLook()); syncThemeButton(); });

  // The menu: a small popover under the button on wide screens, a bottom sheet with a scrim on phones.
  const pop = $("lookPop"), btn = $("lookBtn"), scrim = $("lookScrim"), mobile = () => window.matchMedia("(max-width: 760px)").matches;
  document.body.append(scrim, pop);                     // page level: the header's blur would otherwise anchor fixed children to it
  const place = () => { if (mobile()) { pop.style.top = pop.style.right = ""; return; } const r = btn.getBoundingClientRect(); pop.style.top = Math.round(r.bottom + 8) + "px"; pop.style.right = Math.max(8, Math.round(innerWidth - r.right - 8)) + "px"; };
  const open = () => { pop.hidden = false; btn.setAttribute("aria-expanded", "true"); place(); scrim.hidden = !mobile(); pop.querySelector(".look-btn[aria-pressed=true], .look-btn")?.focus(); };
  const close = (refocus = true) => { if (pop.hidden) return; pop.hidden = true; scrim.hidden = true; btn.setAttribute("aria-expanded", "false"); if (refocus) btn.focus(); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); pop.hidden ? open() : close(); });
  $("lookClose").addEventListener("click", () => close()); scrim.addEventListener("click", () => close());
  document.addEventListener("click", (e) => { if (!pop.hidden && !e.target.closest("#lookPop, #lookBtn")) close(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { e.stopPropagation(); close(); } });
  window.addEventListener("resize", () => { if (!pop.hidden) { place(); scrim.hidden = !mobile(); } });
  applyLook(currentLook());
}
