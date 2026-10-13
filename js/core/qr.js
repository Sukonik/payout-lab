// QR codes for Portfolio Cards. Generated in the browser with the vendored Nayuki library: no network, no service.
// Error correction is fixed. If a link does not fit we say so, we never drop to a weaker level or shorten the link.
import qrcodegen from "../vendor/qrcodegen.js";

const { QrCode, QrSegment } = qrcodegen;

export const QR = {
  ecc: "MEDIUM",          // about 15% of the symbol can be damaged and still scan
  maxVersion: 40,         // the largest standard symbol (177 x 177 modules)
  quiet: 4,               // quiet zone in modules, as the QR standard requires
  denseBytes: 900,        // beyond this the code is very dense; the card says to print it larger
};

// Returns { ok, size, version, modules, bytes } or { ok:false, code:"too_big", message }.
export function makeQr(text) {
  const s = String(text ?? "");
  if (!s) return { ok: false, code: "empty", message: "There is nothing to put in a QR code." };
  try {
    const segs = QrSegment.makeSegments(s);
    const qr = QrCode.encodeSegments(segs, QrCode.Ecc[QR.ecc], 1, QR.maxVersion, -1, false);
    const modules = [];
    for (let y = 0; y < qr.size; y++) { const row = []; for (let x = 0; x < qr.size; x++) row.push(qr.getModule(x, y)); modules.push(row); }
    return { ok: true, size: qr.size, version: qr.version, modules, bytes: new TextEncoder().encode(s).length };
  } catch (e) {
    if (e instanceof RangeError) return { ok: false, code: "too_big", message: "This is too much data for a QR code. Move it with a packet file instead." };
    throw e;
  }
}

// Black on white, always, whatever the page theme: scanners need the contrast.
export function qrSvg(qr, { label = "QR code" } = {}) {
  const n = qr.size + QR.quiet * 2;
  let d = "";
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x]) { x++; continue; }
      let run = 1; while (x + run < qr.size && qr.modules[y][x + run]) run++;
      d += `M${x + QR.quiet} ${y + QR.quiet}h${run}v1h${-run}z`;
      x += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" role="img" aria-label="${label.replace(/[<>&"]/g, "")}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// RGBA pixels (used by the card PNG and by tests that decode what we drew).
export function qrPixels(qr, cell) {
  const n = (qr.size + QR.quiet * 2) * cell;
  const px = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (!qr.modules[y][x]) continue;
    for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) {
      const i = (((y + QR.quiet) * cell + dy) * n + (x + QR.quiet) * cell + dx) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  return { width: n, height: n, data: px };
}

// What a card says. Kept as plain data so it can be tested and rendered anywhere.
export function cardModel(packet, { type, link, now }) {
  const snapshot = type === "snapshot";
  return {
    type: snapshot ? "snapshot" : "workspace",
    typeLabel: snapshot ? "Snapshot link: contains a copy of the holdings" : "Workspace bookmark: no portfolio data",
    name: packet.portfolioName,
    shortId: String(packet.portfolioId).replace(/^pf_/, "").slice(0, 8).toUpperCase(),
    revision: String(packet.revisionId ?? "").replace(/^rv_/, "").slice(0, 6).toUpperCase(),
    saved: snapshot ? now : packet.savedAt ?? now,
    explain: snapshot
      ? "Scanning opens a dated copy of this portfolio as a new portfolio. Anyone who holds this card can read the holdings."
      : "Scanning opens Payout Lab and, on the browser that already has this portfolio, selects it. It carries no holdings and cannot restore the portfolio on another device: use the packet file there.",
    link,
  };
}
