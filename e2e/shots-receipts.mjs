// Screenshots of saved reports, comparison and the printable report. Usage: node e2e/shots-receipts.mjs pr7
import path from "node:path";
import { launch, serve } from "./lib.mjs";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const prefix = process.argv[2] || "v3a";
const { server, url } = await serve(root);
const browser = await launch();
const out = (n) => path.join(root, "docs/screenshots", `${prefix}-${n}.png`);
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const entry = (o) => ({ n: "Name", p: 100, d: 4, s: "Q3", q: true, src: "Tiingo", u: day(1), last: day(20).slice(0, 10), per: 1, ...o });
const market = { updated: day(1), source: "Tiingo", tickers: { SCHD: entry({ n: "Schwab US Dividend Equity ETF", p: 32.6, d: 1.05 }), O: entry({ n: "Realty Income", p: 54.2, d: 3.24, s: "M" }), KO: entry({ n: "Coca-Cola", p: 70, d: 2.04, s: "Q1" }), VZ: entry({ n: "Verizon", p: 41, d: 2.8, s: "Q2" }) } };
for (const [name, vp, scale] of [["desktop", { width: 1280, height: 900 }, 1], ["mobile", { width: 390, height: 844 }, 2]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, isMobile: name === "mobile", hasTouch: name === "mobile" });
  await ctx.route("**/data.json", (r) => r.fulfill({ json: market }));
  const p = await ctx.newPage();
  await p.goto(url + "#/portfolio"); await p.waitForFunction(() => document.documentElement.dataset.ready);
  for (const [t, n] of [["SCHD", 300], ["O", 80], ["KO", 40]]) { await p.fill("#tk", t); await p.fill("#sh", String(n)); await p.click("#addBtn"); }
  await p.evaluate(() => { location.hash = "#/receipts"; }); await p.waitForSelector("#view-receipts:not([hidden])");
  await p.fill("#rcLabel", "Before the October changes"); await p.click("#rcSaveReport"); await p.waitForTimeout(300);
  await p.evaluate(() => { location.hash = "#/portfolio"; }); await p.waitForSelector("#view-portfolio:not([hidden])");
  await p.fill('[data-i="0"][data-k="shares"]', "420"); await p.fill("#tk", "VZ"); await p.fill("#sh", "60"); await p.click("#addBtn");
  await p.fill('[data-i="1"][data-k="div"]', "3.6"); await p.dispatchEvent('[data-i="1"][data-k="div"]', "change");
  await p.evaluate(() => { location.hash = "#/receipts"; }); await p.waitForSelector("#view-receipts:not([hidden])"); await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: out(`receipts-${name}`) });
  await p.evaluate(() => document.querySelector("#cmpCard").scrollIntoView()); await p.waitForTimeout(300);
  await p.screenshot({ path: out(`compare-${name}`) });
  if (name === "desktop") {
    const [pop] = await Promise.all([ctx.waitForEvent("page"), p.click('#rcList .rcrow [data-act="print"]')]);
    await pop.waitForLoadState(); await pop.setViewportSize({ width: 900, height: 1000 }); await pop.screenshot({ path: out("printable") }); await pop.close();
  }
  await ctx.close();
}
await browser.close(); server.close();
