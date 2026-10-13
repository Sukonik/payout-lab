import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "payout-rc-"));
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const entry = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: day(1), last: day(20).slice(0, 10), per: 1, ...o });
let market = { updated: day(1), source: "Tiingo", tickers: { AAA: entry({ n: "Alpha", p: 50, d: 2 }), BBB: entry({ n: "Bravo", p: 120, d: 6, s: "M" }), CCC: entry({ n: "Charlie", p: 30, d: 1.5 }) } };
const newCtx = async (o = {}) => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...o }); await c.route("**/data.json", (r) => r.fulfill({ json: market })); return c; };
const open = async (c, hash = "#/portfolio") => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); await p.goto(url + hash); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const go = async (p, v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };
const add = async (p, t, n) => { await p.fill("#tk", t); await p.fill("#sh", String(n)); await p.click("#addBtn"); };
const settle = (p) => p.waitForFunction(() => /Device\s+saved/.test(document.querySelector("#status").innerText));
const gone = (p) => p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
const cmp = (p) => p.innerText("#cmpOut");
const saveReport = async (p, label = "") => { await go(p, "receipts"); await p.fill("#rcLabel", label); await p.click("#rcSaveReport"); await p.waitForTimeout(150); };
const nums = (t) => [...t.matchAll(/[+-]?\$[\d,]+(?:\.\d+)?/g)].map((m) => m[0]);
const splitOf = async (p) => p.$$eval("#cmpOut .abar", (rows) => rows.map((r) => [r.firstElementChild.innerText.split("\n")[0], r.lastElementChild.innerText]));
const exportDownload = async (p, sel, name) => { const [d] = await Promise.all([p.waitForEvent("download"), p.click(sel)]); const f = path.join(tmp, name); await d.saveAs(f); return f; };

console.log("1. a report is a frozen, dated copy");
let c = await newCtx(); let p = await open(c);
await add(p, "AAA", 100); await add(p, "BBB", 40); await settle(p);
await go(p, "receipts");
check("no reports yet, compare is hidden", /No saved reports yet/.test(await p.innerText("#rcList")) && (await p.isHidden("#cmpCard")));
await saveReport(p, "Baseline");
check("the report is listed with date, data date and headline numbers", /Baseline/.test(await p.innerText("#rcList")) && /Saved/.test(await p.innerText("#rcList")) && /data as of/.test(await p.innerText("#rcList")) && /Income/.test(await p.innerText("#rcList")));
check("compare appears", await p.isVisible("#cmpCard"));
check("comparing an unchanged portfolio with its report shows no change at all", /No change between these two/.test(await cmp(p)));

console.log("2. each cause is explained by the right bucket");
await go(p, "portfolio"); await p.fill('[data-i="0"][data-k="shares"]', "160");
await go(p, "receipts");
let t = await cmp(p);
check("more shares: income change is explained by holdings, market data is zero", /What changed your income/.test(t));
let sp = await splitOf(p);
check("income split: holdings +$120, market $0, overlap $0, total +$120", sp[0][1] === "+$120" && /^\$?0|^\$0/.test(sp[1][1].replace("+", "")) && sp[3][1] === "+$120", JSON.stringify(sp.slice(0, 4)));
check("value split: holdings +$3,000 (60 shares at the old $50)", sp[4][1] === "+$3,000", JSON.stringify(sp.slice(4)));
check("the holdings table names what changed", /AAA/.test(t) && /100 → 160/.test(t));
await go(p, "portfolio"); await p.fill('[data-i="0"][data-k="shares"]', "100"); await p.fill('[data-i="1"][data-k="div"]', "7.5"); await p.dispatchEvent('[data-i="1"][data-k="div"]', "change");
await go(p, "receipts"); sp = await splitOf(p);
check("a changed dividend is market data only: +$60 (40 shares x +$1.50), holdings $0", sp[1][1] === "+$60" && sp[0][1].replace("+", "") === "$0" && sp[3][1] === "+$60", JSON.stringify(sp.slice(0, 4)));
await go(p, "portfolio"); await p.fill('[data-i="1"][data-k="div"]', "6"); await p.dispatchEvent('[data-i="1"][data-k="div"]', "change"); await p.fill('[data-i="0"][data-k="price"]', "65"); await p.dispatchEvent('[data-i="0"][data-k="price"]', "change");
await go(p, "receipts"); t = await cmp(p); sp = await splitOf(p);
check("a changed price leaves income alone and moves value through market data", sp[3][1].replace("+", "") === "$0" && sp[5][1] === "+$1,500", JSON.stringify(sp));
await go(p, "portfolio"); await p.fill('[data-i="0"][data-k="price"]', "50"); await p.dispatchEvent('[data-i="0"][data-k="price"]', "change");
await go(p, "lab"); await p.fill('[data-s="target"]', "9000"); await p.fill('[data-s="growth"]', "9"); await go(p, "receipts");
t = await cmp(p);
check("a changed goal assumption shows up as an assumption and a goal step, with no holdings or market effect", /Assumptions that changed/.test(t) && /Monthly income goal/.test(t) && /Your assumptions/.test(t) && /Goal timeline/.test(t));
await go(p, "lab"); await p.fill('[data-s="target"]', "2000"); await p.fill('[data-s="growth"]', "6");

