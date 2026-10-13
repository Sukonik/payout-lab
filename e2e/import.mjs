import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [], requests = [];
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const entry = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: day(1), last: day(20).slice(0, 10), per: 1, ...o });
const market = { updated: day(1), source: "Tiingo", tickers: { SCHD: entry({ n: "Schwab US Dividend Equity ETF", p: 32, d: 1.05 }), O: entry({ n: "Realty Income", p: 54, d: 3.2, s: "M" }), KO: entry({ n: "Coca-Cola", p: 70, d: 2, s: "Q1" }), "BRK-B": entry({ n: "Berkshire Hathaway B", p: 500, d: 0 }) } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "payout-i-"));

const newCtx = async (opts = {}) => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts }); await ctx.route("**/data.json", (r) => r.fulfill({ json: market })); return ctx; };
const open = async (ctx) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); p.on("request", (r) => requests.push(r.url())); await p.goto(url + "#/portfolio"); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const rowsOf = (p) => p.$$eval("#rows .hrow", (rs) => rs.map((r) => ({ t: r.querySelector(".tk").textContent, sh: r.querySelector('[data-k="shares"]').value, price: r.querySelector('[data-k="price"]').value })));
const gone = (p) => p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
const feed = async (p, name, content) => { await p.setInputFiles("#csvIn", { name, mimeType: "text/csv", buffer: Buffer.from(content, "utf8") }); await p.waitForSelector("dialog[open] #ciBody table"); };
const dialog = (p) => p.innerText("dialog[open]");

console.log("1. template round trip");
let ctx = await newCtx(); let p = await open(ctx);
const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#csvTemplate")]);
const tf = path.join(tmp, "t.csv"); await dl.saveAs(tf);
const tpl = fs.readFileSync(tf, "utf8");
check("template downloads with the documented header", tpl.startsWith("ticker,shares,name,currency,price,annual_dividend,schedule"));
await feed(p, "template.csv", tpl);
check("template rows are all valid", /3<\/b> holdings? ready|3 holdings ready/.test((await p.innerHTML("#ciBody")).replace(/<\/?b[^>]*>/g, "")) || /3 holdings ready/.test(await dialog(p)));
check("nothing is applied before Import", (await rowsOf(p)).length === 0);
await p.click('dialog[open] #ciApply'); await gone(p);
let rows = await rowsOf(p);
check("template holdings imported, fractional shares kept", rows.length === 3 && rows.find((r) => r.t === "O").sh === "50.5");
check("a value given in the file is the user's own", rows.find((r) => r.t === "MYFUND").price === "25");
check("a known ticker with no values keeps provider data", rows.find((r) => r.t === "SCHD").price === "32");
const chipOf = (t) => p.$eval(`[data-row] .c-id:has(.tk:text-is("${t}")) .chipsrc`, (e) => e.textContent);
check("imported values are labelled yours, never a provider", /Your numbers/.test(await chipOf("MYFUND")), await chipOf("MYFUND"));
check("a revision and a local backup were created", await p.evaluate(async () => { const keys = await new Promise((res) => { const q = indexedDB.open("payoutlab"); q.onsuccess = () => { const t = q.result.transaction("kv").objectStore("kv").getAllKeys(); t.onsuccess = () => res(t.result); }; }); return keys.some((k) => String(k).startsWith("b:")); }));
await ctx.close();

console.log("2. a messy export: BOM, CRLF, preamble, quoted commas, account columns, bad rows, duplicates");
ctx = await newCtx(); p = await open(ctx);
const messy = "﻿Positions for account 12345678\r\nGenerated 2026-10-13\r\n\r\nAccount Number,Account Name,Symbol,Description,Quantity,Last Price\r\n12345678,Jane Q Public,SCHD,\"Schwab, US Dividend\",\"1,234.5\",32\r\n12345678,Jane Q Public,O,Realty Income,10,54\r\n12345678,Jane Q Public,SCHD,Schwab again,5.5,32\r\n12345678,Jane Q Public,SPAXX**,Money market,500,1\r\n12345678,Jane Q Public,KO,Coca-Cola,-4,70\r\n12345678,Jane Q Public,BRK.B,Berkshire,2,500\r\n12345678,Jane Q Public,MSFT,Microsoft,abc,400\r\n";
await feed(p, "export.csv", messy);
let d = await dialog(p);
check("account-style columns are announced as ignored", /2 columns that look like account details are ignored/.test(d), d.slice(0, 300));
check("the account number and name never appear in the preview", !/12345678|Jane|Public/.test(await p.innerHTML("dialog[open]")));
check("columns were mapped from headers (ticker, shares, price)", /Ticker ← Symbol/.test(d) && /Shares ← Quantity/.test(d) && /Price ← Last Price/.test(d), d.slice(0, 400));
check("problem rows are listed with reasons", /not a valid ticker/.test(d) && /more than 0/.test(d) && /is not a number/.test(d));
check("duplicate rows are combined and explained", /appears on rows 1, 3/.test(d) && /Shares were added together/.test(d));
check("dotted class share was matched explicitly", /BRK\.B was matched to BRK-B/.test(d));
check("importing is blocked until the user chooses to skip bad rows", await p.isDisabled("dialog[open] #ciApply"));
await p.check("dialog[open] #ciSkip");
check("then it can import only the valid rows", !(await p.isDisabled("dialog[open] #ciApply")) && /Import 3 holdings/.test(await p.innerText("#ciApply")));
await p.click("dialog[open] #ciApply"); await gone(p);
rows = await rowsOf(p);
check("only valid holdings were imported", rows.map((r) => r.t).sort().join() === "BRK-B,O,SCHD");
check("duplicate shares added", rows.find((r) => r.t === "SCHD").sh === "1240");
const tf2 = path.join(tmp, "p.payout"); const [dl2] = await Promise.all([p.waitForEvent("download"), p.click("#saveBtn")]); await dl2.saveAs(tf2);
check("account details are absent from the saved packet", !/12345678|Jane|Public/.test(fs.readFileSync(tf2, "utf8")));
check("and from browser storage", await p.evaluate(async () => { const all = await new Promise((res) => { const q = indexedDB.open("payoutlab"); q.onsuccess = () => { const t = q.result.transaction("kv").objectStore("kv"); const r = t.getAll(); r.onsuccess = () => res(JSON.stringify(r.result)); }; }); return !/12345678|Jane|Public/.test(all); }));
await ctx.close();

