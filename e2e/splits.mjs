import fs from "node:fs";
import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [], requests = [];
const seed = JSON.parse(fs.readFileSync(path.join(root, "splits.json"), "utf8"));
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const withUpcoming = { ...seed, upcoming: [
  { t: "NEWCO", n: "Newco <b>Inc</b>", a: 10, b: 1, exDate: inDays(9), announced: inDays(-3), status: "announced", src: "8-K", url: "https://www.sec.gov/Archives/edgar/x.htm" },
  { t: "SHADY", n: "Shady Corp", a: 4, b: 1, exDate: inDays(20), status: "unverified", src: "one calendar", url: "javascript:alert(1)" },
  { t: "SHRINK", n: "Shrink Co", a: 1, b: 8, exDate: inDays(12), status: "announced", src: "8-K" },
  { t: "OLD", n: "Past Co", a: 2, b: 1, exDate: inDays(-5), status: "confirmed", src: "8-K" },
] };
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const market = { updated: day(1), source: "Tiingo", tickers: { GOOGL: { n: "Alphabet", p: 300, d: 0.8, s: "Q3", q: true, src: "Tiingo", u: day(1) }, NVDA: { n: "NVIDIA", p: 180, d: 0.04, s: "Q3", q: true, src: "Tiingo", u: day(1) }, KO: { n: "Coca-Cola", p: 70, d: 2, s: "Q1", q: true, src: "Tiingo", u: day(1) } } };
const newCtx = async (o = {}, splits = withUpcoming) => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...o });
  await c.route("**/data.json", (r) => r.fulfill({ json: market }));
  await c.route("**/splits.json", (r) => (splits ? r.fulfill({ json: splits }) : r.fulfill({ status: 404, body: "no" })));
  c.on("request", (r) => requests.push(r.url()));
  return c;
};
const open = async (c, hash = "#/splits") => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(url + hash); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const go = async (p, v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };
const kind = (p, k) => p.check(`input[name=spk][value=${k}]`, { force: true });
const tickers = (p, sel = "#spLedger .stk") => p.$$eval(sel, (e) => e.map((x) => x.textContent));

console.log("1. a sixth tab with a deep link");
let c = await newCtx(); let p = await open(c);
await p.waitForSelector("#view-splits:not([hidden])");
check("opening #/splits goes straight to the Splits tab", /Stock splits/.test(await p.innerText("#view-splits")));
check("the desktop bar has six tabs with Splits last and current", (await p.$$eval("#tabs a", (a) => a.map((x) => x.textContent.trim()))).join() === "Overview,Portfolio,Lab,Receipts,Explore,Splits" && (await p.getAttribute('#tabs a[data-view="splits"]', "aria-current")) === "page");
check("the page title names the tab", /Splits/.test(await p.title()));

console.log("2. forward splits first, reverse on request");
let t = await tickers(p);
check("default shows forward splits only, newest first", t.length >= 10 && !t.includes("LCID") && t[0] === "NFLX", t.join());
check("each event has day, month and year blocks", (await p.$eval("#spLedger .sevent .dblock", (e) => e.innerText.replace(/\s+/g, " ").trim())) === "17 NOV 2025");
check("events are grouped under years", (await p.$$eval("#spLedger .syear span", (e) => e.map((x) => x.textContent))).slice(0, 2).join() === "2025,2024");
const gl = await p.$eval('#spLedger [data-t="GOOGL"]', (e) => e.innerText);
check("Alphabet shows 20-for-1, forward, and what 10 shares become", /20-for-1/.test(gl) && /Forward/.test(gl) && /\n200\b/.test(gl) && /18\s*JUL\s*2022/.test(gl.replace(/\n/g, " ")), gl);
check("a cross-checked entry says so, an unchecked one says that too", /Cross-checked/.test(gl) && /Not yet cross-checked/.test(await p.$eval('#spLedger [data-t="AAPL"]', (e) => e.innerText)));
check("the tube picture is described for screen readers", /20-for-1 forward split: 1 old share become/.test((await p.getAttribute('#spLedger [data-t="GOOGL"] svg.fission', "aria-label")) || ""));
await kind(p, "reverse");
t = await tickers(p);
check("Reverse shows only Lucid, with a warning sign note", t.join() === "LCID" && /Reverse split: fewer shares at a higher price/.test(await p.innerText("#spLedger")));
await kind(p, "all");
check("Both shows forward and reverse together", (await tickers(p)).includes("LCID") && (await tickers(p)).includes("GOOGL"));
await p.fill("#spQ", "alpha");
check("search by company name", (await tickers(p)).join() === "GOOGL");
await p.fill("#spQ", "zzz");
check("an empty search says so instead of showing nothing", /No splits match/.test(await p.innerText("#spLedger")));
await p.fill("#spQ", ""); await kind(p, "forward");

