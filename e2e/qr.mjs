import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { launch, serve, check, done } from "./lib.mjs";

const require = createRequire(import.meta.url);
let jsQR = null; try { jsQR = require("jsqr"); } catch { if (process.env.CI) throw new Error("jsqr is required in CI"); console.log("  (jsqr not installed: skipping decode checks)"); }
const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "payout-qr-"));
const errors = [], requests = [];
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const entry = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: day(1), last: day(20).slice(0, 10), per: 1, ...o });
const market = { updated: day(1), source: "Tiingo", tickers: { AAA: entry({ n: "Alpha", p: 50, d: 2 }), BBB: entry({ n: "Bravo", p: 120, d: 6, s: "M" }) } };
const newCtx = async (o = {}) => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...o }); await c.route("**/data.json", (r) => r.fulfill({ json: market })); c.on("request", (r) => requests.push(r.url())); return c; };
const open = async (c, hash = "#/portfolio") => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(url + hash); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const go = async (p, v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };
const add = async (p, t, n) => { await p.fill("#tk", t); await p.fill("#sh", String(n)); await p.click("#addBtn"); };
const settle = (p) => p.waitForFunction(() => /Device\s+saved/.test(document.querySelector("#status").innerText));
const DLG = "body > dialog:not(#settings)";
const decodePng = async (p, file) => {
  const b64 = fs.readFileSync(file).toString("base64");
  const px = await p.evaluate(async (src) => { const img = new Image(); img.src = src; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, data: Array.from(d.data) }; }, "data:image/png;base64," + b64);
  return jsQR(Uint8ClampedArray.from(px.data), px.w, px.h)?.data ?? null;
};
const savePng = async (p) => { const [d] = await Promise.all([p.waitForEvent("download"), p.click("#ctPng")]); const f = path.join(tmp, d.suggestedFilename()); await d.saveAs(f); return { f, name: d.suggestedFilename() }; };

