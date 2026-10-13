export const $ = (id) => document.getElementById(id);
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function money(v, d = 0) {
  const a = Math.abs(v || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v < 0 ? "-" : "") + "$" + a;
}
export function pct(v, d) { return ((v || 0) * 100).toFixed(d == null ? 1 : d) + "%"; }

const rtf = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
export function ago(iso, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(s);
  if (!rtf) return new Date(iso).toLocaleString();
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString();
}
export function clock(iso) { return iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; }
export function dateTime(iso) { return iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never"; }

// Count a number up or down to its new value. Skipped for reduced motion and on first paint.
const reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: true };
export function tween(el, to, format) {
  const from = el._tv;
  el._tv = to;
  if (el._raf) cancelAnimationFrame(el._raf);
  if (from === undefined || reduce.matches || from === to) { el.textContent = format(to); return; }
  const t0 = performance.now(), dur = 420;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = format(from + (to - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step); else el.textContent = format(to);
  };
  el._raf = requestAnimationFrame(step);
}
export function shortDate(d) {
  if (!d) return "";
  const x = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Short money for tight spaces ("105", "1.2k", "12k"), without the currency sign.
export function compactMoney(v) {
  const a = Math.abs(v || 0);
  if (a >= 10000) return Math.round(a / 1000) + "k";
  if (a >= 1000) return (a / 1000).toFixed(1) + "k";
  return String(Math.round(a));
}
