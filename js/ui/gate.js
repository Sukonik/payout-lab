// The start screen: "Continue <portfolio>" for returning users, a clear first-run choice for everyone else.
// A bookmark or a username cannot bring back data that is not on this device, so this screen says where each copy lives.
import { $, ago, esc } from "./dom.js";
import { choose } from "./dialogs.js";

export function gateVisible() { return document.body.hasAttribute("data-gate"); }
export function hideGate() { document.body.removeAttribute("data-gate"); $("start").hidden = true; }

// ctx: { mode: "returning" | "first", packet, meta, list, persistent, on: { continue, open(id), packet, create(name, remember), sample, bookmark } }
export function showGate(ctx) {
  const { mode, packet, meta, list, persistent, on } = ctx;
  const unavailable = persistent ? "" : `<div class="callout">This browser isn't letting the site remember data (private mode or blocked storage). You can still work, and a packet saves your portfolio as a file.</div>`;
  let html;
  if (mode === "returning") {
    const others = list.filter((x) => x.id !== packet.portfolioId);
    html = `<p class="eyebrow">Welcome back</p><h1 id="h-start">Continue <span class="pn">${esc(packet.portfolioName)}</span></h1>` +
      `<p class="lede">${packet.holdings.length} holding${packet.holdings.length === 1 ? "" : "s"} · edited ${esc(ago(meta.lastEditedAt || packet.savedAt))} · last saved to a packet ${esc(meta.lastExportedAt ? ago(meta.lastExportedAt) : "never")}</p>` +
      unavailable + `<div class="row-actions"><button class="btn primary big" id="gContinue">Continue</button></div>` +
      (others.length ? `<h3 class="mini" style="margin-top:22px">Other portfolios on this device</h3><ul class="plist gl">${others.map((x) => `<li><span><b>${esc(x.name)}</b><br><small class="muted">${x.holdings} holdings · edited ${esc(ago(x.lastEditedAt || x.savedAt))}</small></span><button class="btn sm" data-g="open:${esc(x.id)}">Open</button></li>`).join("")}</ul>` : "") +
      `<div class="row-actions" style="margin-top:22px"><button class="btn" data-g="packet">Open a packet</button><button class="btn" data-g="new">New portfolio</button><button class="btn ghost" data-g="sample">Try a sample</button></div>` +
      `<p class="privacy">This browser remembers your portfolio. A <b>packet</b> (a .payout file) is your portable copy: open it to continue on another device or after clearing browser data.</p>` +
      `<p class="privacy"><button class="linkbtn" data-g="bookmark">How to bookmark this page</button></p>`;
  } else {
    html = `<p class="eyebrow">Payout Lab</p><h1 id="h-start">Stress-test the dividend portfolio you own</h1>` +
      `<p class="lede">No signup, no broker linking. Your portfolio lives in a small file that you own, and, if you like, in a copy this browser remembers for next time.</p>` + unavailable +
      `<label class="f" style="max-width:380px">Name your portfolio<input id="gName" maxlength="80" value="My portfolio" autocomplete="off"></label>` +
      (persistent ? `<label class="check" style="margin:14px 0 4px"><input type="checkbox" id="gRem" checked> Remember it on this device</label><p class="privacy" style="margin-top:2px">Kept only in this browser; clearing site data removes it. Save a packet to keep a copy that moves with you.</p>` : "") +
      `<div class="row-actions"><button class="btn primary big" data-g="start">Start</button><button class="btn" data-g="packet">Open a packet</button><button class="btn ghost" data-g="sample">Try a sample</button></div>` +
      `<p class="privacy"><button class="linkbtn" data-g="bookmark">How to bookmark this page</button></p>`;
  }
  $("startBody").innerHTML = html;
  $("start").hidden = false;
  document.body.setAttribute("data-gate", mode);
  const root = $("startBody");
  root.onclick = (e) => {
    const b = e.target.closest("[data-g],#gContinue"); if (!b) return;
    const g = b.id === "gContinue" ? "continue" : b.dataset.g;
    if (g === "continue") on.continue();
    else if (g.startsWith("open:")) on.open(g.slice(5));
    else if (g === "packet") on.packet();
    else if (g === "new") on.create();
    else if (g === "start") on.create($("gName")?.value ?? "", $("gRem") ? $("gRem").checked : false);
    else if (g === "sample") on.sample();
    else if (g === "bookmark") on.bookmark();
  };
  setTimeout(() => ($("gContinue") || $("gName"))?.focus({ preventScroll: true }), 0);
}

// Honest bookmark help: the page cannot create a bookmark itself, and a bookmark cannot restore a portfolio on a new device.
export async function bookmarkHelp() {
  const url = location.origin + location.pathname + "#/overview";
  const r = await choose(`<h2>Bookmark Payout Lab</h2>` +
    `<p>Your browser decides how bookmarks work, so do this one yourself:</p>` +
    `<ul class="steps"><li><b>Computer:</b> press <kbd>Ctrl</kbd>+<kbd>D</kbd> (Windows, Linux) or <kbd>⌘</kbd>+<kbd>D</kbd> (Mac).</li><li><b>iPhone or iPad:</b> tap the Share button, then <i>Add Bookmark</i> or <i>Add to Home Screen</i>.</li><li><b>Android Chrome:</b> tap <b>⋮</b>, then the star.</li></ul>` +
    `<label class="f">Link<input id="bmUrl" readonly value="${esc(url)}"></label>` +
    `<div class="callout">A bookmark only opens this website. On <b>this browser</b> it continues the portfolio it remembers. On a <b>different device or browser</b> it cannot bring your portfolio back: open your packet there.</div>` +
    `<div class="btns"><button class="btn" data-result="copy">Copy link</button><button class="btn primary" data-result="done">Done</button></div>`, {
    onMount(d) { d.querySelector("#bmUrl").addEventListener("focus", (e) => e.target.select()); },
  });
  if (r === "copy") {
    try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "manual"; }
  }
  return null;
}
