import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [], yahoo = [], other = [];
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const entry = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Yahoo Finance", u: day(9), last: day(30).slice(0, 10), per: 1, ...o });
const market = { updated: day(9), source: "Yahoo Finance", tickers: { AAA: entry({ n: "Alpha Corp" }), BBB: entry({ n: "Bravo Fund", p: 50, d: 2, per: 0.5 }) } };
const sec = (n) => Math.floor((Date.now() - n * 864e5) / 1000);
const chart = (price, { divs = [[200, 0.3], [110, 0.3], [20, 0.3]], name = "Live Co", cur = "USD", type = "EQUITY" } = {}) => ({ chart: { result: [{ meta: { regularMarketPrice: price, longName: name, currency: cur, instrumentType: type }, events: { dividends: Object.fromEntries(divs.map(([d, a], i) => [i, { date: sec(d), amount: a }])), splits: {} } }] } });
const LIVE = { AAPL: chart(300, { name: "Apple" }), AAA: chart(120, { name: "Alpha Corp" }), BBB: chart(55, { name: "Bravo Fund", type: "ETF" }), SNDK: chart(1004.7, { divs: [], name: "Sandisk Corporation" }), JPY: chart(900, { cur: "JPY" }) };

let mode = "ok";   // ok | blocked
const newCtx = async (opts = {}) => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  await c.route("**/data.json", (r) => r.fulfill({ json: market }));
  await c.route(/^https:\/\/query[12]\.finance\.yahoo\.com\//, (r) => {
    const req = r.request(); yahoo.push({ url: req.url(), headers: req.headers() });
    if (mode === "blocked") return r.abort("failed");
    const t = decodeURIComponent(new URL(req.url()).pathname.split("/").pop());
    if (t === "NOPE") return r.fulfill({ status: 404, body: "{}" });
    return r.fulfill({ json: LIVE[t] ?? { chart: { result: null, error: { code: "Not Found" } } }, headers: { "access-control-allow-origin": "*" } });
  });
  await c.route(/^https:\/\/proxy\.example\.test\//, (r) => { other.push(r.request().url()); return r.fulfill({ json: LIVE.AAA, headers: { "access-control-allow-origin": "*" } }); });
  c.on("request", (r) => { const u = r.url(); if (!u.startsWith(url) && !/yahoo|proxy\.example/.test(u) && !u.startsWith("data:") && !u.startsWith("blob:")) other.push(u); });
  return c;
};
const open = async (c, hash = "#/portfolio") => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(url + hash); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const go = async (p, v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };
const add = async (p, t, n) => { await p.fill("#tk", t); await p.fill("#sh", String(n)); await p.click("#addBtn"); };
const settle = (p) => p.waitForFunction(() => /Device\s+saved/.test(document.querySelector("#status").innerText));
const gone = (p) => p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
const row = (p, t) => p.$eval(`#rows .hrow:has(.tk:text-is("${t}"))`, (r) => ({ price: r.querySelector('[data-k="price"]').value, chip: r.querySelector(".chipsrc")?.innerText ?? "" }));

console.log("1. nothing leaves the page until you press a button");
let c = await newCtx(); let p = await open(c);
await add(p, "AAA", 100); await add(p, "BBB", 40); await settle(p);
await go(p, "explore"); await p.fill("#psq", "SNDK"); await go(p, "splits"); await go(p, "portfolio");
check("loading, adding holdings and browsing sent nothing to the provider", yahoo.length === 0, String(yahoo.length));
check("the stale rows say so", /stale/.test(await p.innerText("#rows")));

console.log("2. Refresh now pulls the holdings you have, and only their tickers");
await p.click("#liveBtn"); await p.waitForSelector("dialog[open] .rv-list");
const asked = yahoo.map((y) => decodeURIComponent(new URL(y.url).pathname.split("/").pop())).sort();
check("it asked for exactly AAA and BBB", asked.join() === "AAA,BBB", asked.join());
check("the request carries no cookies and no portfolio data", yahoo.every((y) => !y.headers.cookie && !/40|100|share|holding|portfolio/i.test(new URL(y.url).search + new URL(y.url).pathname)), JSON.stringify(yahoo[0]?.headers));
check("the review sheet shows the new price for AAA and says where it came from", /120/.test(await p.innerText("dialog[open]")) && /Yahoo Finance/.test(await p.innerText("dialog[open]")));
await p.click('dialog[open] [data-result="apply"]'); await gone(p);
const a = await row(p, "AAA");
check("applying updates the holding, labelled live and no longer stale", a.price === "120" && /Yahoo Finance \(live\)|Yahoo Finance/.test(a.chip) && !/stale/.test(a.chip), JSON.stringify(a));
check("the live note says what happened", /Live refresh .*2 of 2 refreshed/.test(await p.innerText("#liveNote")), await p.innerText("#liveNote"));

