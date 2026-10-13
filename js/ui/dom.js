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
