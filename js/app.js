// Application controller: one working packet, saved on this device (optional) and exported to .payout files.
import {
  APP_VERSION, LIMITS, asSeparateCopy, clampSetting, compareRevisions, migrateLegacyV1, slug, newPacket, nextRevision, packetFileName, parsePacketText, serializePacket, summarize,
} from "./core/packet.js";
import { LEGACY_KEY, openStore } from "./core/store.js";
import { inc, num, perPay, totals } from "./core/calc.js";
import { getMarket, loadMarket } from "./core/market.js";
import { applyRefreshPlan, buildRefreshPlan } from "./core/refresh.js";
import { addHolding, editField, loadSample, removeHolding, toCalc } from "./core/portfolio.js";
import { $, ago, clock, dateTime, esc, money, pct } from "./ui/dom.js";
import { askText, choose, confirmDialog, toast } from "./ui/dialogs.js";
import { renderAdd, renderConc, renderCut, renderGoal, renderTax } from "./ui/panels.js";
import { fillTickers, renderExplore } from "./ui/explore.js";
import { renderDataCard, reviewUpdates } from "./ui/data.js";
import { TEMPLATE_CSV, applyImportPlan, holdingsToCsv } from "./core/csv.js";
import { openCsvImport } from "./ui/csvimport.js";
import { bookmarkHelp, gateVisible, hideGate, showGate } from "./ui/gate.js";
import { buildFragment, parseFragment } from "./core/route.js";
import { LINK, decodeSnapshot, encodeSnapshot, rateLength, snapshotLink, workspaceLink } from "./core/link.js";
import { addReceipt, buildReceipt, compareReceipts, parseReceiptText, serializeReceipt } from "./core/receipt.js";
import { comparisonReportHtml, receiptReportHtml } from "./core/report.js";
import { compareHtml, optionList, renderReports, resolveReceipt, titleOf } from "./ui/receipts.js";
import { refreshRowChip, renderHoldingRows, renderOverview, renderReceiptsState } from "./ui/views.js";
import { applyTheme, buildNav, currentTheme, startRouter } from "./ui/shell.js";

const state = {
  store: null, packet: null, meta: {}, app: { remember: true },
  dirty: false,            // edits not yet written to this device
  sealed: true,            // the current revision may exist outside this tab (loaded, opened or exported): the next edit starts a new one
  onDevice: false,         // this portfolio exists in local storage (an untouched empty one is never stored)
  deviceSavedAt: null,     // when the working copy last reached this device's storage
  saveError: null, timer: null,
  selectedMonth: null, localList: [], market: null, plan: null,
  cmp: { a: null, b: "cur" }, workbench: [],   // comparison choices; reports opened from files live here, not in the portfolio
};
let router = null;
function goView(v) { hideGate(); router?.go(v); }

// ---------- persistence ----------
const nowIso = () => new Date().toISOString();
const canRemember = () => state.app.remember !== false && state.store.persistent;

// A revision is minted when editing starts after the current one may have been seen elsewhere (loaded from storage, opened from a
// packet, or exported). Edits after that mutate the same open revision, so history stays short and comparing copies stays exact.
function openRevision() {
  if (!state.sealed) return;
  state.packet = nextRevision(state.packet, nowIso());
  state.sealed = false;
}

async function persist(metaPatch = {}, { force = false } = {}) {
  if (!canRemember()) return;
  if (!force && !state.onDevice && !state.dirty && !state.packet.holdings.length) return;
  try {
    state.meta = { ...state.meta, ...metaPatch };
    await state.store.save(state.packet, state.meta);
    await state.store.setApp({ lastActiveId: state.packet.portfolioId });
    state.deviceSavedAt = nowIso();
    state.onDevice = true;
    state.saveError = null;
  } catch (e) {
    state.saveError = e?.name === "QuotaExceededError" ? "This browser's storage is full." : "This browser would not save the portfolio.";
  }
  await refreshLocalList();
  renderChrome();
}

async function flush() {
  clearTimeout(state.timer);
  if (state.dirty) { state.packet.savedAt = nowIso(); state.meta.lastEditedAt = state.packet.savedAt; state.dirty = false; }
  await persist(state.meta.lastEditedAt ? { lastEditedAt: state.meta.lastEditedAt } : {});
}

function mark() {
  openRevision();
  state.dirty = true;
  renderChrome();
  clearTimeout(state.timer);
  if (canRemember()) state.timer = setTimeout(flush, 500);
}

// A local backup keeps your last version when an import, sample or clear replaces it. It is a stored copy of your holdings, so
// it follows the same rule as everything else: no backup when this portfolio is not remembered on this device.
async function backupSafe(reason, packet = state.packet) {
  if (!canRemember()) return false;
  try { await state.store.backup(packet, reason); return true; } catch { return false; }
}

async function refreshLocalList() { state.localList = canRemember() ? await state.store.list().catch(() => []) : []; }

// The page's own address without its fragment: works under /payout-lab/, on a custom domain, or locally.
const baseUrl = () => location.origin + location.pathname;

async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* clipboard blocked: fall back to selecting the text */ }
  if (input) { input.focus(); input.select(); }
  return false;
}

// ---------- status: where does this work live? ----------
function exportedState() {
  const m = state.meta;
  if (!m.lastExportedAt) return "never";
  return m.lastExportedRevisionId === state.packet.revisionId && !state.dirty ? "current" : "stale";
}

