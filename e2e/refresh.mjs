import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [];
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const entry = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: day(1), last: day(20).slice(0, 10), per: 1, ...o });
const marketA = () => ({ updated: day(1), source: "Tiingo", tickers: { AAA: entry({ n: "Alpha Corp" }), BBB: entry({ n: "Bravo Fund", p: 50, d: 2, per: 0.5 }), CCC: entry({ n: "Charlie Inc", u: day(30), p: 20, d: 1, per: 0.25 }), SPC: entry({ n: "Special Co", p: 40, d: 3, per: 0.5 }) } });
const marketB = () => ({ updated: day(0), source: "Tiingo", tickers: { AAA: entry({ n: "Alpha Corp", p: 112, d: 4.4, per: 1.1, u: day(0) }), BBB: entry({ n: "Bravo Fund", p: 55, d: 2, per: 0.5, u: day(0) }), CCC: entry({ n: "Charlie Inc", u: day(30), p: 20, d: 1, per: 0.25 }), SPC: entry({ n: "Special Co", p: 40, d: 3, per: 0.5, u: day(0) }) } });

let market = marketA();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route("**/data.json", (r) => r.fulfill({ json: market }));
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const go = async (v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };
await p.goto(url + "#/portfolio"); await p.waitForFunction(() => document.documentElement.dataset.ready);
const add = async (t, n) => { await p.fill("#tk", t); await p.fill("#sh", String(n)); await p.click("#addBtn"); };
for (const [t, n] of [["AAA", 10], ["BBB", 20], ["CCC", 30], ["SPC", 40], ["ZZZ", 5]]) await add(t, n);
await p.waitForSelector("#toast", { state: "attached" }).catch(() => {});

console.log("1. provenance at the start");
const chip = (t) => p.$eval(`[data-row] .c-id:has(.tk:text-is("${t}")) .chipsrc`, (e) => e.textContent);
check("fresh provider values show source and date", /Tiingo · /.test(await chip("AAA")) && !/stale/.test(await chip("AAA")), await chip("AAA"));
check("a ticker with old provider data is marked stale", /stale/.test(await chip("CCC")), await chip("CCC"));
check("an unknown ticker is marked as yours", /Your numbers/.test(await chip("ZZZ")));
check("tooltip says pay months are estimates and pay date unavailable", /estimated from ex-dividend dates.*pay date not available/s.test(await p.$eval('[data-row] .c-id:has(.tk:text-is("AAA")) .chipsrc', (e) => e.title)));
check("data card says up to date", /Up to date/.test(await p.innerText("#dataPill")));

console.log("2. protect a manual value, then new data arrives");
await p.fill('[data-i="1"][data-k="price"]', "47");           // BBB price becomes yours
await p.dispatchEvent('[data-i="1"][data-k="price"]', "change");
check("edited field becomes yours", /price yours/.test(await chip("BBB")), await chip("BBB"));
market = marketB();
await go("overview");
check("overview totals before refresh come from the old copy", (await p.innerText("#roVal")).includes("$"));
const before = await p.$eval("#roVal", (e) => e.textContent);
await go("portfolio");
await p.click("#checkBtn");
await p.waitForSelector("dialog[open] .rv-list");
const dlg = await p.innerText("dialog[open]");
check("review sheet opens with the observation date", /Review data updates/.test(dlg) && /Observed/.test(dlg));
check("AAA price and dividend are proposed and checked", await p.isChecked('dialog[open] input[data-key$=":price"] >> nth=0'));
check("BBB's own price is offered as 'Replace yours', unchecked by default", /Replace yours/.test(dlg) && !(await p.locator('dialog[open] .rv-row:has-text("BBB") input').first().isChecked()));
check("stale provider data is called out", /Provider data 30 days old/.test(dlg));
check("nothing changed yet", (await p.$eval('[data-i="0"][data-k="price"]', (e) => e.value)) === "100");
await p.click('dialog[open] [data-result="apply"]');
await p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
check("AAA price updated", (await p.$eval('[data-i="0"][data-k="price"]', (e) => e.value)) === "112");
check("AAA dividend updated", (await p.$eval('[data-i="0"][data-k="div"]', (e) => e.value)) === "4.4");
check("BBB price stayed yours", (await p.$eval('[data-i="1"][data-k="price"]', (e) => e.value)) === "47");
check("totals recalculated everywhere", (await p.innerText("#tVal")) !== before);
await go("overview"); await p.waitForTimeout(600);
check("overview shows the new value", (await p.innerText("#roVal")) === (await p.innerText("#tVal")));
check("overview says one value of yours differs", /newer data/.test(await p.innerText("#fresh")));
await go("portfolio");
check("dividend card keeps flagging the protected difference", /differs from the data/.test(await p.innerText("#reviewHint")));
check("update count excludes nothing hidden", /1 update available/.test(await p.innerText("#dataPill")));

console.log("3. trailing vs current rate");
check("default is last 12 months", await p.isChecked('input[name="basis"][value="trailing"]'));
await p.check('input[name="basis"][value="indicated"]', { force: true });
check("switching basis proposes updates, it does not silently rewrite", (await p.$eval('[data-i="3"][data-k="div"]', (e) => e.value)) === "3");
await p.click("#checkBtn"); await p.waitForSelector("dialog[open] .rv-list");
check("review names the current-rate basis", /Dividend \(current rate\)/.test(await p.innerText("dialog[open]")));
await p.click('dialog[open] [data-result="apply"]'); await p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
check("special-payment holding now uses the current rate (0.5 × 4 = 2)", (await p.$eval('[data-i="3"][data-k="div"]', (e) => e.value)) === "2");
check("its chip says current rate", /current rate/.test(await p.$eval('[data-row] .c-id:has(.tk:text-is("SPC")) .chipsrc', (e) => e.title)));

console.log("4. caveats are shown where the numbers are");
await go("overview");
check("calendar says months follow ex-dividend dates", /ex-dividend dates/.test(await p.innerText("#calBasis")));
check("calendar does not claim cash dates", !/pays on|paid on/i.test(await p.innerText("#calBasis")));
await go("explore"); await p.fill("#psq", "SPC");
const card = await p.innerText("#psCard");
check("explore shows both the 12-month total and the current rate", /Last 12 months/.test(card) && /Current rate/.test(card));
check("explore hints at a special or extra payment", /special or extra payment/.test(card));
check("explore admits it cannot separate special payments", /not separated from regular ones/.test(card));

console.log("5. the saved packet carries values, sources, dates and no invented pay date");
await go("portfolio");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "payout-r-"));
const [d] = await Promise.all([p.waitForEvent("download"), p.click("#saveBtn")]);
const f = path.join(tmp, "r.payout"); await d.saveAs(f);
const pk = JSON.parse(fs.readFileSync(f, "utf8"));
const H = (t) => pk.holdings.find((h) => h.ticker === t);
check("updated field records provider and date", H("AAA").fields.price.src === "tiingo" && H("AAA").fields.price.asOf === day(0).slice(0, 10));
check("manual field stays manual with its own value", H("BBB").fields.price.manual === true && H("BBB").fields.price.v === 47);
check("unknown ticker stays manual", H("ZZZ").fields.price.manual === true && H("ZZZ").fields.price.src === "user");
check("ex-date recorded, pay date absent", /^\d{4}-\d{2}-\d{2}$/.test(H("AAA").fields.schedule.exDate) && H("AAA").fields.schedule.payDate === null);
check("dividend basis saved in settings", pk.settings.dividendBasis === "indicated");

check("no console or page errors", errors.length === 0, errors.join(" | "));
await browser.close(); server.close(); done();
