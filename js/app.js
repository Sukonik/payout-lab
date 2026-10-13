// Application controller: one working packet, saved on this device (optional) and exported to .payout files.
import {
  APP_VERSION, asSeparateCopy, clampSetting, compareRevisions, migrateLegacyV1, newPacket, nextRevision, packetFileName, parsePacketText, serializePacket, summarize,
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
import { parseFragment } from "./core/route.js";
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

function renderAll() { renderChrome(); renderHoldings(); syncInputs(); renderAnalysis(); renderExplore(); }

// ---------- switching portfolios ----------
async function activate(packet, meta = {}, { stored = false } = {}) {
  clearTimeout(state.timer);
  state.packet = packet; state.meta = meta; state.dirty = false; state.sealed = true; state.deviceSavedAt = null; state.saveError = null; state.onDevice = stored; state.selectedMonth = null;
  await refreshLocalList();
  renderAll();
}

async function ensureCurrentIsSafe(actionLabel) {
  // Guest mode keeps one portfolio in memory only. Never discard unexported work silently.
  const p = state.packet;
  if (canRemember() || !p.holdings.length) return true;
  if (exportedState() === "current") return true;
  const r = await choose(`<h2>Your current portfolio isn't saved</h2><p>This browser isn't remembering it, and it has changes that aren't in a packet. ${esc(actionLabel)} would discard them.</p><div class="btns"><button class="btn" data-result="cancel">Cancel</button><button class="btn" data-result="discard">Discard changes</button><button class="btn primary" data-result="save">Save packet first</button></div>`);
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
    await choose(`<h2>Can't save this packet</h2><p>One of the values is outside what a packet can hold: ${esc(check.error.message)}</p><p class="muted">Nothing was downloaded. Fix that value and try again.</p><div class="btns"><button class="btn primary" data-result="ok">OK</button></div>`);
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
  if (file.size > 6 * 1024 * 1024) { await choose(`<h2>That file is too large</h2><p>Payout packets are small. This doesn't look like one.</p><div class="btns"><button class="btn primary" data-result="ok">OK</button></div>`); return; }
  let text;
  try { text = await file.text(); } catch { toast("That file could not be read."); return; }
  const r = parsePacketText(text);
  if (!r.ok) { await choose(`<h2>Couldn't open that file</h2><p>${esc(r.error.message)}</p><p class="muted">Your current portfolio was not changed.</p><div class="btns"><button class="btn primary" data-result="ok">OK</button></div>`); return; }
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
    buttons = `<button class="btn" data-result="cancel">Cancel</button><button class="btn primary" data-result="open-new">Open this portfolio</button>`;
  } else if (rel === "identical") {
    body = REL_TEXT.identical; buttons = `<button class="btn primary" data-result="cancel">OK</button>`;
  } else if (rel === "incoming-newer") {
    body = REL_TEXT[rel];
    buttons = `<button class="btn" data-result="cancel">Cancel</button><button class="btn" data-result="copy">Open as separate copy</button><button class="btn primary" data-result="replace">Continue from this packet</button>`;
  } else {
    body = REL_TEXT[rel];
    buttons = `<button class="btn" data-result="cancel">Cancel</button><button class="btn" data-result="replace">Replace mine (backup kept)</button><button class="btn primary" data-result="copy">Open as separate copy</button>`;
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
    `<div class="btns"><button class="btn" data-result="rename">Rename</button><button class="btn" data-result="new">New portfolio</button><button class="btn" data-result="open-packet">Open packet</button><button class="btn primary" data-result="save">Save packet</button></div>`);
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
  const r = await choose(`<h2>Delete this portfolio from this device?</h2><p>This removes “${esc(state.packet.portfolioName)}” from this browser's memory and clears the screen. Packet files you saved are not touched. Save a packet first if you don't have one.</p><div class="btns"><button class="btn" data-result="cancel">Cancel</button><button class="btn" data-result="save">Save packet first</button><button class="btn danger" data-result="delete">Delete from device</button></div>`);
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
  buildNav();
  router = startRouter((r, user) => { if (user && gateVisible()) hideGate(); });
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
  // A deep link (#/lab, a bookmark with a view) goes straight in. Otherwise show Continue / first-run.
  if (!parseFragment(location.hash).explicit) await startScreen(rec && state.app.remember !== false ? "returning" : "first");
  document.documentElement.dataset.ready = "1";
}

boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML("afterbegin", `<p style="padding:20px;color:#b42318">Payout Lab could not start: ${esc(e.message)}</p>`); });
