// Portfolio Card: a QR code plus plain words about what scanning it does. Everything is drawn in the browser.
import { QR, cardModel, makeQr, qrSvg } from "../core/qr.js";
import { encodeSnapshot, snapshotLink, workspaceLink } from "../core/link.js";
import { dateTime, esc } from "./dom.js";
import { choose, toast } from "./dialogs.js";

const cardHtml = (m, qr) => `<div class="pcard"><div class="pcard-top"><b>Payout Lab</b><span>Portfolio card</span></div>` +
  `<div class="pcard-qr">${qrSvg(qr, { label: `QR code for ${m.name}` })}</div>` +
  `<h3>${esc(m.name)}</h3>` +
  `<dl><dt>ID</dt><dd>${esc(m.shortId)}</dd><dt>Type</dt><dd>${esc(m.typeLabel)}</dd><dt>${m.type === "snapshot" ? "Copied" : "Saved"}</dt><dd>${esc(dateTime(m.saved))}${m.revision ? ` · rev ${esc(m.revision)}` : ""}</dd></dl>` +
  `<p>${esc(m.explain)}</p></div>`;

function wrap(ctx, text, x, y, max, lh) {
  let line = ""; for (const w of String(text).split(/\s+/)) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > max && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t; }
  ctx.fillText(line, x, y); return y + lh;
}

// A crisp PNG: whole-number module size, white card, black code, regardless of the page theme.
export function cardPng(m, qr) {
  const W = 900, pad = 56, cell = Math.max(2, Math.floor((W - pad * 2) / (qr.size + QR.quiet * 2)));
  const qrPx = (qr.size + QR.quiet * 2) * cell;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = 1400; const c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, W, cv.height);
  c.fillStyle = "#111"; c.textBaseline = "alphabetic";
  c.font = "700 34px system-ui, sans-serif"; c.fillText("Payout Lab", pad, pad + 24);
  c.font = "500 24px system-ui, sans-serif"; c.fillStyle = "#555"; c.textAlign = "right"; c.fillText("Portfolio card", W - pad, pad + 24); c.textAlign = "left";
  const qx = Math.round((W - qrPx) / 2), qy = pad + 56;
  c.fillStyle = "#fff"; c.fillRect(qx, qy, qrPx, qrPx); c.fillStyle = "#000";
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) c.fillRect(qx + (x + QR.quiet) * cell, qy + (y + QR.quiet) * cell, cell, cell);
  let y = qy + qrPx + 56;
  c.fillStyle = "#111"; c.font = "700 40px system-ui, sans-serif"; y = wrap(c, m.name, pad, y, W - pad * 2, 48);
  c.font = "500 26px system-ui, sans-serif"; c.fillStyle = "#333"; y += 4;
  for (const [k, v] of [["ID", m.shortId], ["Type", m.typeLabel], [m.type === "snapshot" ? "Copied" : "Saved", dateTime(m.saved) + (m.revision ? ` · rev ${m.revision}` : "")]]) { c.fillStyle = "#666"; c.fillText(k, pad, y); c.fillStyle = "#111"; y = wrap(c, v, pad + 120, y, W - pad * 2 - 120, 34) + 6; }
  c.fillStyle = "#333"; c.font = "400 26px system-ui, sans-serif"; y = wrap(c, m.explain, pad, y + 14, W - pad * 2, 36);
  const out = document.createElement("canvas"); out.width = W; out.height = Math.min(1400, y + pad - 20); out.getContext("2d").drawImage(cv, 0, 0);
  return new Promise((res) => out.toBlob(res, "image/png"));
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "portfolio";

export async function openCardDialog({ packet, base, copyText, download, now }) {
  let m = null, qr = null, link = "", ver = 0;
  await choose(`<h2>Portfolio card</h2>` +
    `<fieldset class="ctype"><legend class="sr">Card type</legend>` +
    `<label><input type="radio" name="ct" value="workspace" checked><span><b>Workspace bookmark</b><small>No holdings in it. Opens this portfolio on this browser.</small></span></label>` +
    `<label><input type="radio" name="ct" value="snapshot"><span><b>Snapshot</b><small>Carries a dated copy of your holdings.</small></span></label></fieldset>` +
    `<div id="ctSnap" hidden><div class="callout"><b>A snapshot card contains your holdings and share counts.</b> Anyone who scans or photographs it can read them. It is not encrypted and never updates.</div>` +
    `<label class="check" style="margin:10px 0"><input type="checkbox" id="ctOk"> I understand anyone with this card can see my holdings</label></div>` +
    `<div id="ctOut" aria-live="polite"></div>` +
    `<div class="btns"><button data-result="close">Close</button><button id="ctCopy" disabled>Copy link</button><button id="ctPng" disabled>Save card</button><button id="ctPrint" class="primary" disabled>Print</button></div>`, {
    className: "carddlg",
    onMount(d) {
      const $ = (s) => d.querySelector(s), type = () => d.querySelector('input[name="ct"]:checked').value;
      const btns = ["#ctCopy", "#ctPng", "#ctPrint"].map($);
      const render = async () => {
        const mine = ++ver, t = type();
        $("#ctSnap").hidden = t !== "snapshot";
        m = qr = null; link = ""; btns.forEach((b) => { b.disabled = true; });
        if (t === "snapshot" && !$("#ctOk").checked) { $("#ctOut").innerHTML = `<p class="muted">Tick the box to continue.</p>`; return; }
        if (t === "snapshot") {
          const e = await encodeSnapshot(packet, { name: packet.portfolioName, now });
          if (mine !== ver) return;
          if (e.rating === "too-large") { $("#ctOut").innerHTML = `<p class="callout">This portfolio is too large for a link, so it cannot be a card. Nothing was shortened. Use <b>Save packet</b> to move it to another device.</p>`; return; }
          link = snapshotLink(base, e.params);
        } else link = workspaceLink(base, packet.portfolioId, "overview");
        const r = makeQr(link);
        if (!r.ok) { $("#ctOut").innerHTML = `<p class="callout">${esc(r.message)} Use <b>Save packet</b> to move it to another device.</p>`; return; }
        qr = r; m = cardModel(packet, { type: t, link, now });
        $("#ctOut").innerHTML = cardHtml(m, qr) + (qr.bytes > QR.denseBytes ? `<p class="muted">This code is dense. Print it large and scan it in good light.</p>` : "");
        btns.forEach((b) => { b.disabled = false; });
      };
      d.addEventListener("change", render);
      $("#ctCopy").addEventListener("click", async () => { toast((await copyText(link, null)) ? "Link copied." : "Your browser blocked copying."); });
      $("#ctPng").addEventListener("click", async () => { const blob = await cardPng(m, qr); download(`payout-card-${slug(m.name)}-${m.type}.png`, blob, "image/png"); });
      $("#ctPrint").addEventListener("click", () => {
        const host = document.createElement("div"); host.id = "cardPrint"; host.innerHTML = cardHtml(m, qr); document.body.appendChild(host);
        document.body.classList.add("printing-card");
        const clean = () => { document.body.classList.remove("printing-card"); host.remove(); window.removeEventListener("afterprint", clean); };
        window.addEventListener("afterprint", clean); setTimeout(() => window.print(), 50);
      });
      render();
    },
  });
}
