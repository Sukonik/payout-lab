// Application controller: one working packet, saved on this device (optional) and exported to .payout files.
import {
  asSeparateCopy, compareRevisions, migrateLegacyV1, newPacket, nextRevision, packetFileName, parsePacketText, serializePacket, summarize, FILE_EXTENSION,
} from "./core/packet.js";
import { LEGACY_KEY, openStore } from "./core/store.js";
import { SCHED_LABEL, inc, num, perPay, totals } from "./core/calc.js";
import { getMarket, loadMarket } from "./core/market.js";
import { addHolding, editField, loadSample, removeHolding, toCalc } from "./core/portfolio.js";
import { $, ago, clock, dateTime, esc, money, pct } from "./ui/dom.js";
import { askText, choose, confirmDialog, toast } from "./ui/dialogs.js";
import { renderAdd, renderCalendar, renderConc, renderCut, renderGoal, renderTax } from "./ui/panels.js";
import { fillTickers, renderExplore } from "./ui/explore.js";

const state = {
  store: null, packet: null, meta: {}, app: { remember: true },
  dirty: false,            // edits not yet turned into a revision
  onDevice: false,         // this portfolio exists in local storage (an untouched empty one is never stored)
  deviceSavedAt: null,     // when the working copy last reached this device's storage
  saveError: null, timer: null,
};

// ---------- persistence ----------
const nowIso = () => new Date().toISOString();
const canRemember = () => state.app.remember !== false && state.store.persistent;

function commitRevision() {
  if (!state.dirty) return;
  state.packet = nextRevision(state.packet, nowIso());
  state.dirty = false;
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
  renderBar();
}

async function flush() {
  clearTimeout(state.timer);
  if (state.dirty) { commitRevision(); state.meta.lastEditedAt = nowIso(); }
  await persist(state.meta.lastEditedAt ? { lastEditedAt: state.meta.lastEditedAt } : {});
}

function mark() {
  state.dirty = true;
  renderBar();
  clearTimeout(state.timer);
  if (canRemember()) state.timer = setTimeout(flush, 700);
}

// ---------- header bar ----------
function exportedState() {
  const m = state.meta;
  if (!m.lastExportedAt) return "never";
  return m.lastExportedRevisionId === state.packet.revisionId && !state.dirty ? "current" : "stale";
}

function renderBar() {
  const p = state.packet;
  $("pname").textContent = p.portfolioName;
  let dev;
  if (state.saveError) dev = ["bad", `Not saved on this device. ${state.saveError} Save a packet instead.`];
  else if (state.app.remember === false) dev = ["warn", "Guest mode: not remembered on this device"];
  else if (!state.store.persistent) dev = ["warn", "This browser can't remember data. Save a packet to keep your work."];
  else if (state.dirty) dev = ["warn", "Saving on this device…"];
  else dev = ["ok", state.deviceSavedAt ? `Saved on this device · ${clock(state.deviceSavedAt)}` : "Saved on this device"];
  const ex = exportedState();
  const pk = ex === "current" ? ["ok", `Packet saved · ${clock(state.meta.lastExportedAt)}`]
    : ex === "stale" ? ["warn", `Changes since last packet (${ago(state.meta.lastExportedAt)})`]
    : ["warn", p.holdings.length ? "Not saved to a packet yet" : "No packet saved yet"];
  $("chips").innerHTML = `<span class="chip ${dev[0]}"><i></i>${esc(dev[1])}</span><span class="chip ${pk[0]}"><i></i>${esc(pk[1])}</span>` +
    `<span class="chip" title="Revision ${esc(p.revisionId)}">rev ${esc(p.revisionId.slice(3, 9))}</span>`;
}

