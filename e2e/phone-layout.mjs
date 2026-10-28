// Every tab fits a 390px phone with no sideways scroll, and touch targets on phones are at least 44px tall. Run: node e2e/phone-layout.mjs
import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(url + "index.html");
const gateSmall = await p.evaluate(() => [...document.querySelectorAll(".privacy .linkbtn")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 43.5; }).length);
check("start screen: the bookmark link is at least 44px tall", gateSmall === 0, `${gateSmall} too small`);
await p.click("button[data-g=sample]");
await p.waitForSelector("#view-overview:not([hidden])");
for (const v of ["overview", "portfolio", "lab", "receipts", "explore", "splits"]) {
  await p.evaluate((h) => { location.hash = h; }, "#/" + v);
  await p.waitForSelector(`#view-${v}:not([hidden])`);
  await p.waitForTimeout(300);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${v}: no sideways scroll on a phone`, over <= 0, `overflow ${over}px`);
  const small = await p.evaluate((v) => [...document.querySelectorAll(`#view-${v} .btn, #view-${v} .more`)].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 43.5; }).length, v);
  check(`${v}: buttons and links are at least 44px tall`, small === 0, `${small} too small`);
}
check("no page errors", errors.length === 0, errors.join("; "));
await browser.close(); server.close(); done();