console.log("1. the default card is a bookmark with no holdings");
let c = await newCtx(); let p = await open(c);
await add(p, "AAA", 100); await add(p, "BBB", 40); await settle(p);
await go(p, "receipts"); await p.click("#cardMake"); await p.waitForSelector(".pcard");
let txt = await p.innerText(DLG);
check("workspace bookmark is preselected and explained", /no portfolio data/i.test(txt) && /cannot restore/i.test(txt));
check("no holdings or balances on the card", !/AAA|BBB|\$/.test(await p.innerText(".pcard")));
check("it shows name, abbreviated id and date", /My portfolio/.test(txt) && /ID\s+[0-9A-Z]{8}\b/.test(txt) && /Saved/.test(txt));
check("all buttons are available", !(await p.isDisabled("#ctCopy")) && !(await p.isDisabled("#ctPng")) && !(await p.isDisabled("#ctPrint")));
const ws = await p.inputValue("#wsLink").catch(() => null);
const shot = await savePng(p);
check("the PNG file is named for the portfolio and type", /^payout-card-my-portfolio-workspace\.png$/.test(shot.name), shot.name);
if (jsQR) {
  const decoded = await decodePng(p, shot.f);
  await p.keyboard.press("Escape");
  check("the saved PNG scans back to the workspace bookmark link", decoded && /#\/overview\?p=pf_[0-9a-z]+$/.test(decoded) && decoded.startsWith(url), String(decoded));
  await p.waitForSelector(DLG, { state: "detached" });
  await go(p, "receipts");
  check("it is the same link the Links card shows", decoded === (await p.inputValue("#wsLink")));
} else { await p.keyboard.press("Escape"); await p.waitForSelector(DLG, { state: "detached" }); }

console.log("2. a snapshot card is a deliberate choice");
await p.click("#cardMake"); await p.waitForSelector(".pcard");
await p.check('input[value="snapshot"]');
check("the warning appears and nothing is shown until acknowledged", /contains your holdings/.test(await p.innerText(DLG)) && !(await p.$(".pcard")) && (await p.isDisabled("#ctPng")));
await p.check("#ctOk"); await p.waitForSelector(".pcard");
check("then the card says it carries a copy", /copy of the holdings/.test(await p.innerText(".pcard")) && /Anyone who holds this card/.test(await p.innerText(".pcard")));
if (jsQR) {
  const s = await savePng(p); const decoded = await decodePng(p, s.f);
  check("the snapshot PNG scans back to a snapshot link that opens", decoded && /#\/snapshot\?v=1&c=[01]&d=[A-Za-z0-9_-]+$/.test(decoded), String(decoded).slice(0, 60));
  const q = await open(await newCtx(), "#/portfolio");
  await q.evaluate((l) => { location.hash = l.slice(l.indexOf("#")); }, decoded);
  await q.waitForSelector(DLG + " h2");
  check("opening the scanned link previews the same holdings", /AAA/.test(await q.innerText(DLG)) && /Open this snapshot/.test(await q.innerText(DLG)));
}
await p.keyboard.press("Escape"); await p.waitForSelector(DLG, { state: "detached" });

console.log("3. same contrast in light and dark themes");
const pngs = [];
for (const scheme of ["light", "dark"]) {
  const cc = await newCtx({ colorScheme: scheme }); const pp = await open(cc);
  await add(pp, "AAA", 10); await settle(pp); await go(pp, "receipts"); await pp.click("#cardMake"); await pp.waitForSelector(".pcard");
  const cols = await pp.evaluate(() => { const card = document.querySelector(".pcard"), q = card.querySelector("svg"); return [getComputedStyle(card).backgroundColor, getComputedStyle(card).color, q.querySelector("rect").getAttribute("fill"), q.querySelector("path").getAttribute("fill")]; });
  pngs.push(cols.join("|"));
  await cc.close();
}
check("card colors are black on white regardless of theme", pngs[0] === pngs[1] && /255, 255, 255/.test(pngs[0]) && /#fff\|#000$/.test(pngs[0]), pngs.join(" vs "));

console.log("4. too large for a QR code");
{
  const b = await open(await newCtx());
  const tickers = Array.from({ length: 450 }, (_, i) => "T" + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + ((i / 26) | 0)));
  const csv = "Symbol,Quantity,Name\n" + tickers.map((t, i) => `${t},${(i * 7919) % 9973 + 11},${Math.floor(Math.abs(Math.sin(i + 1)) * 1e9).toString(36)} Holdings`).join("\n");
  await b.setInputFiles("#csvIn", { name: "big.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await b.waitForSelector("dialog[open] #ciBody table"); await b.click("#ciApply"); await b.waitForSelector(DLG, { state: "detached" }); await settle(b);
  await go(b, "receipts"); await b.click("#cardMake"); await b.waitForSelector("#ctOut");
  check("the bookmark card still works for a huge portfolio", !!(await b.$(".pcard")));
  await b.check('input[value="snapshot"]'); await b.check("#ctOk"); await b.waitForSelector("#ctOut .callout");
  const t = await b.innerText("#ctOut");
  check("snapshot card refuses with a file-transfer message, no code, no download", /too much data/i.test(t) && /Save packet/.test(t) && !(await b.$(".pcard svg")) && (await b.isDisabled("#ctPng")), t);
}

console.log("5. printing and network");
{
  const pp = await open(await newCtx()); await add(pp, "AAA", 10); await settle(pp); await go(pp, "receipts"); await pp.click("#cardMake"); await pp.waitForSelector(".pcard");
  await pp.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; window.dispatchEvent(new Event("afterprint")); }; });
  await pp.click("#ctPrint"); await pp.waitForFunction(() => window.__printed === 1);
  check("print runs once and cleans up its temporary page", !(await pp.$("#cardPrint")) && !(await pp.evaluate(() => document.body.classList.contains("printing-card"))));
  await pp.emulateMedia({ media: "print" }); await pp.evaluate(() => { const h = document.createElement("div"); h.id = "cardPrint"; h.innerHTML = '<div class="pcard">x</div>'; document.body.appendChild(h); document.body.classList.add("printing-card"); });
  check("when printing, only the card is visible", (await pp.evaluate(() => getComputedStyle(document.querySelector("#cardPrint")).display)) === "block" && (await pp.evaluate(() => document.querySelector("#view-receipts").getBoundingClientRect().width)) === 0);
}
const external = requests.filter((u) => !u.startsWith(url) && !u.startsWith("blob:") && !u.startsWith("data:"));
check("generating cards made no external requests, and none carried link data", external.length === 0 && !requests.some((u) => /snapshot|qr/i.test(new URL(u).search)), external.join(","));
check("no page errors", errors.length === 0, errors.join("|"));
await browser.close(); server.close(); done();
