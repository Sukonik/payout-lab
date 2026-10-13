// Usage: node e2e/shots.mjs <prefix> [route...]   Takes desktop + mobile screenshots into docs/screenshots/
import path from "node:path";
import { launch, serve } from "./lib.mjs";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const [prefix, ...routes] = process.argv.slice(2);
const { server, url } = await serve(root);
const browser = await launch();
for (const [name, vp, scale] of [["desktop", { width: 1280, height: 860 }, 1], ["mobile", { width: 390, height: 844 }, 2]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, isMobile: name === "mobile", hasTouch: name === "mobile" });
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForSelector("#chips .chip");
  await p.click("#sampleBtn").catch(() => {});
  await p.waitForTimeout(600);
  for (const r of routes.length ? routes : [""]) {
    if (r) { await p.evaluate((h) => { location.hash = h; }, r); await p.waitForTimeout(400); }
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(root, "docs/screenshots", `${prefix}${r ? "-" + r.replace(/[^a-z0-9]/gi, "") : ""}-${name}.png`) });
  }
  await ctx.close();
}
await browser.close(); server.close();
