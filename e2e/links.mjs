import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [];
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const entry = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: day(1), last: day(20).slice(0, 10), per: 1, ...o });
const market = { updated: day(1), source: "Tiingo", tickers: { AAA: entry({ n: "Alpha", p: 50, d: 2 }), BBB: entry({ n: "Bravo", p: 120, d: 6, s: "M" }) } };
const requests = [];
const newCtx = async () => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await c.route("**/data.json", (r) => r.fulfill({ json: market })); c.on("request", (r) => requests.push(r.url())); return c; };
const open = async (c, hash = "#/portfolio") => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(url + hash); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const go = async (p, v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };
const add = async (p, t, n) => { await p.fill("#tk", t); await p.fill("#sh", String(n)); await p.click("#addBtn"); };
const settle = (p) => p.waitForFunction(() => /Device\s+saved/.test(document.querySelector("#status").innerText));
const opened = (p) => p.waitForFunction(() => /Opened .* as a new portfolio/.test(document.querySelector("#toast")?.textContent || ""));
const gone = (p) => p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
const makeLink = async (p) => {
  await go(p, "receipts"); await p.click("#snapMake"); await p.waitForSelector("#snName");
  check("copy is disabled until the box is ticked", await p.isDisabled("#snCopy"));
  await p.check("#snOk"); await p.waitForSelector("textarea.linkbox");
  const link = await p.inputValue("textarea.linkbox"); const info = await p.innerText("#snInfo");
  return { link, info };
};

console.log("1. workspace bookmark");
let c = await newCtx(); let p = await open(c);
await add(p, "AAA", 100); await add(p, "BBB", 40); await settle(p);
await go(p, "receipts");
const ws = await p.inputValue("#wsLink");
check("bookmark carries only the portfolio id", /#\/overview\?p=pf_/.test(ws) && !/AAA|BBB|100/.test(ws), ws);
check("the bookmark card says it cannot restore data", /cannot bring your portfolio back/.test(await p.innerText("#linksCard")));

console.log("2. snapshot link");
const { link, info } = await makeLink(p);
check("link is on this origin and carries the snapshot fragment", link.startsWith(url + "#/snapshot?v=1&c=") , link.slice(0, 80));
check("size and warning are shown", /characters/.test(info), info);
await p.click('body > dialog:not(#settings) [data-result="cancel"]'); await gone(p);

console.log("3. a fresh browser opens it as a new portfolio");
const c2 = await newCtx(); const q = await open(c2, "#/portfolio");
await q.evaluate((l) => { location.hash = l.slice(l.indexOf("#")); }, link);
await q.waitForSelector("body > dialog:not(#settings) h2");
check("a preview appears before anything is opened", /Open this snapshot/.test(await q.innerText("body > dialog:not(#settings)")) && /AAA/.test(await q.innerText("body > dialog:not(#settings)")));
check("the payload is already gone from the address bar", !/snapshot/.test(await q.evaluate(() => location.hash)));
await q.click('body > dialog:not(#settings) [data-result="open"]'); await gone(q); await opened(q); await settle(q);
await go(q, "portfolio");
check("holdings arrived", /AAA/.test(await q.innerText("#view-portfolio")) && /BBB/.test(await q.innerText("#view-portfolio")));
await settle(q);

console.log("4. old links keep showing the old copy after an update");
await go(p, "portfolio"); await p.fill('[data-i="0"][data-k="shares"]', "999"); await p.dispatchEvent('[data-i="0"][data-k="shares"]', "change");
const c3 = await newCtx(); const r = await open(c3, "#/portfolio");
await r.evaluate((l) => { location.hash = l.slice(l.indexOf("#")); }, link);
await r.waitForSelector("body > dialog:not(#settings) h2"); await r.click('body > dialog:not(#settings) [data-result="open"]'); await gone(r); await opened(r); await settle(r); await go(r, "portfolio");
check("the old link still shows 100 shares", (await r.inputValue('[data-i="0"][data-k="shares"]')) === "100");

console.log("5. damaged links change nothing");
for (const bad of ["#/snapshot?v=1&c=1&d=AAAA", "#/snapshot?v=1&c=0&d=!!", "#/snapshot?v=9&c=0&d=AAAA"]) {
  const c4 = await newCtx(); const s = await open(c4, "#/portfolio");
  await s.evaluate((h) => { location.hash = h; }, bad);
  await s.waitForSelector("body > dialog:not(#settings) h2");
  check(`refused: ${bad.slice(10, 30)}`, /damaged|open that link/i.test(await s.innerText("body > dialog:not(#settings)")));
  await s.click('body > dialog:not(#settings) [data-result="ok"]'); await gone(s);
  check("no holdings were created", !/AAA/.test(await s.innerText("#view-portfolio")));
}

console.log("6. oversize portfolios are refused, never truncated");
{
  const big = await newCtx(); const b = await open(big);
  const tickers = Array.from({ length: 450 }, (_, i) => "T" + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + ((i / 26) | 0)));
  const csv = "Symbol,Quantity,Name\n" + tickers.map((t, i) => `${t},${(i * 7919) % 9973 + 11},${Math.floor(Math.abs(Math.sin(i + 1)) * 1e9).toString(36)} ${Math.floor(Math.abs(Math.cos(i + 1)) * 1e9).toString(36)} Holdings`).join("\n");
  await go(b, "portfolio");
  await b.setInputFiles("#csvIn", { name: "big.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await b.waitForSelector("dialog[open] #ciBody table"); await b.click("#ciApply"); await gone(b);
  await b.waitForFunction(() => document.querySelectorAll("#view-portfolio .hrow").length > 300);
  check("the big portfolio really has hundreds of holdings", (await b.$$("#view-portfolio .hrow")).length > 300);
  await go(b, "receipts"); await b.click("#snapMake"); await b.waitForSelector("#snName"); await b.check("#snOk"); await b.waitForTimeout(300);
  const t = await b.innerText("#snInfo");
  const n = await b.evaluate(() => document.querySelectorAll("#view-portfolio .hrow").length).catch(() => 0);
  check("too large: says so, offers the packet instead, no link box", /too large/i.test(t) && /Save packet/.test(t) && !(await b.$("textarea.linkbox")), t.slice(0, 120));
  check("copy stays disabled", await b.isDisabled("#snCopy"));
}

console.log("7. nothing is sent anywhere");
const external = requests.filter((u) => !u.startsWith(url) && !u.startsWith("data:") && !u.startsWith("blob:"));
check("no external requests, and no payload in any request", external.length === 0 && !requests.some((u) => u.includes("snapshot")), external.join(","));
check("no page errors", errors.length === 0, errors.join("|"));

await browser.close(); server.close(); done();