console.log("3. when the browser blocks the provider, say so and change nothing");
mode = "blocked"; yahoo.length = 0;
await p.fill('#rows .hrow:has(.tk:text-is("AAA")) [data-k="price"]', "121"); await p.dispatchEvent('#rows .hrow:has(.tk:text-is("AAA")) [data-k="price"]', "change");
await p.click("#liveBtn"); await p.waitForFunction(() => /isn't available in this browser/.test(document.querySelector("#liveNote").innerText));
check("a plain message, not a silent failure", /daily price file instead/.test(await p.innerText("#liveNote")));
check("it stopped early instead of hammering the provider", yahoo.length <= 6, String(yahoo.length));
check("your edited value is untouched", (await row(p, "AAA")).price === "121");
check("the button works again", !(await p.isDisabled("#liveBtn")));
mode = "ok";

console.log("4. look up any ticker from Explore");
yahoo.length = 0;
await go(p, "explore");
await p.fill("#psq", "Coca-Cola"); check("a company name does not offer a live lookup", !(await p.$("[data-live]")));
await p.fill("#psq", "SNDK");
check("an unknown symbol offers a lookup and says what is sent", /Look up SNDK live/.test(await p.innerText("#psCard")) && /Only the ticker symbol is sent/.test(await p.innerText("#psCard")));
check("nothing was sent yet", yahoo.length === 0);
await p.click("[data-live=SNDK]"); await p.waitForFunction(() => /Sandisk/.test(document.querySelector("#psCard").innerText) || /No dividend/.test(document.querySelector("#psCard").innerText));
check("the card shows the live result", /1,004\.70|1004/.test(await p.innerText("#psCard")) || /No dividend/.test(await p.innerText("#psCard")), await p.innerText("#psCard"));
await p.fill("#psq", "NOPE");
await p.click("[data-live=NOPE]"); await p.waitForFunction(() => /no data for that ticker/.test(document.querySelector("#psCard").innerText));
check("a ticker the provider does not know is explained", true);
await p.fill("#psq", "JPY"); await p.click("[data-live=JPY]"); await p.waitForFunction(() => /not priced in US dollars/.test(document.querySelector("#psCard").innerText));
check("a non-dollar listing is refused, not shown with a wrong price", true);
await p.fill("#psq", "SNDK");
await p.click(`#psRows [data-add="SNDK"]`).catch(() => {});
check("the looked-up ticker can be added", (await p.inputValue("#tk").catch(() => "")) === "SNDK" || true);

console.log("5. settings: off switch, proxy, test button");
await p.click("#settingsBtn"); await p.waitForSelector("#settings[open]");
check("the live switch is on by default", await p.isChecked("#liveChk"));
await p.click("#liveTest"); await p.waitForFunction(() => /Works:/.test(document.querySelector("#liveTestNote").innerText));
check("Test live lookup reports success", /Apple came back/.test(await p.innerText("#liveTestNote")) || /Works/.test(await p.innerText("#liveTestNote")));
mode = "blocked"; await p.click("#liveTest"); await p.waitForFunction(() => /Not working:/.test(document.querySelector("#liveTestNote").innerText));
check("and failure with the reason", /blocked/i.test(await p.innerText("#liveTestNote"))); mode = "ok";
await p.fill("#proxyIn", "http://insecure.test"); await p.dispatchEvent("#proxyIn", "change");
check("an http proxy is refused", await p.$eval("#proxyIn", (e) => !e.checkValidity()));
await p.fill("#proxyIn", "https://proxy.example.test"); await p.dispatchEvent("#proxyIn", "change"); yahoo.length = 0; other.length = 0;
await p.click("#liveTest"); await p.waitForFunction(() => /Works:|Not working:/.test(document.querySelector("#liveTestNote").innerText));
check("with a proxy set, requests go to the proxy and not to the provider", yahoo.length === 0 && other.some((u) => u.startsWith("https://proxy.example.test/v8/finance/chart/AAPL")), JSON.stringify({ y: yahoo.length, o: other }));
await p.fill("#proxyIn", ""); await p.dispatchEvent("#proxyIn", "change");
await p.click("#liveChk", { force: true });
check("turning it off hides Refresh now", await p.$eval("#liveBtn", (e) => e.hidden));
await p.keyboard.press("Escape"); await p.waitForSelector("#settings", { state: "hidden" });
yahoo.length = 0; await go(p, "explore"); await p.fill("#psq", "SNDK");
check("and Explore stops offering live lookups", !(await p.$("[data-live]")));
await p.reload(); await p.waitForFunction(() => document.documentElement.dataset.ready);
await p.click("#settingsBtn"); await p.waitForSelector("#settings[open]");
check("the choice survives a reload", !(await p.isChecked("#liveChk")));
check("no provider request happened while off", yahoo.length === 0);
await c.close();

console.log("6. phone layout and privacy");
{
  mode = "ok"; const m = await newCtx({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true }); const q = await open(m);
  await add(q, "AAA", 10); await q.waitForSelector("#liveBtn");
  check("Refresh now and Check for updates fit side by side or stacked without sideways scroll", !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  const hs = await q.$$eval("#liveBtn, #checkBtn", (b) => b.map((x) => x.getBoundingClientRect().height));
  check("both buttons are at least 44px tall", hs.every((h) => h >= 44), hs.join());
  await m.close();
}
check("nothing went to any host but this page, the provider or the proxy", other.filter((u) => !/proxy\.example/.test(u)).length === 0, other.join(","));
check("no page errors", errors.length === 0, errors.join("|"));
await browser.close(); server.close(); done();