// ---------- holdings + analysis ----------
function renderHoldings() {
  const tb = $("rows");
  const hs = state.packet.holdings;
  if (!hs.length) { tb.innerHTML = '<tr><td colspan="9" class="empty">No holdings yet. Add a ticker above, or load the sample portfolio to try it out.</td></tr>'; return; }
  tb.innerHTML = hs.map((h, i) => {
    const f = h.fields, manual = f.price.manual || f.dividend.manual || f.schedule.manual;
    const opts = Object.keys(SCHED_LABEL).map((k) => `<option value="${k}"${f.schedule.v === k ? " selected" : ""}>${SCHED_LABEL[k]}</option>`).join("");
    return `<tr><td><b>${esc(h.ticker)}</b>${manual ? '<span class="badge">manual</span>' : ""}<div class="sub" title="${esc(h.name)}">${esc(h.name || "Enter price, dividend, and schedule")}</div></td>` +
      `<td><input type="number" min="0" step="any" data-i="${i}" data-k="shares" value="${h.shares}" aria-label="Shares of ${esc(h.ticker)}"></td>` +
      `<td><input type="number" min="0" step="any" data-i="${i}" data-k="price" value="${f.price.v}" aria-label="Price of ${esc(h.ticker)}"></td>` +
      `<td><input type="number" min="0" step="any" data-i="${i}" data-k="div" value="${f.dividend.v}" aria-label="Yearly dividend per share of ${esc(h.ticker)}"></td>` +
      `<td class="num" id="pp${i}">${money(perPay({ div: f.dividend.v, s: f.schedule.v }), 4)}</td>` +
      `<td><select data-i="${i}" data-k="s" aria-label="Pay schedule of ${esc(h.ticker)}">${opts}</select></td>` +
      `<td><select data-i="${i}" data-k="q" aria-label="Tax type of ${esc(h.ticker)}"><option value="1"${f.tax.v ? " selected" : ""}>Qualified</option><option value="0"${!f.tax.v ? " selected" : ""}>Ordinary</option></select></td>` +
      `<td class="num" id="inc${i}">${money(h.shares * f.dividend.v)}</td>` +
      `<td><button class="x" data-rm="${i}" aria-label="Remove ${esc(h.ticker)}">×</button></td></tr>`;
  }).join("");
}

function renderAnalysis() {
  const hs = toCalc(state.packet), S = state.packet.settings, T = totals(hs);
  $("tVal").textContent = money(T.value); $("tInc").textContent = money(T.income); $("tMo").textContent = money(T.income / 12); $("tYld").textContent = pct(T.yield, 2);
  hs.forEach((h, i) => { const c = $("inc" + i); if (c) c.textContent = money(inc(h)); const d = $("pp" + i); if (d) d.textContent = money(perPay(h), 4); });
  renderCalendar(hs, T); renderConc(hs, T); renderCut(hs, T, S); renderGoal(hs, T, S); renderAdd(hs, T, S); renderTax(hs, T, S);
}

function syncInputs() {
  const S = state.packet.settings;
  document.querySelectorAll("[data-s]").forEach((el) => { const k = el.getAttribute("data-s"); if (el.type === "checkbox") el.checked = !!S[k]; else el.value = S[k]; });
}

function renderAll() { renderBar(); renderHoldings(); syncInputs(); renderAnalysis(); renderExplore(); }

// ---------- switching portfolios ----------
async function activate(packet, meta = {}, { stored = false } = {}) {
  clearTimeout(state.timer);
  state.packet = packet; state.meta = meta; state.dirty = false; state.deviceSavedAt = null; state.saveError = null; state.onDevice = stored;
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
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function savePacket() {
  clearTimeout(state.timer);
  if (state.dirty) { commitRevision(); state.meta.lastEditedAt = nowIso(); }
  const text = serializePacket(state.packet);
  download(packetFileName(state.packet), text);
  state.meta = { ...state.meta, lastExportedAt: nowIso(), lastExportedRevisionId: state.packet.revisionId };
  await persist();
  renderBar();
  toast(`Packet saved: ${packetFileName(state.packet)}. It contains your holdings, so keep it private.`);
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
    const target = local.packet;
    try { await state.store.backup(target, "replaced by imported packet"); } catch { /* backup is best-effort */ }
    await activate(incoming, { lastEditedAt: t, lastExportedAt: t, lastExportedRevisionId: incoming.revisionId });
    await persist();
    toast("Replaced. The previous version is kept as a local backup.");
  }
}

