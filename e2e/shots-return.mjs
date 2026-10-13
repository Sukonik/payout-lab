// Screenshots of the start screen and the CSV import. Usage: node e2e/shots-return.mjs pr4
import path from "node:path";
import { launch, serve } from "./lib.mjs";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const prefix = process.argv[2] || "pr4";
const { server, url } = await serve(root);
const browser = await launch();
const out = (n) => path.join(root, "docs/screenshots", `${prefix}-${n}.png`);
const messy = "Positions for account 12345678\r\n\r\nAccount Number,Account Name,Symbol,Description,Quantity,Last Price\r\n12345678,Jane Q Public,SCHD,\"Schwab, US Dividend\",\"1,234.5\",32\r\n12345678,Jane Q Public,O,Realty Income,10,54\r\n12345678,Jane Q Public,SCHD,Schwab again,5.5,32\r\n12345678,Jane Q Public,SPAXX**,Money market,500,1\r\n12345678,Jane Q Public,KO,Coca-Cola,-4,70\r\n12345678,Jane Q Public,MSFT,Microsoft,abc,400\r\n";
for (const [name, vp, scale] of [["desktop", { width: 1280, height: 860 }, 1], ["mobile", { width: 390, height: 844 }, 2]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, isMobile: name === "mobile", hasTouch: name === "mobile" });
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.waitForTimeout(300); await p.screenshot({ path: out(`start-first-${name}`) });
  await p.fill("#gName", "Retirement income"); await p.click('[data-g="start"]'); await p.waitForSelector("#view-portfolio:not([hidden])");
  for (const [t, n] of [["SCHD", 300], ["O", 80], ["KO", 40]]) { await p.fill("#tk", t); await p.fill("#sh", String(n)); await p.click("#addBtn"); }
  await p.waitForTimeout(1200);
  await p.setInputFiles("#csvIn", { name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(messy) });
  await p.waitForSelector("dialog[open] #ciBody table"); await p.waitForTimeout(300);
  await p.screenshot({ path: out(`csv-${name}`) });
  await p.click('dialog[open] [data-result="cancel"]'); await p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: out(`start-return-${name}`) });
  await ctx.close();
}
await browser.close(); server.close();