export function statusModel() {
  const p = state.packet, m = state.meta;
  let device;
  if (state.saveError) device = { tone: "bad", short: "error", long: `${state.saveError} Save a packet so your work is safe.` };
  else if (state.app.remember === false) device = { tone: "warn", short: "off", long: "This portfolio is not remembered on this device. Close the tab and it is gone unless you save a packet." };
  else if (!state.store.persistent) device = { tone: "warn", short: "unavailable", long: "This browser won't let the site remember data (private mode or blocked storage). Save a packet to keep your work." };
  else if (state.dirty) device = { tone: "warn", short: "saving…", long: "Saving in this browser…" };
  else device = { tone: "ok", short: "saved", long: `Remembered in this browser${state.deviceSavedAt ? ` (${clock(state.deviceSavedAt)})` : ""}. Handy, but browsers can clear site data, so this is not a backup.` };
  const ex = exportedState();
  const packet = ex === "current" ? { tone: "ok", short: "saved", long: `Your latest changes are in the packet you saved at ${clock(m.lastExportedAt)}.` }
    : ex === "stale" ? { tone: "warn", short: "changed", long: `You have changed things since the packet you saved ${ago(m.lastExportedAt)}. Save again to update it.` }
    : { tone: "warn", short: p.holdings.length ? "not yet" : "none", long: "Save one so your portfolio survives cleared browser data and can move to other devices." };
  return { device, packet, exported: ex };
}

function renderChrome() {
  const p = state.packet, s = statusModel();
  $("pname").textContent = p.portfolioName;
  $("status").innerHTML = `<span class="st ${s.device.tone}"><i></i><b>Device</b> <em>${esc(s.device.short)}</em></span><span class="st ${s.packet.tone}"><i></i><b>Packet</b> <em>${esc(s.packet.short)}</em></span>`;
  $("tagBtn").setAttribute("aria-label", `${p.portfolioName}. Device: ${s.device.short}. Packet: ${s.packet.short}. Open portfolio details`);
  $("saveDot").hidden = !(p.holdings.length && s.exported !== "current");
  $("saveBtn").setAttribute("aria-label", s.exported === "current" ? "Save packet (up to date)" : "Save packet (changes not saved to a packet yet)");
  renderReceiptsState(s, state.localList);
  try { $("wsLink").value = workspaceLink(baseUrl(), p.portfolioId, "overview"); } catch { $("wsLink").value = ""; }
}

// ---------- rendering ----------
function renderHoldings() { renderHoldingRows(state.packet); }

function currentPlan() { return buildRefreshPlan(state.packet, state.market.tickers); }

function renderAnalysis() {
  const hs = toCalc(state.packet), S = state.packet.settings, T = totals(hs);
  state.plan = currentPlan();
  renderDataCard({ packet: state.packet, market: state.market, plan: state.plan });
  $("tVal").textContent = money(T.value); $("tInc").textContent = money(T.income); $("tMo").textContent = money(T.income / 12); $("tYld").textContent = pct(T.yield, 2);
  hs.forEach((h, i) => { const c = $("inc" + i); if (c) c.textContent = money(inc(h)); const d = $("pp" + i); if (d) d.textContent = money(perPay(h), 4); });
  renderOverview({ packet: state.packet, hs, T, selectedMonth: state.selectedMonth, plan: state.plan });
  renderConc(hs, T); renderCut(hs, T, S); renderGoal(hs, T, S); renderAdd(hs, T, S); renderTax(hs, T, S);
}

function syncInputs() {
  const S = state.packet.settings;
  document.querySelectorAll("[data-s]").forEach((el) => { const k = el.getAttribute("data-s"); if (el.type === "checkbox") el.checked = !!S[k]; else el.value = S[k]; });
}

function renderAll() { renderChrome(); renderHoldings(); syncInputs(); renderAnalysis(); renderExplore(); renderReceipts(); }

// ---------- saved reports and comparison ----------
function renderReceipts() {
  renderReports(state.packet, state.workbench);
  const opts = optionList(state.packet, state.workbench);
  const ids = opts.map((o) => o.id);
  if (!ids.includes(state.cmp.b)) state.cmp.b = "cur";
  if (!ids.includes(state.cmp.a) || state.cmp.a === undefined) state.cmp.a = state.packet.snapshots[0]?.id ?? (state.workbench[0] ? "wb:" + state.workbench[0].id : "cur");
  const fill = (id, v) => { $(id).innerHTML = opts.map((o) => `<option value="${esc(o.id)}"${o.id === v ? " selected" : ""}>${esc(o.name)}</option>`).join(""); };
  fill("cmpA", state.cmp.a); fill("cmpB", state.cmp.b);
  const A = resolveReceipt(state.cmp.a, state.packet, state.workbench), B = resolveReceipt(state.cmp.b, state.packet, state.workbench);
  $("cmpOut").innerHTML = A && B ? compareHtml(compareReceipts(A, B), A, B) : '<p class="muted">Choose two things to compare.</p>';
}

