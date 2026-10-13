// Usage: node e2e/shots.mjs <prefix> [view...]   Env: THEME=dark, SAMPLE=0 (skip sample), FULL=1 (full page)
// Takes desktop + mobile screenshots of the given views into docs/screenshots/
import path from "node:path";
import { launch, serve } from "./lib.mjs";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const [prefix, ...views] = process.argv.slice(2);
const { server, url } = await serve(root);
const browser = await launch();
for (const [name, vp, scale] of [["desktop", { width: 1280, height: 860 }, 1], ["mobile", { width: 390, height: 844 }, 2]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, isMobile: name === "mobile", hasTouch: name === "mobile", colorScheme: process.env.THEME === "dark" ? "dark" : "light" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  await p.goto(url + "#/portfolio"); await p.waitForSelector("#status .st"); await p.waitForFunction(() => document.documentElement.dataset.ready);
  if (process.env.SAMPLE !== "0") await p.click("#sampleBtn").catch(() => {});
  await p.waitForTimeout(500);
  for (const v of views.length ? views : ["overview"]) {
    // Special names: "empty" (no holdings), "settings" and "sheet" (open the dialogs)
    const route = ["settings", "sheet"].includes(v) ? "overview" : v === "empty" ? "overview" : v;
    if (v === "empty") { await p.evaluate(() => { location.hash = "#/portfolio"; }); await p.waitForTimeout(200); p.once("dialog", (d) => d.accept()); await p.click("#clearBtn").catch(() => {}); await p.click('dialog[open] [data-result="ok"]').catch(() => {}); await p.waitForTimeout(300); }
    await p.evaluate((h) => { location.hash = "#/" + h; }, route);
    await p.waitForTimeout(900);
    if (v === "settings") { await p.click("#settingsBtn"); await p.waitForTimeout(300); }
    if (v === "sheet") { await p.click("#tagBtn"); await p.waitForTimeout(300); }
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(root, "docs/screenshots", `${prefix}-${v}${process.env.THEME === "dark" ? "-dark" : ""}-${name}.png`), fullPage: !!process.env.FULL });
    if (["settings", "sheet"].includes(v)) { await p.keyboard.press("Escape"); await p.waitForTimeout(200); }
  }
  await ctx.close();
}
await browser.close(); server.close();
