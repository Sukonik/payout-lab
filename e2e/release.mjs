// Release verification. Builds the Pages site exactly as the deploy does, serves it, and checks the release standard:
// the preserved V1 build is a real working site, a V1 portfolio migrates, a packet carries work (and saved reports) to a
// fresh browser, and nothing talks to third parties. Usage: node e2e/release.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";
import { newId } from "../js/core/packet.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const site = fs.mkdtempSync(path.join(os.tmpdir(), "payout-site-"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "payout-rel-"));
console.log(execFileSync("node", ["scripts/build-site.mjs", site], { cwd: root }).toString().trim());
const releases = JSON.parse(fs.readFileSync(path.join(root, "releases.json"), "utf8")).releases;
const { server, url } = await serve(site);
const browser = await launch();
const errors = [], external = [], missing = [];
const ctxOpts = { viewport: { width: 1280, height: 900 } };
const open = async (ctx, u) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); p.on("request", (r) => { if (!r.url().startsWith(url)) external.push(r.url()); }); p.on("response", (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); }); await p.goto(u); return p; };
const ready = (p) => p.waitForFunction(() => document.documentElement.dataset.ready);
const gone = (p) => p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });

console.log("\n1. the site as deployed");
const text = (f) => fs.readFileSync(path.join(site, f), "utf8");
check("root is the current app (ES modules, five tabs)", /js\/app\.js/.test(text("index.html")) && /view-receipts/.test(text("index.html")));
for (const r of releases) {
  const dir = path.join(site, r.path);
  check(`${r.version} is preserved at /${r.path}/ from ${r.sha.slice(0, 7)}`, fs.existsSync(path.join(dir, "index.html")) && fs.existsSync(path.join(dir, "data.json")));
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const atCommit = execFileSync("git", ["show", `${r.sha}:index.html`], { cwd: root, maxBuffer: 1 << 28 }).toString();
  check(`${r.version} is byte-identical to that commit's index.html`, html === atCommit);
}
check("current data.json ships with the site", fs.existsSync(path.join(site, "data.json")));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const urls = new Set();
for (const f of walk(site).filter((f) => /\.(html|js|css|svg)$/.test(f))) for (const m of (f.includes(`${path.sep}vendor${path.sep}`) ? fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") : fs.readFileSync(f, "utf8")).matchAll(/https?:\/\/[^\s"'`)<>]+/g)) urls.add(m[0]);
const bad = [...urls].filter((u) => !/^http:\/\/www\.w3\.org\/2000\/svg$/.test(u));
check("no third-party URLs anywhere in the shipped files (licence comments in vendored libraries excepted: they are not code)", bad.length === 0, bad.join(" "));

// A preserved build must run from its own sub-path (relative imports, data file), not merely exist.
for (const r of releases.filter((x) => fs.existsSync(path.join(site, x.path, "js", "app.js")))) {
  const pc = await browser.newContext(ctxOpts);
  const pp = await open(pc, url + r.path + "/");
  await ready(pp);
  await pp.click('[data-g="start"]'); await pp.waitForSelector("#view-portfolio:not([hidden])");
  await pp.fill("#tk", "SCHD"); await pp.fill("#sh", "10"); await pp.click("#addBtn");
  check(`${r.version} preserved build runs from /${r.path}/ (start, add a holding, market data loads)`, (await pp.$$eval("#rows .hrow", (x) => x.length)) === 1 && /Tiingo|Yahoo|Estimate/.test(await pp.innerText("#rows")));
  await pc.close();
}

console.log("\n2. migration from the real V1 build");
let ctx = await browser.newContext(ctxOpts);
const v1 = await open(ctx, url + "v1/");
await v1.waitForTimeout(600);
await v1.click("#sampleBtn");
await v1.fill('[data-i="0"][data-k="shares"]', "123.5");
await v1.fill('[data-i="2"][data-k="div"]', "5.25");
await v1.selectOption('[data-i="3"][data-k="s"]', "A");
await v1.fill('[data-s="target"]', "3200");
await v1.waitForTimeout(300);
const v1Income = (await v1.innerText("#tInc")).trim();
check("V1 preserved build runs and saves its portfolio", v1Income.startsWith("$") && !!(await v1.evaluate(() => localStorage.getItem("payoutlab.v1"))));
const v1Raw = await v1.evaluate(() => localStorage.getItem("payoutlab.v1"));
const v1Obj = JSON.parse(v1Raw);
await v1.close();
const v2 = await open(ctx, url);
await ready(v2);
check("V2 offers to continue the migrated portfolio", /Continue\s+My portfolio/.test(await v2.innerText("#startBody")) && /7 holdings/.test(await v2.innerText("#startBody")));
await v2.click("#gContinue"); await v2.waitForSelector("#view-overview:not([hidden])");
await v2.evaluate(() => { location.hash = "#/portfolio"; }); await v2.waitForSelector("#view-portfolio:not([hidden])");
const rows = await v2.$$eval("#rows .hrow", (rs) => rs.map((r) => ({ t: r.querySelector(".tk").textContent, sh: r.querySelector('[data-k="shares"]').value, div: r.querySelector('[data-k="div"]').value, s: r.querySelector('[data-k="s"]').value })));
check("every V1 holding arrived with its shares", rows.length === v1Obj.holdings.length && rows.every((r, i) => r.t === v1Obj.holdings[i].t && Number(r.sh) === v1Obj.holdings[i].shares), JSON.stringify(rows.slice(0, 2)));
check("fractional shares, edited dividend and schedule survived", rows[0].sh === "123.5" && rows[2].div === "5.25" && rows[3].s === "A");
await v2.evaluate(() => { location.hash = "#/lab"; }); await v2.waitForSelector("#view-lab:not([hidden])");
check("the V1 goal setting survived", (await v2.$eval('[data-s="target"]', (e) => e.value)) === "3200");
check("old values are not mislabeled as provider data", await v2.$$eval("#rows .chipsrc", (c) => true) && (await v2.evaluate(() => { location.hash = "#/portfolio"; return true; })) && (await v2.waitForSelector("#view-portfolio:not([hidden])")) && /Earlier version/.test(await v2.innerText("#rows")));
check("the V1 key is untouched", (await v2.evaluate(() => localStorage.getItem("payoutlab.v1"))) === v1Raw);
const other = await open(ctx, url + "v1/"); await other.waitForTimeout(500);
check("the preserved V1 build still works after migration", (await other.innerText("#tInc")).trim() === v1Income);
await other.close();

console.log("\n3. the release standard: save a packet, open it in a fresh browser, continue, keep earlier reports");
await v2.evaluate(() => { location.hash = "#/portfolio"; });
await v2.fill('[data-i="1"][data-k="shares"]', "999.25");
await v2.waitForFunction(() => /Device\s+saved/.test(document.querySelector("#status").innerText));
const [d] = await Promise.all([v2.waitForEvent("download"), v2.click("#saveBtn")]);
const pk = path.join(tmp, "work.payout"); await d.saveAs(pk);
// A saved report from a later version, carried inside the packet. V2 must keep it intact.
const raw = JSON.parse(fs.readFileSync(pk, "utf8"));
const rc = { id: newId("rc"), portfolioId: raw.portfolioId, portfolioName: raw.portfolioName, originRevisionId: raw.revisionId, capturedAt: "2026-10-01T12:00:00.000Z", label: "October check", formulaVersion: "calc-1",
  dataAsOf: { oldest: "2026-09-30", newest: "2026-09-30", sources: ["tiingo"] }, holdings: raw.holdings.slice(0, 2).map((h) => ({ ticker: h.ticker, name: h.name, shares: h.shares, price: h.fields.price.v, dividend: h.fields.dividend.v, schedule: h.fields.schedule.v, qualified: h.fields.tax.v })),
  assumptions: { ...raw.settings }, outputs: { value: 1000, income: 50, yield: 0.05, monthly: Array(12).fill(4.1666), goalMonthsExpected: 100, goalMonthsSlow: null } };
raw.snapshots = [rc]; delete raw.checksum;
const withReport = path.join(tmp, "with-report.payout"); fs.writeFileSync(withReport, JSON.stringify(raw));
await ctx.close();
const fresh = await browser.newContext(ctxOpts);
const f = await open(fresh, url); await ready(f);
check("a fresh browser starts with nothing", /Name your portfolio/.test(await f.innerText("#startBody")));
await f.setInputFiles("#fileIn", withReport); await f.waitForSelector("dialog[open]");
check("the packet is summarised before opening, including its saved report", /Reports\s*1/.test(await f.innerText("dialog[open]")));
await f.click('dialog[open] [data-result="open-new"]'); await gone(f);
await f.waitForSelector("#view-overview:not([hidden])");
await f.evaluate(() => { location.hash = "#/portfolio"; }); await f.waitForSelector("#view-portfolio:not([hidden])");
check("the work continues: same holdings and the edited share count", (await f.$eval('[data-i="1"][data-k="shares"]', (e) => e.value)) === "999.25" && (await f.$$eval("#rows .hrow", (r) => r.length)) === 7);
await f.fill('[data-i="1"][data-k="shares"]', "1000");
await f.waitForFunction(() => /Device\s+saved/.test(document.querySelector("#status").innerText));
const [d2] = await Promise.all([f.waitForEvent("download"), f.click("#saveBtn")]);
const pk2 = path.join(tmp, "work2.payout"); await d2.saveAs(pk2);
const after = JSON.parse(fs.readFileSync(pk2, "utf8"));
check("continuing and saving again keeps the earlier report unchanged", after.snapshots.length === 1 && JSON.stringify(after.snapshots[0]) === JSON.stringify(rc));
check("the new packet is the next revision of the same portfolio", after.portfolioId === raw.portfolioId && after.parentRevisionId !== null && after.lineage.includes(raw.revisionId));
await f.reload(); await ready(f);
check("reload on the same browser continues the portfolio", (await f.$eval('[data-i="1"][data-k="shares"]', (e) => e.value)) === "1000");
await fresh.close();

console.log("\n4. phone-sized walkthrough (Chromium device emulation)");
const iphone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const m = await open(iphone, url); await ready(m);
await m.click('[data-g="start"]'); await m.waitForSelector("#view-portfolio:not([hidden])");
await m.fill("#tk", "SCHD"); await m.fill("#sh", "100"); await m.click("#addBtn");
let overflow = [];
for (const v of ["overview", "portfolio", "lab", "receipts", "explore", "splits"]) { await m.evaluate((h) => { location.hash = h; }, "#/" + v); await m.waitForSelector(`#view-${v}:not([hidden])`); if (await m.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) overflow.push(v); }
check("no view scrolls sideways on a 390px phone", overflow.length === 0, overflow.join());
const [d3] = await Promise.all([m.waitForEvent("download"), m.click("#saveBtn")]);
check("Save packet works with touch emulation", (await d3.suggestedFilename()).endsWith(".payout"));
await iphone.close();

console.log("\n5. V3 on the deployed build: receipts, comparison, links, QR, device transfer");
{
  const { createRequire } = await import("node:module");
  let jsQR = null; try { jsQR = createRequire(import.meta.url)("jsqr"); } catch { if (process.env.CI) throw new Error("jsqr is required in CI"); }
  const DLG = "body > dialog:not(#settings)";
  const go = async (p, v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };
  const settle = (p) => p.waitForFunction(() => /Device\s+saved/.test(document.querySelector("#status").innerText));
  const a = await open(await browser.newContext({ ...ctxOpts, acceptDownloads: true }), url); await ready(a);
  await a.click('[data-g="start"]'); await a.waitForSelector("#view-portfolio:not([hidden])");
  for (const [t, n] of [["SCHD", 100], ["O", 50]]) { await a.fill("#tk", t); await a.fill("#sh", String(n)); await a.click("#addBtn"); }
  await settle(a); await go(a, "receipts");
  await a.fill("#rcLabel", "Baseline"); await a.click("#rcSaveReport"); await a.waitForTimeout(200);
  await go(a, "portfolio"); await a.fill('[data-i="0"][data-k="shares"]', "300"); await a.dispatchEvent('[data-i="0"][data-k="shares"]', "change"); await settle(a);
  await go(a, "receipts");
  const cmpText = await a.innerText("#cmpOut");
  check("comparison explains what changed income (holdings vs market data)", /What changed your income/.test(cmpText) && /100 → 300/.test(cmpText), cmpText.slice(0, 120));
  const ws = await a.inputValue("#wsLink");
  check("workspace bookmark holds only an id and is built on the deployed address", ws.startsWith(url + "#/overview?p=pf_") && !/SCHD/.test(ws), ws);
  await a.click("#snapMake"); await a.waitForSelector("#snName"); await a.check("#snOk"); await a.waitForSelector("textarea.linkbox");
  const snap = await a.inputValue("textarea.linkbox");
  check("snapshot link is short enough and on the deployed address", snap.startsWith(url + "#/snapshot?v=1&c=") && snap.length < 2000, String(snap.length));
  await a.click(`${DLG} [data-result="cancel"]`); await gone(a);
  // another device: the snapshot opens as a new portfolio, the bookmark explains it cannot restore
  const b = await open(await browser.newContext(ctxOpts), url); await ready(b);
  await b.evaluate((l) => { location.hash = l.slice(l.indexOf("#")); }, snap); await b.waitForSelector(DLG + " h2");
  check("a snapshot link opens as a preview on another device", /Open this snapshot/.test(await b.innerText(DLG)) && /SCHD/.test(await b.innerText(DLG)));
  await b.click(`${DLG} [data-result="open"]`); await gone(b); await b.waitForFunction(() => /Opened .* as a new portfolio/.test(document.querySelector("#toast")?.textContent || "")); await settle(b); await go(b, "portfolio");
  check("it opened as a new portfolio with the copied shares", (await b.$eval('[data-i="0"][data-k="shares"]', (e) => e.value)) === "300");
  const c = await open(await browser.newContext(ctxOpts), url); await ready(c);
  await c.evaluate((l) => { location.hash = l.slice(l.indexOf("#")); }, ws); await c.waitForSelector(DLG + " h2");
  check("a bookmark on a device without the portfolio says it cannot restore it", /isn't on this device/.test(await c.innerText(DLG)) && /cannot bring it back/.test(await c.innerText(DLG)));
  await c.click(`${DLG} [data-result="ok"]`); await gone(c);
  // QR card scans back to the link
  await a.click("#cardMake"); await a.waitForSelector(".pcard");
  const [dq] = await Promise.all([a.waitForEvent("download"), a.click("#ctPng")]); const qf = path.join(tmp, "card.png"); await dq.saveAs(qf);
  if (jsQR) {
    const px = await a.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); const cv = document.createElement("canvas"); cv.width = i.width; cv.height = i.height; const x = cv.getContext("2d"); x.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: Array.from(x.getImageData(0, 0, i.width, i.height).data) }; }, "data:image/png;base64," + fs.readFileSync(qf).toString("base64"));
    check("the QR card PNG scans back to the workspace bookmark", jsQR(Uint8ClampedArray.from(px.d), px.w, px.h)?.data === ws);
  }
  await a.keyboard.press("Escape"); await gone(a);
  // packet carries reports to another device and comparison still works there
  const [dp] = await Promise.all([a.waitForEvent("download"), a.click("#saveBtn")]); const pf = path.join(tmp, "v3.payout"); await dp.saveAs(pf);
  const e = await open(await browser.newContext(ctxOpts), url); await ready(e);
  await e.setInputFiles("#fileIn", pf); await e.waitForSelector("dialog[open]"); await e.click('dialog[open] [data-result="open-new"]'); await gone(e);
  await go(e, "receipts");
  check("on a fresh device the packet brings the saved report back", /Baseline/.test(await e.innerText("#rcList")));
  check("and comparison explains the change there too", /100 → 300/.test(await e.innerText("#cmpOut")));
}

check("no requests left this origin", external.length === 0, external.join(","));
// The preserved V1 page never had a favicon, so the browser asks for /v1/favicon.ico. That is V1's own behaviour, not a broken link.
const broken = missing.filter((m) => !/\/v1\/favicon\.ico$/.test(m));
check("no broken links or missing files", broken.length === 0, broken.join(" | "));
check("no console or page errors", errors.filter((e) => !/status of 404/.test(e) || broken.length).length === 0, errors.join(" | "));
await browser.close(); server.close(); done();