function openPrintable(html, name) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank", "noopener");
  if (!w) { download(name, html, "text/html"); toast("Your browser blocked the new tab, so the report was downloaded. Open it and print from there."); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const reportFileName = (r, ext) => `payout-report-${slug(r.portfolioName)}-${r.capturedAt.slice(0, 10).replace(/-/g, "")}-${r.id.slice(3, 9)}${ext}`;

async function saveReport() {
  if (!state.packet.holdings.length) { toast("Add holdings before saving a report."); return; }
  const r = buildReceipt(state.packet, { label: $("rcLabel").value, now: nowIso() });
  let res = addReceipt(state.packet, r);
  if (!res.added && res.reason === "full") {
    const ch = await choose(`<h2>You have ${LIMITS.maxSnapshots} saved reports</h2><p>Saving another removes the oldest one. Reports live inside your packet, so save a packet first if you want to keep the full history.</p><div class="btns"><button data-result="cancel">Cancel</button><button data-result="packet">Save packet first</button><button class="primary" data-result="trim">Remove the oldest and save</button></div>`);
    if (ch === "packet") { await savePacket(); toast("Packet saved. Save the report again to replace the oldest one."); return; }
    if (ch !== "trim") return;
    res = addReceipt(state.packet, r, { trimOldest: true });
  }
  if (!res.added) return;
  $("rcLabel").value = "";
  state.cmp = { a: r.id, b: "cur" };
  mark(); renderReceipts();
  toast(res.trimmed ? `Report saved. The oldest one (${titleOf(res.trimmed)}) was removed.` : "Report saved. It will not change when prices update. Save a packet to keep it with your portfolio.");
}

async function deleteReport(id) {
  const r = state.packet.snapshots.find((x) => x.id === id);
  if (!r) return;
  if (!(await confirmDialog({ title: "Delete this report?", body: `“${esc(titleOf(r))}” will be removed from this portfolio. Packets you already saved still contain it.`, ok: "Delete report", danger: true }))) return;
  state.packet.snapshots = state.packet.snapshots.filter((x) => x.id !== id);
  mark(); renderReceipts();
}

async function openReportFile(file) {
  if (!file) return;
  if (file.size > 1024 * 1024) { await choose(`<h2>That file is too large</h2><p>Reports are small. This does not look like one.</p><div class="btns"><button class="primary" data-result="ok">OK</button></div>`); return; }
  let text;
  try { text = await file.text(); } catch { toast("That file could not be read."); return; }
  const r = parseReceiptText(text);
  if (!r.ok) { await choose(`<h2>Couldn't open that report</h2><p>${esc(r.error.message)}</p><p class="muted">Nothing was changed.</p><div class="btns"><button class="primary" data-result="ok">OK</button></div>`); return; }
  const rc = r.receipt, have = state.packet.snapshots.some((x) => x.id === rc.id), full = state.packet.snapshots.length >= LIMITS.maxSnapshots;
  const warn = r.warnings.map((w) => `<div class="callout">${esc(w)}</div>`).join("");
  const other = rc.portfolioId !== state.packet.portfolioId ? `<div class="callout">This report is from <b>${esc(rc.portfolioName)}</b>, a different portfolio. You can still compare it, but differences may not be your own changes.</div>` : "";
  const choice = await choose(`<h2>Open this report?</h2>${warn}${other}<dl class="dl"><dt>Name</dt><dd>${esc(titleOf(rc))}</dd><dt>Portfolio</dt><dd>${esc(rc.portfolioName)}</dd><dt>Saved</dt><dd>${esc(dateTime(rc.capturedAt))}</dd><dt>Data</dt><dd>${esc(rc.dataAsOf.newest ? "as of " + rc.dataAsOf.newest : "no dated data")}</dd><dt>Income</dt><dd>${money(rc.outputs.income)} a year · ${money(rc.outputs.value)} value</dd><dt>Holdings</dt><dd>${rc.holdings.length}</dd></dl><p class="privacy">Read in your browser only. Opening it does not change your holdings.</p><div class="btns"><button data-result="cancel">Cancel</button>${have ? "" : full ? "" : '<button data-result="add">Add to my reports</button>'}<button class="primary" data-result="compare">Compare with today</button></div>${have ? '<p class="note muted">You already have this report in your history.</p>' : full ? `<p class="note muted">Your history is full (${LIMITS.maxSnapshots}), so this one can only be compared.</p>` : ""}`);
  if (!choice || choice === "cancel") return;
  if (choice === "add") { const res = addReceipt(state.packet, rc); if (res.added) { mark(); state.cmp = { a: rc.id, b: "cur" }; toast("Added to your reports."); } }
  else { if (!have && !state.workbench.some((x) => x.id === rc.id)) state.workbench.push(rc); state.cmp = { a: have ? rc.id : "wb:" + rc.id, b: "cur" }; }
  renderReceipts();
  $("cmpCard").scrollIntoView({ behavior: "smooth" });
}

// ---------- switching portfolios ----------
async function activate(packet, meta = {}, { stored = false } = {}) {
  clearTimeout(state.timer);
  state.packet = packet; state.meta = meta; state.dirty = false; state.sealed = true; state.deviceSavedAt = null; state.saveError = null; state.onDevice = stored; state.selectedMonth = null; state.workbench = []; state.cmp = { a: null, b: "cur" };
  await refreshLocalList();
  renderAll();
}

async function ensureCurrentIsSafe(actionLabel) {
  // Guest mode keeps one portfolio in memory only. Never discard unexported work silently.
  const p = state.packet;
  if (canRemember() || !p.holdings.length) return true;
  if (exportedState() === "current") return true;
  const r = await choose(`<h2>Your current portfolio isn't saved</h2><p>This browser isn't remembering it, and it has changes that aren't in a packet. ${esc(actionLabel)} would discard them.</p><div class="btns"><button data-result="cancel">Cancel</button><button data-result="discard">Discard changes</button><button class="primary" data-result="save">Save packet first</button></div>`);
  if (r === "save") { await savePacket(); return true; }
  return r === "discard";
}

// ---------- save / open packets ----------
function download(name, text, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function savePacket() {
  clearTimeout(state.timer);
  if (state.dirty) { state.packet.savedAt = nowIso(); state.meta.lastEditedAt = state.packet.savedAt; state.dirty = false; }
  const text = serializePacket(state.packet);
  // Never hand the user a backup that this app could not open again.
  const check = parsePacketText(text);
  if (!check.ok) {
    await choose(`<h2>Can't save this packet</h2><p>One of the values is outside what a packet can hold: ${esc(check.error.message)}</p><p class="muted">Nothing was downloaded. Fix that value and try again.</p><div class="btns"><button class="primary" data-result="ok">OK</button></div>`);
    return false;
  }
  download(packetFileName(state.packet), text);
  state.sealed = true;                              // this revision now exists outside the browser: the next edit starts a new one
  state.meta = { ...state.meta, lastExportedAt: nowIso(), lastExportedRevisionId: state.packet.revisionId };
  await persist();
  renderChrome();
  toast(`Packet saved: ${packetFileName(state.packet)}. It contains your holdings, so keep it private.`);
  return true;
}

const REL_TEXT = {
  identical: "You already have exactly this version.",
  "incoming-newer": "This packet is a newer version of a portfolio you already have here. Your current version is part of its history, so nothing is lost by continuing from it.",
  "incoming-older": "This packet is an older version of a portfolio you already have here.",
  diverged: "This packet and the copy on this device both changed after they last matched. Neither is newer, so Payout Lab will not choose one for you.",
};

async function importPacketFile(file) {
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) { await choose(`<h2>That file is too large</h2><p>Payout packets are small. This doesn't look like one.</p><div class="btns"><button class="primary" data-result="ok">OK</button></div>`); return; }
  let text;
  try { text = await file.text(); } catch { toast("That file could not be read."); return; }
  const r = parsePacketText(text);
  if (!r.ok) { await choose(`<h2>Couldn't open that file</h2><p>${esc(r.error.message)}</p><p class="muted">Your current portfolio was not changed.</p><div class="btns"><button class="primary" data-result="ok">OK</button></div>`); return; }
  await offerImport(r.packet, r.warnings, file.name);
}

async function offerImport(incoming, warnings, fileName) {
  const sum = summarize(incoming);
  const local = incoming.portfolioId === state.packet.portfolioId ? { packet: state.packet } : await state.store.load(incoming.portfolioId);
  const rel = local ? compareRevisions(local.packet, incoming) : "new";
  const warn = warnings.filter((w) => w.code === "checksum_mismatch").map((w) => `<div class="callout">${esc(w.message)}</div>`).join("");
  const guest = !canRemember() && state.packet.holdings.length && exportedState() !== "current"
    ? `<div class="callout">Your current portfolio isn't remembered on this device and isn't in a packet yet. Opening another portfolio will discard it. Cancel and save a packet first if you want to keep it.</div>` : "";
  const dl = `<dl class="dl"><dt>Name</dt><dd>${esc(sum.name)}</dd><dt>Holdings</dt><dd>${sum.holdings}${sum.tickers.length ? ` (${esc(sum.tickers.slice(0, 8).join(", "))}${sum.tickers.length > 8 ? "…" : ""})` : ""}</dd><dt>Saved</dt><dd>${esc(dateTime(sum.savedAt))}</dd><dt>Revision</dt><dd>${esc(sum.revisionId.slice(3, 9))}</dd><dt>Reports</dt><dd>${sum.snapshots}</dd><dt>File</dt><dd>${esc(fileName || "")}</dd></dl>`;
  let body, buttons;
  if (rel === "new") {
    body = "This is a portfolio you don't have on this device yet. Opening it keeps your current portfolio too.";
    buttons = `<button data-result="cancel">Cancel</button><button class="primary" data-result="open-new">Open this portfolio</button>`;
  } else if (rel === "identical") {
    body = REL_TEXT.identical; buttons = `<button class="primary" data-result="cancel">OK</button>`;
  } else if (rel === "incoming-newer") {
    body = REL_TEXT[rel];
    buttons = `<button data-result="cancel">Cancel</button><button data-result="copy">Open as separate copy</button><button class="primary" data-result="replace">Continue from this packet</button>`;
  } else {
    body = REL_TEXT[rel];
    buttons = `<button data-result="cancel">Cancel</button><button data-result="replace">Replace mine (backup kept)</button><button class="primary" data-result="copy">Open as separate copy</button>`;
  }
  const choice = await choose(`<h2>Open this packet?</h2>${warn}<p>${esc(body)}</p>${dl}${guest}<p class="privacy">Nothing is uploaded. This file is read in your browser only.</p><div class="btns">${buttons}</div>`);
  if (!choice || choice === "cancel") return;
  if (!(await ensureCurrentIsSafe("Opening this packet"))) return;
  await flush();
  const t = nowIso();
  if (choice === "open-new") {
    await activate(incoming, { lastEditedAt: t, lastExportedAt: t, lastExportedRevisionId: incoming.revisionId });
    await persist();
    toast(`Opened “${incoming.portfolioName}”.`);
  } else if (choice === "copy") {
    const copy = asSeparateCopy(incoming, { now: t });
    await activate(copy, { lastEditedAt: t });
    await persist();
    toast(`Opened as a separate copy: “${copy.portfolioName}”.`);
  } else if (choice === "replace") {
    const kept = await backupSafe("replaced by imported packet", local.packet);
    await activate(incoming, { lastEditedAt: t, lastExportedAt: t, lastExportedRevisionId: incoming.revisionId });
    await persist();
    toast(kept ? "Replaced. The previous version is kept as a local backup." : "Replaced. No local backup was kept (this portfolio is not remembered on this device).");
  }
  goView("overview");
}

// ---------- portfolio sheet (the specimen tag) ----------
async function openPortfolioSheet() {
  await flush();
  const s = statusModel();
  const list = state.localList;
  const cur = state.packet.portfolioId;
  const rows = list.map((x) => `<li class="${x.id === cur ? "cur" : ""}"><span><b>${esc(x.name)}</b><br><small class="muted">${x.holdings} holdings · edited ${esc(ago(x.lastEditedAt || x.savedAt))}</small></span>${x.id === cur ? '<small class="muted">Open now</small>' : `<button class="btn sm" data-result="open:${esc(x.id)}">Open</button>`}</li>`).join("");
  const row = (st, title) => `<div class="state-row"><span class="pill ${st.tone}"><i></i>${esc(title)}</span><p>${esc(st.long)}</p></div>`;
  const r = await choose(`<h2>${esc(state.packet.portfolioName)}</h2>` +
    `<p class="muted">Revision ${esc(state.packet.revisionId.slice(3, 9))} · ${state.packet.holdings.length} holdings</p>` +
    row(s.device, "Device") + row(s.packet, "Packet") +
    (rows ? `<h3 style="margin-top:14px">Portfolios on this device</h3><ul class="plist">${rows}</ul>` : "") +
    `<div class="btns"><button data-result="rename">Rename</button><button data-result="new">New portfolio</button><button data-result="open-packet">Open packet</button><button class="primary" data-result="save">Save packet</button></div>`);
  if (r === "rename") {
    const name = await askText({ title: "Rename portfolio", label: "Name", value: state.packet.portfolioName });
    if (name && name.trim()) { state.packet.portfolioName = name.trim().slice(0, 80); mark(); await flush(); }
  } else if (r === "new") {
    if (!(await ensureCurrentIsSafe("Starting a new portfolio"))) return;
    const name = await askText({ title: "New portfolio", label: "Name", value: "My portfolio", ok: "Create" });
    if (name === null) return;
    await flush();
    await activate(newPacket({ name: name.trim() || "My portfolio", now: nowIso() }), {});
    await persist({ lastEditedAt: nowIso() }, { force: true });
    goView("portfolio");
  } else if (r === "save") await savePacket();
  else if (r === "open-packet") $("fileIn").click();
  else if (r && r.startsWith("open:")) {
    const rec = await state.store.load(r.slice(5));
    if (rec) { await activate(rec.packet, rec.meta, { stored: true }); await state.store.setApp({ lastActiveId: rec.packet.portfolioId }); }
  }
}

// ---------- CSV import / export ----------
async function importCsvFile(file) {
  if (!file) return;
  const out = await openCsvImport(file, state.packet);
  if (!out) return;                                   // cancelled, invalid or too large: nothing changed
  const kept = await backupSafe("before CSV import");
  applyImportPlan(state.packet, out.rows, out.plan);
  renderHoldings(); renderAnalysis(); mark();
  await flush();                                      // makes this import its own revision
  toast(`Imported ${out.rows.length} holding${out.rows.length === 1 ? "" : "s"}${out.skipped ? `, skipped ${out.skipped} row${out.skipped > 1 ? "s" : ""}` : ""}. Revision ${state.packet.revisionId.slice(3, 9)}. ${kept ? "Your previous version is kept as a local backup." : "No local backup was kept (this portfolio is not remembered on this device), so save a packet if you want one."}`, 7000);
}

// ---------- start screen ----------
async function startScreen(mode) {
  await refreshLocalList();
  const on = {
    continue: () => goView("overview"),
    open: async (id) => { const rec = await state.store.load(id); if (rec) { await activate(rec.packet, rec.meta, { stored: true }); await state.store.setApp({ lastActiveId: id }); goView("overview"); } },
    packet: () => $("fileIn").click(),
    bookmark: async () => { const r = await bookmarkHelp(); if (r === "copied") toast("Link copied."); else if (r === "manual") toast("Select the link and copy it."); },
    sample: async () => {
      if (!(await ensureCurrentIsSafe("Starting a sample"))) return;
      await flush();
      const pk = newPacket({ name: "Sample portfolio", now: nowIso() });
      loadSample(pk);
      await activate(pk, {});
      await persist({ lastEditedAt: nowIso() }, { force: true });
      goView("overview");
    },
    create: async (name, remember) => {
      if (mode === "first") {
        state.packet.portfolioName = (name || "").trim().slice(0, 80) || "My portfolio";
        await setRemember(!!remember && state.store.persistent);
        if (canRemember()) await persist({ lastEditedAt: nowIso() }, { force: true });
        renderChrome(); goView("portfolio"); return;
      }
      if (!(await ensureCurrentIsSafe("Starting a new portfolio"))) return;
      const nm = await askText({ title: "New portfolio", label: "Name", value: "My portfolio", ok: "Create" });
      if (nm === null) return;
      await flush();
      await activate(newPacket({ name: nm.trim() || "My portfolio", now: nowIso() }), {});
      await persist({ lastEditedAt: nowIso() }, { force: true });
      goView("portfolio");
    },
  };
  showGate({ mode, packet: state.packet, meta: state.meta, list: state.localList, persistent: state.store.persistent, on });
}

// ---------- market data: review before anything changes ----------
async function checkForUpdates() {
  const btn = $("checkBtn");
  btn.disabled = true; btn.textContent = "Checking…";
  try {
    await loadMarket();
    state.market = getMarket();
    fillTickers(); renderExplore();
    if (!state.market.loaded) { toast("Couldn't reach the data file. Your values were not changed."); return; }
    const plan = currentPlan();
    renderAnalysis();
    if (!plan.rows.some((r) => r.changes.length || r.notes.length)) { toast(`Everything is up to date (data from ${state.market.updated?.slice(0, 10) ?? "the latest file"}).`); return; }
    const picked = await reviewUpdates(plan, state.market);
    if (picked && picked.length) {
      const n = applyRefreshPlan(state.packet, plan, picked, state.market.tickers);
      renderHoldings(); renderAnalysis(); mark();
      toast(`${n} value${n === 1 ? "" : "s"} updated. Your own values were kept unless you chose to replace them.`);
    }
  } finally { btn.disabled = false; btn.textContent = "Check for updates"; }
}

// ---------- snapshot links ----------
async function makeSnapshotLink() {
  if (!state.packet.holdings.length) { toast("Add holdings first. A snapshot link is a copy of them."); return; }
  const now = nowIso();
  let link = "", enc = null, version = 0;
  const label = { short: "Short: fits in most messages and a QR card.", medium: "Medium: some chat and email apps may cut a link this long. A packet file is safer.", "too-large": "Too large for a link." };
  const r = await choose(`<h2>Create a snapshot link</h2>` +
    `<div class="callout"><b>This link contains a copy of your holdings and share counts, inside the web address.</b> Anyone who has the link can read them. It is <b>not encrypted</b>: your browser history and anyone you send it to can see the contents.</div>` +
    `<p>It is a <b>dated snapshot</b> (${esc(dateTime(now))}). It does not update. If you change your portfolio, make a new link; old links keep showing the old copy. Saved reports are not included.</p>` +
    `<label class="f">Name shown on the copy<input id="snName" maxlength="80" autocomplete="off" value="${esc(state.packet.portfolioName)}"></label><p class="privacy" style="margin-top:4px">Don't put your own name or account details here.</p>` +
    `<label class="check" style="margin:12px 0"><input type="checkbox" id="snOk"> I understand that anyone with this link can see my holdings</label>` +
    `<div id="snInfo" class="muted" aria-live="polite"></div><div id="snBox"></div>` +
    `<div class="btns"><button data-result="cancel">Cancel</button><button class="primary" id="snCopy" disabled data-result="copy">Copy link</button></div>`, {
    onMount(d) {
      const nameEl = d.querySelector("#snName"), ok = d.querySelector("#snOk"), info = d.querySelector("#snInfo"), box = d.querySelector("#snBox"), btn = d.querySelector("#snCopy");
      const refresh = async () => {
        const mine = ++version;
        const e = await encodeSnapshot(state.packet, { name: nameEl.value.trim() || state.packet.portfolioName, now });
        if (mine !== version) return;
        enc = e; link = e.rating === "too-large" ? "" : snapshotLink(baseUrl(), e.params);
        info.innerHTML = e.rating === "too-large"
          ? `<span class="pill bad"><i></i>${e.chars.toLocaleString()} characters</span> This portfolio is too large for a link (the limit is ${LINK.maxChars.toLocaleString()}). Nothing was shortened. Use <b>Save packet</b> to move it instead.`
          : `<span class="pill ${e.rating === "short" ? "ok" : "warn"} sizepill"><i></i>${e.chars.toLocaleString()} characters</span> ${esc(label[e.rating])}${e.compressed ? "" : " This browser cannot compress links, so it is longer than usual."}`;
        box.innerHTML = ok.checked && link ? `<textarea class="linkbox" readonly aria-label="Snapshot link">${esc(link)}</textarea>` : "";
        btn.disabled = !(ok.checked && link);
      };
      nameEl.addEventListener("input", refresh); ok.addEventListener("change", refresh); refresh();
    },
  });
  if (r !== "copy" || !link) return;
  const done = await copyText(link, null);
  toast(done ? `Snapshot link copied (dated ${dateTime(now)}). Anyone with it can see your holdings.` : "Your browser blocked copying. Open Create a snapshot link again and copy it from the box.", 6000);
}

async function handleSnapshotLink(parsed) {
  history.replaceState(null, "", "#/overview");        // never leave the payload sitting in the address bar or history
  const fail = async (title, msg) => { await choose(`<h2>${esc(title)}</h2><p>${esc(msg)}</p><p class="muted">Nothing was changed. If you were sent this link, ask for a packet file instead.</p><div class="btns"><button data-result="packet">Open a packet</button><button class="primary" data-result="ok">OK</button></div>`).then((x) => { if (x === "packet") $("fileIn").click(); }); };
  if (parsed.bad) { await fail("That link is damaged", "It is missing parts or has characters that cannot belong to a Payout Lab snapshot."); return; }
  const d = await decodeSnapshot(parsed.params);
  if (!d.ok) { await fail("Couldn't open that link", d.error.message); return; }
  const pk = d.packet;
  const choice = await choose(`<h2>Open this snapshot?</h2><p>A snapshot link is a <b>fixed, dated copy</b>${d.madeAt ? ` made ${esc(dateTime(d.madeAt))}` : ""}. It does not update, and it is not connected to the person who made it.</p><dl class="dl"><dt>Name</dt><dd>${esc(pk.portfolioName)}</dd><dt>Holdings</dt><dd>${pk.holdings.length} (${esc(pk.holdings.slice(0, 8).map((h) => h.ticker).join(", "))}${pk.holdings.length > 8 ? "…" : ""})</dd></dl><p class="privacy">Read in your browser only. It opens as a <b>new portfolio</b>; your own portfolios are not touched.</p><div class="btns"><button data-result="cancel">Cancel</button><button class="primary" data-result="open">Open as a new portfolio</button></div>`);
  if (choice !== "open") return;
  if (!(await ensureCurrentIsSafe("Opening this snapshot"))) return;
  await flush();
  const t = nowIso();
  await activate(pk, { lastEditedAt: t });
  await persist({}, { force: true });
  toast(`Opened “${pk.portfolioName}” as a new portfolio. Your own portfolios are untouched.`);
  goView("overview");
}

async function handleWorkspaceLink(parsed) {
  const id = parsed.params.p;
  if (!/^pf_[0-9a-z]{8,32}$/.test(id) || id === state.packet.portfolioId) return;
  const rec = state.store.persistent ? await state.store.load(id) : null;
  if (rec) { await flush(); await activate(rec.packet, rec.meta, { stored: true }); await state.store.setApp({ lastActiveId: id }); toast(`Opened “${rec.packet.portfolioName}” from your bookmark.`); return; }
  const r = await choose(`<h2>That portfolio isn't on this device</h2><p>This bookmark points to a portfolio that isn't stored in this browser. <b>A bookmark carries no data and cannot bring it back.</b> If you have its packet (a .payout file), open it here.</p><div class="btns"><button data-result="ok">Continue without it</button><button class="primary" data-result="packet">Open a packet</button></div>`);
  if (r === "packet") $("fileIn").click();
}

// ---------- settings sheet ----------
async function setRemember(on) {
  state.app.remember = on;
  await state.store.setApp({ remember: on });
  if (on) {
    await persist({ lastEditedAt: nowIso() }, { force: true });
    try { await navigator.storage?.persist?.(); } catch { /* optional */ }
  } else {
    // Stop remembering: remove the on-device copy so "guest" really means guest.
    try { await state.store.remove(state.packet.portfolioId); } catch { /* ignore */ }
    state.deviceSavedAt = null; state.onDevice = false;
    await refreshLocalList();
  }
  renderChrome(); fillSettings();
}

async function forgetCurrent() {
  const r = await choose(`<h2>Delete this portfolio from this device?</h2><p>This removes “${esc(state.packet.portfolioName)}” from this browser's memory and clears the screen. Packet files you saved are not touched. Save a packet first if you don't have one.</p><div class="btns"><button data-result="cancel">Cancel</button><button data-result="save">Save packet first</button><button class="btn danger" data-result="delete">Delete from device</button></div>`);
  if (r === "save") { await savePacket(); return; }
  if (r !== "delete") return;
  clearTimeout(state.timer);
  try { await state.store.remove(state.packet.portfolioId); } catch { /* ignore */ }
  await state.store.setApp({ lastActiveId: null });
  await activate(newPacket({ now: nowIso() }), {});
  $("settings").close();
  toast("Deleted from this device.");
}

async function persistNote() {
  try {
    if (!navigator.storage?.persisted) return "";
    const ok = await navigator.storage.persisted();
    return ok ? " Your browser has agreed to keep this data unless you clear it." : " Your browser may remove this data when device storage runs low.";
  } catch { return ""; }
}

async function fillSettings() {
  const th = currentTheme();
  document.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === th; });
  $("remChk").checked = state.app.remember !== false;
  $("remChk").disabled = !state.store.persistent;
  $("storageNote").textContent = !state.store.persistent
    ? "This browser isn't letting the site store data, so nothing can be remembered. Packets still work."
    : state.app.remember === false ? "Guest mode: nothing is kept in this browser. Save a packet to keep your work."
    : `Kept in this browser (${state.store.kind === "indexeddb" ? "IndexedDB" : "local storage"}). Clearing site data removes it, so keep a packet as your backup. Browser sync for bookmarks or passwords does not sync this portfolio.${await persistNote()}`;
  $("forgetBtn").hidden = !(state.onDevice && state.store.persistent);
  const m = state.market;
  $("aboutNote").textContent = `Payout Lab ${APP_VERSION}. Public prices ${m?.loaded && m.updated ? "updated " + m.updated.slice(0, 10) + (m.source ? " · " + m.source : "") : "are starter estimates (not live)"}. Open source (MPL-2.0).`;
}