console.log("3. a data refresh never rewrites a saved report");
await go(p, "receipts"); const listBefore = await p.innerText("#rcList");
market = { updated: day(0), source: "Tiingo", tickers: { AAA: entry({ n: "Alpha", p: 80, d: 3, u: day(0) }), BBB: entry({ n: "Bravo", p: 150, d: 8, s: "M", u: day(0) }), CCC: entry({ n: "Charlie", p: 30, d: 1.5, u: day(0) }) } };
await go(p, "portfolio"); await p.click("#checkBtn"); await p.waitForSelector("dialog[open] .rv-list");
await p.click('dialog[open] [data-result="apply"]'); await gone(p);
await go(p, "receipts");
check("the saved report is exactly as captured", (await p.innerText("#rcList")) === listBefore);
t = await cmp(p); sp = await splitOf(p);
check("and comparing it with today now shows what the market did", sp[1][1].startsWith("+$") && sp[1][1] !== "+$0", JSON.stringify(sp.slice(0, 4)));

console.log("4. files: export, open, duplicates, other portfolios");
const rf = await exportDownload(p, '#rcList [data-act="export"]', "baseline.json");
const parsed = JSON.parse(fs.readFileSync(rf, "utf8"));
check("the exported report is machine-readable with a checksum", parsed.format === "payout-receipt" && parsed.checksum?.alg === "sha-256" && parsed.receipt.label === "Baseline");
await p.setInputFiles("#rcFile", rf); await p.waitForSelector("dialog[open]");
let dlg = await p.innerText("dialog[open]");
check("opening a report you already have says so and offers compare only", /already have this report/.test(dlg) && !/Add to my reports/.test(dlg));
await p.click('dialog[open] [data-result="compare"]'); await gone(p);
check("no duplicate entry was created", (await p.$$("#rcList .rcrow")).length === 1);

// a report from a different portfolio
const c2 = await newCtx(); const p2 = await open(c2);
await add(p2, "CCC", 500); await settle(p2); await saveReport(p2, "Someone else");
const otherFile = await exportDownload(p2, '#rcList [data-act="export"]', "other.json");
await c2.close();
await p.setInputFiles("#rcFile", otherFile); await p.waitForSelector("dialog[open]");
dlg = await p.innerText("dialog[open]");
check("a report from another portfolio is called out before opening", /different portfolio/.test(dlg));
const holdingsBefore = await p.$$eval("#rows .hrow", (r) => r.length);
await p.click('dialog[open] [data-result="compare"]'); await gone(p);
check("comparing it does not touch your holdings or your history", (await p.$$eval("#rows .hrow", (r) => r.length)) === holdingsBefore && (await p.$$("#rcList .rcrow")).length === 1);
check("the comparison warns it is another portfolio and the picker marks the file", /different portfolios/.test(await cmp(p)) && /opened file/.test(await p.$eval("#cmpA", (e) => e.selectedOptions[0].textContent)));

console.log("5. broken report files change nothing");
const f = (name, obj) => { const x = path.join(tmp, name); fs.writeFileSync(x, typeof obj === "string" ? obj : JSON.stringify(obj)); return x; };
const good = JSON.parse(fs.readFileSync(rf, "utf8"));
const neg = JSON.parse(JSON.stringify(good)); delete neg.checksum; neg.receipt.holdings[0].shares = -3;
const fut = { ...good, schemaVersion: 7 };
const edited = JSON.parse(JSON.stringify(good)); edited.receipt.outputs.income = 123456;
for (const [name, file, expect] of [["junk", f("junk.json", "{nope"), /not valid report data/], ["wrong", f("wrong.json", { format: "payout-packet" }), /not a Payout Lab report/], ["future", f("future.json", fut), /newer version/], ["negative", f("neg.json", neg), /between 0/]]) {
  await p.setInputFiles("#rcFile", file); await p.waitForSelector("dialog[open]");
  check(`${name}: explained and nothing changed`, expect.test(await p.innerText("dialog[open]")) && /Nothing was changed/.test(await p.innerText("dialog[open]")) && (await p.$$("#rcList .rcrow")).length === 1, (await p.innerText("dialog[open]")).slice(0, 160));
  await p.click('dialog[open] [data-result="ok"]'); await gone(p);
}
await p.setInputFiles("#rcFile", f("edited.json", edited)); await p.waitForSelector("dialog[open]");
check("an edited file opens only after a warning", /changed after it was saved/.test(await p.innerText("dialog[open]")));
await p.click('dialog[open] [data-result="cancel"]'); await gone(p);

