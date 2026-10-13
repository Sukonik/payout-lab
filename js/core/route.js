// Static fragment routing for GitHub Pages: #/<view>?key=value. No server rewrites needed.
// The same grammar carries workspace bookmarks and snapshot links later (see issue #7), so keep it small and strict.
export const VIEWS = ["overview", "portfolio", "lab", "receipts", "explore"];
export const VIEW_LABELS = { overview: "Overview", portfolio: "Portfolio", lab: "Lab", receipts: "Receipts", explore: "Explore" };

const KEY_RE = /^[a-z][a-z0-9_]{0,15}$/;
const VAL_RE = /^[A-Za-z0-9_.~-]{0,64}$/;

// Snapshot links carry a compressed copy of a portfolio in the fragment (see core/link.js): #/snapshot?v=1&c=1&d=<base64url>.
// The payload is far longer than a normal parameter, so it has its own strict grammar.
const SNAP_D = /^[A-Za-z0-9_-]{1,12000}$/;

// Parse location.hash. Unknown or malformed routes recover to the overview and are flagged so the caller can tidy the address.
export function parseFragment(hash) {
  const h = String(hash ?? "").replace(/^#/, "");
  if (h === "" || h === "/") return { view: "overview", params: {}, valid: true, explicit: false };
  if (h.startsWith("/snapshot?") || h === "/snapshot") {
    const q = {};
    for (const part of h.slice(10).split("&")) { const [k, v = ""] = part.split("="); if (["v", "c", "d"].includes(k) && !(k in q)) q[k] = v; }
    const ok = /^\d{1,2}$/.test(q.v ?? "") && /^[01]$/.test(q.c ?? "") && SNAP_D.test(q.d ?? "");
    return ok ? { view: "overview", kind: "snapshot", params: { v: q.v, c: q.c, d: q.d }, valid: true, explicit: true }
      : { view: "overview", kind: "snapshot", params: {}, valid: false, explicit: true, bad: true };
  }
  const m = /^\/([a-z]+)(?:\?(.*))?$/.exec(h);
  if (!m || !VIEWS.includes(m[1])) return { view: "overview", params: {}, valid: false, explicit: false };
  const params = {};
  if (m[2]) {
    for (const part of m[2].split("&")) {
      const [k, v = ""] = part.split("=");
      if (KEY_RE.test(k) && VAL_RE.test(v)) params[k] = v; // silently ignore anything else
    }
  }
  return { view: m[1], params, valid: true, explicit: true };
}

export function buildFragment(view, params = {}) {
  const v = VIEWS.includes(view) ? view : "overview";
  const q = Object.entries(params).filter(([k, val]) => KEY_RE.test(k) && VAL_RE.test(String(val))).map(([k, val]) => `${k}=${val}`).join("&");
  return `#/${v}${q ? "?" + q : ""}`;
}