// ---------- wiring ----------
function wire() {
  $("addBtn").addEventListener("click", () => {
    const res = addHolding(state.packet, $("tk").value, $("sh").value);
    if (!res.ok) { ($("tk").value.trim() ? $("sh") : $("tk")).focus(); return; }
    $("tk").value = ""; $("sh").value = ""; $("tk").focus();
    renderHoldings(); renderAnalysis(); mark();
    if (res.status === "added-manual") toast(`No data for ${res.ticker}. Enter its price, dividend and schedule yourself.`);
  });
  [$("tk"), $("sh")].forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") $("addBtn").click(); }));
  const sample = async () => {
    if (state.packet.holdings.length && !(await confirmDialog({ title: "Replace your holdings with the sample?", body: "Your current holdings in this portfolio will be replaced by a sample portfolio. Save a packet first if you want to keep them.", ok: "Replace with sample", danger: true }))) return;
    if (state.packet.holdings.length) await backupSafe("replaced by sample portfolio");
    loadSample(state.packet); renderHoldings(); renderAnalysis(); mark();
  };
  $("sampleBtn").addEventListener("click", sample);
  $("ovSample").addEventListener("click", sample);
  $("clearBtn").addEventListener("click", async () => {
    if (!state.packet.holdings.length) return;
    if (!(await confirmDialog({ title: "Remove all holdings?", body: "This empties the current portfolio. Save a packet first if you want a copy.", ok: "Remove all", danger: true }))) return;
    await backupSafe("holdings cleared");
    state.packet.holdings = []; renderHoldings(); renderAnalysis(); mark();
  });
  $("rows").addEventListener("input", (e) => {
    const el = e.target, i = el.getAttribute("data-i"), k = el.getAttribute("data-k");
    if (i === null || !k) return;
    const value = k === "q" ? el.value === "1" : el.value;
    if (editField(state.packet, +i, k, value, nowIso().slice(0, 10))) { renderAnalysis(); mark(); }
  });
  // Refresh a row's provenance chip when an edit is finished (not per keystroke, which keeps focus stable).
  $("rows").addEventListener("change", (e) => {
    const el = e.target, i = el.getAttribute?.("data-i"), k = el.getAttribute?.("data-k");
    if (i === null || i === undefined) return;
    const h = state.packet.holdings[+i];
    if (h && (k === "shares" || k === "price" || k === "div")) el.value = k === "shares" ? h.shares : k === "price" ? h.fields.price.v : h.fields.dividend.v;
    refreshRowChip(state.packet, +i);
  });
  $("rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    removeHolding(state.packet, +b.getAttribute("data-rm")); renderHoldings(); renderAnalysis(); mark();
  });
  $("cutT").addEventListener("change", function () { state.packet.settings.cutT = this.value; renderAnalysis(); mark(); });
  $("addT").addEventListener("change", function () { state.packet.settings.addT = this.value; renderAnalysis(); mark(); });
  document.querySelectorAll("[data-s]").forEach((el) => {
    const k = el.getAttribute("data-s");
    el.addEventListener("input", () => { state.packet.settings[k] = el.type === "checkbox" ? el.checked : clampSetting(k, num(el.value)); renderAnalysis(); mark(); });
    el.addEventListener("change", () => { if (el.type !== "checkbox") el.value = state.packet.settings[k]; });
  });
  $("cal").addEventListener("click", (e) => {
    const b = e.target.closest("[data-month]"); if (!b) return;
    const i = +b.dataset.month;
    state.selectedMonth = state.selectedMonth === i ? null : i;
    renderAnalysis();
  });
  $("psq").addEventListener("input", renderExplore);
  $("psRows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    goView("portfolio");
    $("tk").value = b.getAttribute("data-add");
    setTimeout(() => $("sh").focus(), 50);
  });
  $("snapMake").addEventListener("click", makeSnapshotLink);
  $("wsCopy").addEventListener("click", async () => { toast(await copyText($("wsLink").value, $("wsLink")) ? "Bookmark link copied. It opens this portfolio on this browser only." : "Select the link and copy it."); });
  $("wsLink").addEventListener("focus", (e) => e.target.select());
  window.addEventListener("hashchange", (ev) => {
    const r = parseFragment(new URL(ev.newURL).hash);   // the router may already have tidied location.hash
    if (r.kind === "snapshot") handleSnapshotLink(r);
    else if (r.params?.p) handleWorkspaceLink(r);
  });
  $("rcSaveReport").addEventListener("click", saveReport);
  $("rcLabel").addEventListener("keydown", (e) => { if (e.key === "Enter") saveReport(); });
  $("rcOpenReport").addEventListener("click", () => $("rcFile").click());
  $("rcFile").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; await openReportFile(f); });
  $("rcList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.dataset.id, r = state.packet.snapshots.find((x) => x.id === id);
    if (b.dataset.act === "compare") { state.cmp = { a: id, b: "cur" }; renderReceipts(); $("cmpCard").scrollIntoView({ behavior: "smooth" }); }
    else if (b.dataset.act === "delete") deleteReport(id);
    else if (r && b.dataset.act === "export") download(reportFileName(r, ".json"), serializeReceipt(r), "application/json");
    else if (r && b.dataset.act === "print") openPrintable(receiptReportHtml(r), reportFileName(r, ".html"));
  });
  $("cmpA").addEventListener("change", (e) => { state.cmp.a = e.target.value; renderReceipts(); });
  $("cmpB").addEventListener("change", (e) => { state.cmp.b = e.target.value; renderReceipts(); });
  const cmpDoc = () => { const A = resolveReceipt(state.cmp.a, state.packet, state.workbench), B = resolveReceipt(state.cmp.b, state.packet, state.workbench); return A && B ? comparisonReportHtml(compareReceipts(A, B), A, B, titleOf(A), titleOf(B)) : null; };
  $("cmpPrint").addEventListener("click", () => { const h = cmpDoc(); if (h) openPrintable(h, "payout-comparison.html"); });
  $("cmpDownload").addEventListener("click", () => { const h = cmpDoc(); if (h) download("payout-comparison.html", h, "text/html"); });
  $("checkBtn").addEventListener("click", checkForUpdates);
  $("csvPick").addEventListener("click", () => $("csvIn").click());
  $("csvIn").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; await importCsvFile(f); });
  $("csvTemplate").addEventListener("click", () => download("payout-lab-holdings-template.csv", TEMPLATE_CSV, "text/csv"));
  $("csvExport").addEventListener("click", () => { if (!state.packet.holdings.length) { toast("There are no holdings to export yet."); return; } download(`${packetFileName(state.packet).replace(/\.payout$/, "")}.csv`, holdingsToCsv(state.packet), "text/csv"); });
  $("rcBookmark").addEventListener("click", async () => { const r = await bookmarkHelp(); if (r === "copied") toast("Link copied."); else if (r === "manual") toast("Select the link and copy it."); });
  document.querySelectorAll('input[name="basis"]').forEach((r) => r.addEventListener("change", () => { if (r.checked) { state.packet.settings.dividendBasis = r.value; renderAnalysis(); mark(); } }));
  $("saveBtn").addEventListener("click", savePacket);
  $("rcSave").addEventListener("click", savePacket);
  const pick = () => $("fileIn").click();
  $("rcOpen").addEventListener("click", pick);
  $("ovOpen").addEventListener("click", pick);
  document.body.insertAdjacentHTML("beforeend", '<input type="file" id="fileIn" accept=".payout,.json,application/json,text/plain,application/octet-stream" hidden>');
  $("fileIn").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; await importPacketFile(f); });
  $("tagBtn").addEventListener("click", openPortfolioSheet);
  $("rcPortfolios").addEventListener("click", openPortfolioSheet);
  // settings sheet
  $("settingsBtn").addEventListener("click", async () => { await fillSettings(); $("settings").showModal(); });
  $("settings").addEventListener("click", (e) => { if (e.target === $("settings") || e.target.closest("[data-close]")) $("settings").close(); });
  document.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener("change", () => { if (r.checked) applyTheme(r.value); }));
  $("remChk").addEventListener("change", (e) => setRemember(e.target.checked));
  $("forgetBtn").addEventListener("click", forgetCurrent);
  // Save as soon as the page is hidden (tab switch, app switch on a phone, close). visibilitychange is the reliable one on mobile.
  const saveNow = () => { if (state.dirty && canRemember()) flush(); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveNow(); });
  window.addEventListener("pagehide", saveNow);
  window.addEventListener("beforeunload", (e) => {
    if (!canRemember() && state.packet.holdings.length && exportedState() !== "current") { e.preventDefault(); e.returnValue = ""; }
  });
}