console.log("6. printable report: self-contained and safe");
await go(p, "receipts"); await p.fill("#rcLabel", '<img src=x onerror=alert(1)>'); await p.click("#rcSaveReport"); await p.waitForTimeout(200);
const [pop] = await Promise.all([c.waitForEvent("page"), p.click('#rcList .rcrow:first-child [data-act="print"]')]);
await pop.waitForLoadState();
const html = await pop.content();
check("the report opens as a standalone page with a CSP that blocks everything remote", /Content-Security-Policy/.test(html) && /default-src 'none'/.test(html));
check("no scripts, links, images or remote URLs", !/<(script|link|img|iframe)\b/i.test(html.replace(/<title>.*<\/title>/s, "")) && !/https?:\/\//.test(html));
check("hostile text is shown as text", /<img src=x onerror=alert\(1\)>/.test(await pop.innerText("h1")));
check("dates, assumptions, provenance and the months caveat are on the page", /saved 20\d\d-\d\d-\d\d/.test(await pop.innerText("body")) && /Assumptions/.test(await pop.innerText("body")) && /Tiingo/.test(await pop.innerText("body")) && /ex-dividend dates/.test(await pop.innerText("body")));
await pop.close();
const cmpFile = await exportDownload(p, "#cmpDownload", "cmp.html");
check("the comparison can be downloaded as a standalone file", /Comparison/.test(fs.readFileSync(cmpFile, "utf8")) && !/https?:\/\//.test(fs.readFileSync(cmpFile, "utf8")));

console.log("7. reports travel inside the packet");
await settle(p);
const pk = await exportDownload(p, "#saveBtn", "all.payout");
const before = JSON.parse(fs.readFileSync(pk, "utf8")).snapshots;
check("the packet carries the reports", before.length === 2);
const c3 = await newCtx(); const p3 = await open(c3, "");
await p3.setInputFiles("#fileIn", pk); await p3.waitForSelector("dialog[open]");
check("opening a packet announces its reports", /Reports\s*2/.test(await p3.innerText("dialog[open]")));
await p3.click('dialog[open] [data-result="open-new"]'); await gone(p3); await p3.waitForSelector("#view-overview:not([hidden])");
await go(p3, "receipts");
await p3.selectOption("#cmpA", { label: (await p3.$$eval("#cmpA option", (o) => o.map((x) => x.textContent))).find((x) => /Baseline/.test(x)) });
check("the reports are there in a fresh browser and compare works", (await p3.$$("#rcList .rcrow")).length === 2 && /What changed your income/.test(await cmp(p3)));
const pk2 = await exportDownload(p3, "#saveBtn", "again.payout");
check("reports come back byte-for-byte identical after another save", JSON.stringify(JSON.parse(fs.readFileSync(pk2, "utf8")).snapshots) === JSON.stringify(before));
await c3.close();

console.log("8. history is bounded and never trimmed silently");
const c4 = await newCtx(); const p4 = await open(c4);
await add(p4, "AAA", 10); await settle(p4);
await go(p4, "receipts");
for (let i = 0; i < 50; i++) { await p4.fill("#rcLabel", `r${i}`); await p4.click("#rcSaveReport"); }
check("fifty reports fit", (await p4.$$("#rcList .rcrow")).length === 50);
await p4.fill("#rcLabel", "r50"); await p4.click("#rcSaveReport"); await p4.waitForSelector("dialog[open]");
check("the 51st asks first and offers to save the packet", /You have 50 saved reports/.test(await p4.innerText("dialog[open]")) && /Save packet first/.test(await p4.innerText("dialog[open]")));
check("nothing was removed while the question is open", (await p4.$$("#rcList .rcrow")).length === 50);
await p4.click('dialog[open] [data-result="cancel"]'); await gone(p4);
check("cancel keeps all fifty", (await p4.$$("#rcList .rcrow")).length === 50 && /r0/.test(await p4.innerText("#rcList")));
await p4.fill("#rcLabel", "r50"); await p4.click("#rcSaveReport"); await p4.waitForSelector("dialog[open]"); await p4.click('dialog[open] [data-result="trim"]'); await gone(p4);
const labels = await p4.$$eval("#rcList .rcrow h3", (h) => h.map((x) => x.textContent));
check("trimming drops only the oldest and keeps the newest first", labels.length === 50 && labels[0] === "r50" && !labels.includes("r0") && labels.includes("r1"));
await c4.close();

console.log("9. comparison on a phone");
const m = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await open(m); await add(mp, "AAA", 100); await add(mp, "BBB", 40); await settle(mp); await saveReport(mp, "Phone baseline");
await go(mp, "portfolio"); await mp.fill('[data-i="0"][data-k="shares"]', "190"); await go(mp, "receipts");
check("no sideways scroll with a comparison open", await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
check("report actions are comfortable touch targets", await mp.$$eval("#rcList .rcact button", (bs) => bs.every((b) => b.getBoundingClientRect().height >= 32)));
await m.close();

check("no console or page errors", errors.length === 0, errors.join(" | "));
await browser.close(); server.close(); done();
