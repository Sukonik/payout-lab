// "Market data" card and the review-updates sheet. Nothing here changes a holding until the user applies a choice.
import { $, esc, money, shortDate } from "./dom.js";
import { SCHED_LABEL } from "../core/calc.js";
import { SRC_LABEL } from "../core/market.js";
import { choose } from "./dialogs.js";

export function renderDataCard({ packet, market, plan }) {
  const n = plan.counts.update + plan.counts.protected;
  const pill = $("dataPill");
  if (!market.loaded) { pill.className = "pill warn"; pill.innerHTML = "<i></i>Offline data"; }
  else if (!packet.holdings.length) { pill.className = "pill"; pill.innerHTML = "<i></i>No holdings"; }
  else if (n > 0) { pill.className = "pill warn"; pill.innerHTML = `<i></i>${n} update${n > 1 ? "s" : ""} available`; }
  else { pill.className = "pill ok"; pill.innerHTML = "<i></i>Up to date"; }
  const when = market.loaded && market.updated ? `${shortDate(market.updated)}${market.source ? ", " + esc(market.source) : ""}` : "not available";
  $("dataLede").innerHTML = `Prices and dividends come from a public file refreshed on weekdays (latest ${when}). Your portfolio keeps its <b>own copy</b> of each value and the date it was observed. Nothing changes until you review updates and apply them.`;
  document.querySelectorAll('input[name="basis"]').forEach((r) => { r.checked = r.value === packet.settings.dividendBasis; });
  $("basisNote").textContent = packet.settings.dividendBasis === "indicated"
    ? "Current rate = the latest payment × how often it is paid. It reacts faster to a raise or cut and ignores one-off extras."
    : "Last 12 months = everything paid in the past year, including any special or one-off payments. The data cannot separate those from regular ones.";
  $("reviewHint").textContent = plan.counts.protected ? `${plan.counts.protected} of your own value${plan.counts.protected > 1 ? "s differ" : " differs"} from the data; they stay yours unless you choose otherwise.` : "";
}

const fmt = (field, v) => (field === "schedule" ? SCHED_LABEL[v] || v : field === "price" ? money(v, 2) : money(v, 4));

// Returns the chosen change keys, or null if the user cancelled.
export async function reviewUpdates(plan, market) {
  const real = plan.rows.filter((r) => r.changes.some((c) => c.kind !== "confirm") || r.notes.length);
  const confirms = plan.rows.flatMap((r) => r.changes.filter((c) => c.kind === "confirm"));
  const label = (r) => `<h3>${esc(r.ticker)} <small class="muted">${esc(r.name || "")}</small>${r.obs?.stale ? ` <span class="pill warn"><i></i>Provider data ${r.obs.ageDays} days old</span>` : ""}</h3>`;
  const rows = real.map((r) => `<section class="rv-row">${label(r)}` +
    r.changes.filter((c) => c.kind !== "confirm").map((c) => {
      const prov = `${esc(SRC_LABEL[r.obs?.provider] || "")} · ${esc(shortDate(r.obs?.asOf))}`;
      const what = c.kind === "protected"
        ? `<span class="muted">${esc(({ price: "Price", dividend: "Dividend", schedule: "Schedule" })[c.field])}: yours</span> <b>${esc(fmt(c.field, c.from))}</b> <span class="muted">· data says</span> <b>${esc(fmt(c.field, c.to))}</b> <span class="chipsrc manual">Replace yours</span>`
        : `<span class="muted">${esc(({ price: "Price", dividend: c.extra?.basis === "indicated" ? "Dividend (current rate)" : "Dividend (12 months)", schedule: "Pay months" })[c.field])}</span> ${esc(fmt(c.field, c.from))} → <b>${esc(fmt(c.field, c.to))}</b>`;
      return `<label class="rv-ch"><input type="checkbox" data-key="${esc(c.key)}"${c.defaultOn ? " checked" : ""}><span>${what} <small class="muted">${prov}</small></span></label>`;
    }).join("") + r.notes.map((t) => `<p class="note muted">${esc(t)}</p>`).join("") + `</section>`).join("");
  const conf = confirms.length ? `<details class="rv-conf"><summary>${confirms.length} value${confirms.length > 1 ? "s are" : " is"} unchanged but can be confirmed with a newer date</summary>${confirms.map((c) => `<label class="rv-ch"><input type="checkbox" data-key="${esc(c.key)}" checked><span class="muted">${esc(c.key.split(":")[1])} · ${esc(fmt(c.field, c.to))}</span></label>`).join("")}</details>` : "";
  let selected = null;
  const r = await choose(`<h2>Review data updates</h2><p class="muted">Observed ${esc(market.updated ? shortDate(market.updated) : "")}. Pick what to apply. Your own values stay yours unless you tick "Replace yours".</p><div class="rv-list">${rows || '<p class="muted">Nothing to change.</p>'}${conf}</div><div class="btns"><button class="btn" data-result="cancel">Cancel</button><button class="btn primary" id="rvApply" data-result="apply">Apply</button></div>`, {
    onMount(d) {
      const boxes = () => [...d.querySelectorAll("input[data-key]")];
      const btn = d.querySelector("#rvApply");
      const upd = () => { const n = boxes().filter((b) => b.checked).length; btn.textContent = n ? `Apply ${n} change${n > 1 ? "s" : ""}` : "Apply"; btn.disabled = n === 0; };
      d.addEventListener("change", upd); upd();
      btn.addEventListener("click", () => { selected = boxes().filter((b) => b.checked).map((b) => b.dataset.key); });
    },
  });
  return r === "apply" ? selected : null;
}