// ---------- boot ----------
async function boot() {
  const initialHash = location.hash;       // read before the router tidies the address
  buildNav();
  router = startRouter((r, user) => { if (user && gateVisible()) hideGate(); if (r.view === "receipts" && state.packet) renderReceipts(); });
  state.store = await openStore();
  state.app = { remember: true, ...(await state.store.getApp()) };
  state.market = await loadMarket();
  fillTickers();

  // 1. Bring a V1 portfolio forward once. The V1 key stays untouched, and a copy is kept in the new store.
  let migratedNote = null;
  try {
    const raw = globalThis.localStorage?.getItem(LEGACY_KEY);
    if (raw && !state.app.migratedV1 && state.store.persistent) {
      const { packet, skipped } = migrateLegacyV1(JSON.parse(raw), { now: nowIso() });
      await state.store.backend.set("legacy:v1", raw);
      await state.store.save(packet, { lastEditedAt: nowIso() });
      await state.store.setApp({ migratedV1: packet.portfolioId, lastActiveId: packet.portfolioId });
      state.app.migratedV1 = packet.portfolioId;
      migratedNote = `Your earlier portfolio was brought forward${skipped.length ? ` (${skipped.length} unreadable row${skipped.length > 1 ? "s" : ""} skipped)` : ""}. The old copy is kept as a backup.`;
    }
  } catch { /* a broken legacy value must never block the app */ }

  // 2. Continue the last portfolio, or start a new one.
  let rec = null;
  const app = await state.store.getApp();
  if (state.store.persistent) {
    const list = await state.store.list();
    rec = (app.lastActiveId && (await state.store.load(app.lastActiveId))) || (list[0] && (await state.store.load(list[0].id))) || null;
  }
  wire();
  if (rec && state.app.remember !== false) await activate(rec.packet, rec.meta, { stored: true });
  else await activate(newPacket({ now: nowIso() }), {});
  if (migratedNote) toast(migratedNote, 7000);
  // A deep link (#/lab, a bookmark with a view, a snapshot link) goes straight in. Otherwise show Continue / first-run.
  const incoming = parseFragment(initialHash);
  if (incoming.kind === "snapshot") await handleSnapshotLink(incoming);
  else if (incoming.params?.p) await handleWorkspaceLink(incoming);
  if (!incoming.explicit) await startScreen(rec && state.app.remember !== false ? "returning" : "first");
  document.documentElement.dataset.ready = "1";
}

boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML("afterbegin", `<p style="padding:20px;color:#b42318">Payout Lab could not start: ${esc(e.message)}</p>`); });
