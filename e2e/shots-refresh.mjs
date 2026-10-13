// Screenshots of the market-data card, the review sheet and the Explore caveats, using a controlled market. Usage: node e2e/shots-refresh.mjs pr3
import path from "node:path";
import { launch, serve } from "./lib.mjs";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const prefix = process.argv[2] || "pr3";
const { server, url } = await serve(root);
const browser = await launch();
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const entry = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: day(1), last: day(20).slice(0, 10), per: 1, ...o });
const A = { updated: day(1), source: "Tiingo", tickers: { SCHD: entry({ n: "Schwab US Dividend Equity ETF", p: 32.6, d: 1.05, per: 0.2665 }), O: entry({ n: "Realty Income", p: 54.2, d: 3.24, s: "M", per: 0.27 }), KO: entry({ n: "Coca-Cola", p: 70, d: 2.04, s: "Q1", per: 0.51, u: day(30) }), SPC: entry({ n: "Special Co", p: 40, d: 3, per: 0.5 }) } };
const B = { updated: day(0), source: "Tiingo", tickers: { SCHD: entry({ n: "Schwab US Dividend Equity ETF", p: 33.4, d: 1.07, per: 0.27, u: day(0) }), O: entry({ n: "Realty Income", p: 54.2, d: 3.24, s: "M", per: 0.27, u: day(0) }), KO: entry({ n: "Coca-Cola", p: 70, d: 2.04, s: "Q1", per: 0.51, u: day(30) }), SPC: entry({ n: "Special Co", p: 40, d: 3, per: 0.5, u: day(0) }) } };
for (const [name, vp, scale] of [["desktop", { width: 1280, height: 900 }, 1], ["mobile", { width: 390, height: 844 }, 2]]) {
  let market = A;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, isMobile: name === "mobile", hasTouch: name === "mobile" });
  await ctx.route("**/data.json", (r) => r.fulfill({ json: market }));
  const p = await ctx.newPage();
  await p.goto(url + "#/portfolio"); await p.waitForFunction(() => document.documentElement.dataset.ready);
  for (const [t, n] of [["SCHD", 300], ["O", 80], ["KO", 40], ["SPC", 25]]) { await p.fill("#tk", t); await p.fill("#sh", String(n)); await p.click("#addBtn"); }
  await p.fill('[data-i="1"][data-k="price"]', "52"); await p.dispatchEvent('[data-i="1"][data-k="price"]', "change");
  market = B;
  await p.click("#checkBtn"); await p.waitForSelector("dialog[open] .rv-list"); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(root, "docs/screenshots", `${prefix}-review-${name}.png`) });
  await p.click('dialog[open] [data-result="cancel"]'); await p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
  await p.evaluate(() => document.querySelector("#dataCard").scrollIntoView()); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(root, "docs/screenshots", `${prefix}-datacard-${name}.png`) });
  await p.evaluate(() => { location.hash = "#/explore"; }); await p.waitForSelector("#view-explore:not([hidden])");
  await p.fill("#psq", "SPC"); await p.waitForTimeout(300); await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: path.join(root, "docs/screenshots", `${prefix}-explore-${name}.png`) });
  await ctx.close();
}
await browser.close(); server.close();