console.log("3. replace, update and add never surprise you");
const full = "Symbol,Quantity\nSCHD,100\nO,50\n";
const setup = async () => { const c = await newCtx(); const q = await open(c); for (const [t, n] of [["SCHD", 100], ["KO", 7]]) { await q.fill("#tk", t); await q.fill("#sh", String(n)); await q.click("#addBtn"); } return { c, q }; };
for (const [mode, schd, ko, note] of [["set", "100", true, /No change/], ["replace", "100", false, /Will be removed: KO/], ["add", "200", true, /\+100 \(total 200\)/]]) {
  const { c, q } = await setup();
  await feed(q, "full.csv", full);
  check(`default mode keeps shares from doubling (${mode} preview)`, mode !== "set" || /Update shares from the file/.test(await dialog(q)));
  await q.check(`dialog[open] input[name="mode"][value="${mode}"]`);
  check(`${mode}: preview explains the effect`, note.test(await dialog(q)), (await dialog(q)).slice(0, 500));
  await q.click("dialog[open] #ciApply"); await gone(q);
  const r = await rowsOf(q);
  check(`${mode}: SCHD = ${schd}`, r.find((x) => x.t === "SCHD").sh === schd);
  check(`${mode}: KO ${ko ? "kept" : "removed"}`, !!r.find((x) => x.t === "KO") === ko);
  check(`${mode}: O imported as 50`, r.find((x) => x.t === "O").sh === "50");
  await c.close();
}

console.log("4. cancelled, broken and oversized files cannot change anything");
{
  const { c, q } = await setup();
  const before = JSON.stringify(await rowsOf(q));
  await feed(q, "full.csv", full); await q.click('dialog[open] [data-result="cancel"]'); await gone(q);
  check("cancel leaves holdings untouched", JSON.stringify(await rowsOf(q)) === before);
  for (const [name, buf, expect] of [["bin.csv", Buffer.from([1, 2, 0, 3, 4]), /text CSV/], ["q.csv", Buffer.from('Symbol,Quantity\n"SCHD,5'), /never closes/], ["empty.csv", Buffer.from("Symbol,Quantity\n"), /no data rows/], ["big.csv", Buffer.alloc(6 * 1024 * 1024, "a"), /too large/]]) {
    await q.setInputFiles("#csvIn", { name, mimeType: "text/csv", buffer: buf });
    await q.waitForSelector("dialog[open]");
    check(`${name}: explained, nothing changed`, expect.test(await dialog(q)) && /was not changed/.test(await dialog(q)) && JSON.stringify(await rowsOf(q)) === before, (await dialog(q)).slice(0, 200));
    await q.click('dialog[open] [data-result="ok"]'); await gone(q);
  }
  await feed(q, "nomap.csv", "Foo,Bar\nSCHD,5\n");
  check("unrecognised headers ask the user to choose columns", /Choose the ticker and shares columns/.test(await dialog(q)) && await q.isDisabled("dialog[open] #ciApply"));
  await q.selectOption('dialog[open] select[data-map="ticker"]', { label: "Foo" }); await q.selectOption('dialog[open] select[data-map="shares"]', { label: "Bar" });
  check("choosing columns enables the import", !(await q.isDisabled("dialog[open] #ciApply")));
  await q.click('dialog[open] [data-result="cancel"]'); await gone(q);
  await c.close();
}

console.log("5. export defuses formulas");
{
  const c = await newCtx(); const q = await open(c);
  await feed(q, "evil.csv", 'Symbol,Quantity,Name\nEVIL1,5,"=HYPERLINK(""http://evil"",""x"")"\nEVIL2,2,"+cmd"\n');
  await q.click("dialog[open] #ciApply"); await gone(q);
  const [dl3] = await Promise.all([q.waitForEvent("download"), q.click("#csvExport")]);
  const f3 = path.join(tmp, "e.csv"); await dl3.saveAs(f3); const txt = fs.readFileSync(f3, "utf8");
  check("exported text does not start with a formula character", !txt.split(/\r?\n/).slice(1).some((l) => /^[=+\-@]/.test(l)) && /'=HYPERLINK/.test(txt) && /'\+cmd/.test(txt), txt);
  check("export has holdings only (no provider values to re-import as yours)", txt.split(/\r?\n/)[0] === "ticker,shares,name,currency");
  await c.close();
}

console.log("6. phone layout");
{
  const c = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const q = await open(c);
  await feed(q, "full.csv", full);
  const o = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, dw: document.querySelector("dialog[open]").getBoundingClientRect().width }));
  check("dialog fits a phone and the page does not scroll sideways", o.sw <= o.iw + 1 && o.dw <= o.iw, JSON.stringify(o));
  await q.click('dialog[open] [data-result="cancel"]'); await gone(q);
  await c.close();
}

check("no network request left this origin", requests.every((u) => u.startsWith(url)), requests.filter((u) => !u.startsWith(url)).join(","));
check("no console or page errors", errors.length === 0, errors.join(" | "));
await browser.close(); server.close(); done();