// ---------- portfolio picker ----------
async function openPortfolios() {
  await flush();
  const list = canRemember() ? await state.store.list() : [];
  const cur = state.packet.portfolioId;
  const rows = list.map((x) => `<li class="${x.id === cur ? "cur" : ""}"><span><b>${esc(x.name)}</b><br><small class="muted">${x.holdings} holdings · edited ${esc(ago(x.lastEditedAt || x.savedAt))}</small></span>${x.id === cur ? '<small class="muted">Open now</small>' : `<button data-result="open:${esc(x.id)}">Open</button>`}</li>`).join("");
  const r = await choose(`<h2>Portfolios on this device</h2>${rows ? `<ul class="plist">${rows}</ul>` : '<p class="muted">Only the portfolio you have open exists right now.</p>'}` +
    `<label class="check" style="margin:8px 0"><input type="checkbox" id="remChk" ${state.app.remember !== false ? "checked" : ""}> Remember portfolios on this device</label>` +
    `<p class="privacy">${state.store.persistent ? "Remembered portfolios live in this browser's storage. Clearing site data removes them, so keep a packet as your backup." : "This browser isn't letting the site store data, so nothing can be remembered. Packets still work."}</p>` +
    `<div class="btns"><button data-result="rename">Rename this portfolio</button><button data-result="new">New portfolio</button><button class="primary" data-result="close">Done</button></div>`, {
    onMount(d) { d.querySelector("#remChk").addEventListener("change", async (e) => { await setRemember(e.target.checked); }); },
  });
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
  } else if (r && r.startsWith("open:")) {
    const rec = await state.store.load(r.slice(5));
    if (rec) { await activate(rec.packet, rec.meta, { stored: true }); await state.store.setApp({ lastActiveId: rec.packet.portfolioId }); }
  }
}

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
  }
  renderBar();
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
  $("sampleBtn").addEventListener("click", async () => {
    if (state.packet.holdings.length && !(await confirmDialog({ title: "Replace your holdings with the sample?", body: "Your current holdings in this portfolio will be replaced by a sample portfolio. Save a packet first if you want to keep them.", ok: "Replace with sample", danger: true }))) return;
    if (state.packet.holdings.length) { try { await state.store.backup(state.packet, "replaced by sample portfolio"); } catch { /* best-effort */ } }
    loadSample(state.packet); renderHoldings(); renderAnalysis(); mark();
  });
  $("clearBtn").addEventListener("click", async () => {
    if (!state.packet.holdings.length) return;
    if (!(await confirmDialog({ title: "Remove all holdings?", body: "This empties the current portfolio. Save a packet first if you want a copy.", ok: "Remove all", danger: true }))) return;
    try { await state.store.backup(state.packet, "holdings cleared"); } catch { /* best-effort */ }
    state.packet.holdings = []; renderHoldings(); renderAnalysis(); mark();
  });
  $("rows").addEventListener("input", (e) => {
    const el = e.target, i = el.getAttribute("data-i"), k = el.getAttribute("data-k");
    if (i === null || !k) return;
    const value = k === "q" ? el.value === "1" : el.value;
    if (editField(state.packet, +i, k, value, nowIso().slice(0, 10))) { renderAnalysis(); mark(); }
  });
  $("rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    removeHolding(state.packet, +b.getAttribute("data-rm")); renderHoldings(); renderAnalysis(); mark();
  });
  $("cutT").addEventListener("change", function () { state.packet.settings.cutT = this.value; renderAnalysis(); mark(); });
  $("addT").addEventListener("change", function () { state.packet.settings.addT = this.value; renderAnalysis(); mark(); });
  document.querySelectorAll("[data-s]").forEach((el) => {
    const k = el.getAttribute("data-s");
    el.addEventListener("input", () => { state.packet.settings[k] = el.type === "checkbox" ? el.checked : num(el.value); renderAnalysis(); mark(); });
  });
  $("psq").addEventListener("input", renderExplore);
  $("psRows").addEventListener("click", (e) => { const b = e.target.closest("[data-add]"); if (!b) return; $("tk").value = b.getAttribute("data-add"); $("holdingsPanel").scrollIntoView({ behavior: "smooth" }); $("sh").focus(); });
  $("saveBtn").addEventListener("click", savePacket);
  $("openBtn").addEventListener("click", () => $("fileIn").click());
  $("fileIn").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; await importPacketFile(f); });
  $("pnameBtn").addEventListener("click", openPortfolios);
  window.addEventListener("pagehide", () => { if (state.dirty && canRemember()) { commitRevision(); state.store.save(state.packet, { ...state.meta, lastEditedAt: nowIso() }).catch(() => {}); } });
  window.addEventListener("beforeunload", (e) => {
    if (!canRemember() && state.packet.holdings.length && exportedState() !== "current") { e.preventDefault(); e.returnValue = ""; }
  });
}

// ---------- boot ----------
async function boot() {
  state.store = await openStore();
  state.app = { remember: true, ...(await state.store.getApp()) };
  const market = await loadMarket();
  $("asof").textContent = market.loaded && market.updated ? `Prices updated ${market.updated.slice(0, 10)}${market.source ? " · " + market.source : ""}` : "Starter estimates (not live)";
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
}

boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML("afterbegin", `<p style="padding:20px;color:#b42318">Payout Lab could not start: ${esc(e.message)}</p>`); });