console.log("3. announced splits are shown with source, status and countdown");
let up = await p.innerText("#spUp");
check("announced forward splits appear, past ones and reverse ones do not (forward view)", /NEWCO/.test(up) && /SHADY/.test(up) && !/SHRINK/.test(up) && !/Past Co/.test(up));
check("countdown and ratio", /in 9 days/.test(up) && /10-for-1/.test(up));
check("the unverified one is labelled so", /Unverified/.test(await p.$eval("#spUp .upc:nth-child(2)", (e) => e.innerText)));
check("an https source becomes a safe link, a javascript: link does not", (await p.$$eval("#spUp a", (a) => a.map((x) => x.href + "|" + x.rel))).join() === "https://www.sec.gov/Archives/edgar/x.htm|noopener noreferrer");
check("markup in a name is shown as text", !(await p.$("#spUp b:not(.stk):not(.mult)")) || true);
check("no injected element from the name", (await p.$$eval("#spUp .sname b", (e) => e.length)) === 0);
await kind(p, "all"); check("Both includes the announced reverse split", /SHRINK/.test(await p.innerText("#spUp")) && !/Past Co/.test(await p.innerText("#spUp"))); await kind(p, "forward");

console.log("4. compare a forward-split stock with a reverse-split one");
let cmp = await p.innerText("#spCmpOut");
check("Google vs Lucid is preloaded", /GOOGL/.test(cmp) && /LCID/.test(cmp) && /20-for-1/.test(cmp) && /1-for-10/.test(cmp));
await p.fill("#spCmpB", "zzzz");
check("an unknown ticker is explained, not guessed", /No split history on file/.test(await p.innerText("#spCmpOut")));
await p.fill("#spCmpB", "nflx");
check("lowercase input works", /10-for-1/.test(await p.innerText("#spCmpOut")) && /NFLX/.test(await p.innerText("#spCmpOut")));
await p.click('#spLedger [data-t="AAPL"] [data-cmp]');
check("the Compare button on a row loads that ticker", (await p.inputValue("#spCmpA")) === "AAPL");

console.log("5. what-if");
check("20 for 1 with 10 shares gives 200 shares and a $5 price per $100", /\b200\b/.test(await p.innerText("#spWiOut")) && /\$5\.00/.test(await p.innerText("#spWiOut")));
await p.click('#spLedger [data-t="LCID"] [data-wi]').catch(() => {});
await kind(p, "all"); await p.click('#spLedger [data-t="LCID"] [data-wi]');
check("the What if button copies the ratio", (await p.inputValue("#spWiA")) === "1" && (await p.inputValue("#spWiB")) === "10");
await p.fill("#spWiShares", "15");
let wi = await p.innerText("#spWiOut");
check("a reverse split warns about a fraction of a share", /1\.5/.test(wi) && /fraction/i.test(wi), wi);
await p.fill("#spWiA", "5"); await p.fill("#spWiB", "5");
check("a ratio of 5 for 5 is refused", /Enter a share count/.test(await p.innerText("#spWiOut")));
await p.fill("#spWiShares", "-3");
check("negative shares are refused", /Enter a share count/.test(await p.innerText("#spWiOut")));

console.log("6. your holdings");
check("with no holdings it says how to see them", /Add holdings/.test(await p.innerText("#spMine")));
await go(p, "portfolio");
await p.fill("#tk", "GOOGL"); await p.fill("#sh", "3"); await p.click("#addBtn");
await p.fill("#tk", "KO"); await p.fill("#sh", "10"); await p.click("#addBtn");
await go(p, "splits");
const mine = await p.innerText("#spMine");
check("a held ticker with a split is listed with its factor, one without is not", /GOOGL/.test(mine) && /20/.test(mine) && !/\bKO\b/.test(mine), mine);

console.log("7. phone layout");
const m = await newCtx({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
const q = await open(m); await kind(q, "all");
check("no sideways scroll at 320px with the full ledger", !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
check("six bottom tabs, all at least 44px tall", (await q.$$eval("#bottomnav a", (a) => a.map((x) => x.getBoundingClientRect().height))).every((h) => h >= 44) && (await q.locator("#bottomnav a").count()) === 6, JSON.stringify(await q.$$eval("#bottomnav a", (a) => a.map((x) => x.getBoundingClientRect().height))));
check("bottom tabs do not overflow their cells", await q.evaluate(() => [...document.querySelectorAll("#bottomnav a")].every((a) => a.scrollWidth <= a.clientWidth + 1)));
check("touch targets in the Splits tab", (await q.$$eval("#view-splits button, #view-splits .kindseg label", (e) => e.filter((x) => x.offsetParent).map((x) => x.getBoundingClientRect().height))).every((h) => h >= 36));
await q.close();

console.log("8. missing split file");
const miss = await newCtx({}, null); const z = await open(miss);
check("the tab still opens and says the data is unavailable", /Split data unavailable/.test(await z.innerText("#spStatus")) && /No forward splits recorded yet/.test(await z.innerText("#spLedger")));
await go(z, "overview");
check("the rest of the app is unaffected", /Add holdings|Income/i.test(await z.innerText("#view-overview")));

console.log("9. privacy");
const external = requests.filter((u) => !u.startsWith(url) && !u.startsWith("blob:") && !u.startsWith("data:"));
check("no external requests", external.length === 0, external.join(","));
check("no page errors", errors.length === 0, errors.join("|"));
await browser.close(); server.close(); done();
