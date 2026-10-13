// CSV import dialog: map columns, preview every effect, choose how to combine with current holdings, then apply.
// The file is read in this browser. Nothing is uploaded. Only the columns you map are read; account-style columns are ignored.
import { esc } from "./dom.js";
import { choose } from "./dialogs.js";
import { LIMITS } from "../core/packet.js";
import { CSV_LIMITS, FIELDS, MODES, buildImportPlan, consolidate, guessMapping, parseCsv, parseRows, privateColumns } from "../core/csv.js";

const MODE_HELP = {
  set: "Each ticker in the file gets the file's share count. Holdings that are not in the file stay as they are. Safe for a full export.",
  replace: "Your holdings become exactly what is in the file. Others are removed. A backup of your current portfolio is kept.",
  add: "The file's shares are added on top of what you hold. Only use this for new purchases, or a full export will double your shares.",
};
const ACTION = { new: "New holding", same: "No change" };

export async function openCsvImport(file, packet) {
  const info = (title, msg) => choose(`<h2>${esc(title)}</h2><p>${esc(msg)}</p><p class="muted">Your portfolio was not changed.</p><div class="btns"><button class="btn primary" data-result="ok">OK</button></div>`);
  if (file.size > CSV_LIMITS.maxChars) { await info("That file is too large", "Holdings files are small. This doesn't look like one."); return null; }
  let text;
  try { text = await file.text(); } catch { await info("Couldn't read that file", "The file could not be read."); return null; }
  const parsed = parseCsv(text);
  if (!parsed.ok) { await info("Couldn't import that file", parsed.error.message); return null; }

  const hidden = new Set(privateColumns(parsed.headers));
  const st = { mapping: guessMapping(parsed.headers), mode: "set", validOnly: false };
  let outcome = null;

  const compute = () => {
    const rows = parseRows(parsed.rows, st.mapping);
    const cons = consolidate(rows);
    const plan = buildImportPlan(packet, cons.rows, st.mode);
    return { rows, cons, plan };
  };

  const view = () => {
    const { rows, cons, plan } = compute();
    const valid = cons.rows.length, bad = cons.invalid;
    const selects = FIELDS.map((f) => `<label class="f">${esc(f.label)}${f.required ? " *" : ""}<select data-map="${f.key}"><option value="-1"${st.mapping[f.key] < 0 ? " selected" : ""}>${f.required ? "Choose a column…" : "Not in this file"}</option>${parsed.headers.map((h, i) => (hidden.has(i) ? "" : `<option value="${i}"${st.mapping[f.key] === i ? " selected" : ""}>${esc(h || "(blank heading)")}</option>`)).join("")}</select></label>`).join("");
    const first = new Map(), seen = new Set();
    const body = rows.slice(0, CSV_LIMITS.previewRows).map((r) => {
      let result, cls = "";
      if (r.errors.length) { result = "Skipped"; cls = "neg"; }
      else {
        const it = plan.items.find((x) => x.ticker === r.ticker);
        if (first.has(r.ticker)) result = `Combined with row ${first.get(r.ticker)}`;
        else {
          first.set(r.ticker, r.row);
          result = !it ? "" : it.action === "update" ? `Shares ${it.from} → ${it.to}` : it.action === "increase" ? `+${r.shares} (total ${it.to})` : ACTION[it.action] || "";
        }
      }
      // The first row of a duplicated ticker also carries the notes about combining its rows.
      const group = !r.errors.length && !seen.has(r.ticker) ? cons.rows.find((x) => x.ticker === r.ticker)?.warnings.filter((w) => !r.warnings.includes(w)) ?? [] : [];
      seen.add(r.ticker);
      const notes = [...r.errors.map((e) => `<span class="neg">${esc(e)}</span>`), ...r.warnings.map((w) => `<span class="muted">${esc(w)}</span>`), ...group.map((w) => `<span class="muted">${esc(w)}</span>`)].join("<br>");
      return `<tr><td>${r.row}</td><td><b>${esc(r.ticker || "")}</b></td><td class="num">${r.errors.length ? "" : esc(String(r.shares))}</td><td class="${cls}">${esc(result)}</td><td>${notes}</td></tr>`;
    }).join("");
    const needMap = st.mapping.ticker < 0 || st.mapping.shares < 0;
    const modeBox = packet.holdings.length
      ? `<fieldset class="modes"><legend>How should this combine with your ${packet.holdings.length} current holding${packet.holdings.length > 1 ? "s" : ""}?</legend>${Object.entries(MODES).map(([k, label]) => `<label class="mode"><input type="radio" name="mode" value="${k}"${st.mode === k ? " checked" : ""}><span><b>${esc(label)}</b><small class="muted">${esc(MODE_HELP[k])}</small></span></label>`).join("")}</fieldset>` : "";
    const over = cons.overLimit?.length ? `<p class="callout">Combined shares for ${esc(cons.overLimit.join(", "))} are unrealistically large, so ${cons.overLimit.length > 1 ? "they were" : "it was"} skipped.</p>` : "";
    const removed = plan.removed.length ? `<p class="callout">Will be removed: ${esc(plan.removed.map((x) => x.ticker).join(", "))}.</p>` : "";
    const counts = `${rows.length} row${rows.length === 1 ? "" : "s"} read · <b>${valid}</b> holding${valid === 1 ? "" : "s"} ready` + (bad ? ` · <b class="neg">${bad} row${bad > 1 ? "s" : ""} with problems</b>` : "") + (cons.merged ? ` · ${cons.merged} duplicate row${cons.merged > 1 ? "s" : ""} combined` : "") + (plan.counts.ownValues ? ` · ${plan.counts.ownValues} with your own price/dividend/schedule (kept as yours)` : "") + (plan.counts.unknown ? ` · ${plan.counts.unknown} unknown ticker${plan.counts.unknown > 1 ? "s" : ""} need a price and dividend` : "");
    const skip = bad && valid ? `<label class="check" style="margin:10px 0"><input type="checkbox" id="ciSkip"${st.validOnly ? " checked" : ""}> Import the ${valid} valid holding${valid > 1 ? "s" : ""} and skip the ${bad} row${bad > 1 ? "s" : ""} with problems</label>` : "";
    const blocked = needMap ? "Choose the ticker and shares columns to continue." : plan.tooMany ? `That would be more than ${LIMITS.maxHoldings} holdings.` : !valid ? "No valid rows to import." : bad && !st.validOnly ? "Tick the box to import only the valid rows, or fix the file and try again." : "";
    return { html: `<p class="privacy" style="margin-top:0">Read in your browser, never uploaded. Only the columns you map here are used${hidden.size ? `; ${hidden.size} column${hidden.size > 1 ? "s that look" : " that looks"} like account details ${hidden.size > 1 ? "are" : "is"} ignored` : ""}.</p>` +
      `<details class="mapbox"${needMap || valid === 0 ? " open" : ""}><summary><b>Columns used:</b> ${esc(FIELDS.filter((f) => st.mapping[f.key] >= 0).map((f) => `${f.label} ← ${parsed.headers[st.mapping[f.key]] || "(blank)"}`).join(" · ") || "none yet")} <span class="linkbtn">Change</span></summary><div class="map">${selects}</div></details>${modeBox}<p class="note">${counts}</p>${over}${removed}` +
      `<div class="tablewrap" style="margin-top:10px;max-height:240px;overflow:auto"><table class="ptable"><thead><tr><th>Row</th><th>Ticker</th><th class="num">Shares</th><th>Result</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table></div>` +
      (rows.length > CSV_LIMITS.previewRows ? `<p class="note muted">Showing the first ${CSV_LIMITS.previewRows} of ${rows.length} rows.</p>` : "") + skip +
      (blocked ? `<p class="note neg">${esc(blocked)}</p>` : ""), blocked, valid, bad, cons, plan };
  };

  await choose(`<h2>Import holdings from CSV</h2><div id="ciBody"></div><div class="btns"><button class="btn" data-result="cancel">Cancel</button><button class="btn primary" id="ciApply" data-result="apply">Import</button></div>`, {
    className: "wide",
    onMount(d) {
      const box = d.querySelector("#ciBody"), btn = d.querySelector("#ciApply");
      let cur;
      const paint = () => {
        cur = view(); box.innerHTML = cur.html;
        btn.disabled = !!cur.blocked;
        btn.textContent = cur.valid ? `Import ${cur.valid} holding${cur.valid > 1 ? "s" : ""}` : "Import";
      };
      d.addEventListener("change", (e) => {
        const t = e.target;
        if (t.dataset?.map) st.mapping[t.dataset.map] = +t.value;
        else if (t.name === "mode") st.mode = t.value;
        else if (t.id === "ciSkip") st.validOnly = t.checked;
        else return;
        paint();
      });
      btn.addEventListener("click", () => { if (!cur.blocked) outcome = { rows: cur.cons.rows, plan: cur.plan, skipped: cur.bad }; });
      paint();
    },
  }).then((r) => { if (r !== "apply") outcome = null; });
  return outcome;
}
