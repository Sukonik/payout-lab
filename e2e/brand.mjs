import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [], missing = [];
const open = async (c, hash = "#/portfolio") => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("response", (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); }); await p.goto(url + hash); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const hrefs = (p) => p.evaluate(() => ({ svg: document.querySelector("#favSvg").getAttribute("href"), p32: document.querySelector("#fav32").getAttribute("href"), p16: document.querySelector("#fav16").getAttribute("href"), apple: document.querySelector("#appleIcon").getAttribute("href") }));
const logo = (p) => p.$eval("#logoImg", (i) => i.getAttribute("src").match(/logo\/([a-z-]+)\//)[1]);
const accent = (p) => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
const menu = async (p) => { if (await p.$eval("#lookPop", (e) => e.hidden)) await p.click("#lookBtn"); await p.waitForSelector("#lookPop:not([hidden])"); };
const IDS = ["forest-gold", "ion-gold", "mint-ion", "black", "white", "sky-gold"];

console.log("1. defaults: forest-gold favicon, ion-gold mark on light, mint-ion mark on dark");
for (const [scheme, expect] of [["light", "ion-gold"], ["dark", "mint-ion"]]) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: scheme }); const p = await open(c);
  const h = await hrefs(p);
  check(`${scheme}: the tab icon is forest-gold in all four places`, Object.values(h).every((x) => x.includes("/forest-gold/")), JSON.stringify(h));
  check(`${scheme}: the header mark is ${expect}`, (await logo(p)) === expect);
  check(`${scheme}: no look is applied`, (await p.evaluate(() => document.documentElement.dataset.look)) === undefined && (await p.evaluate(() => document.documentElement.style.cssText)) === "");
  await c.close();
}

console.log("2. the theme menu");
let c = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "light" }); let p = await open(c);
check("the menu is closed to start", (await p.$eval("#lookPop", (e) => e.hidden)) && (await p.getAttribute("#lookBtn", "aria-expanded")) === "false");
await p.click("#lookBtn"); await p.waitForSelector("#lookPop:not([hidden])");
check("it opens with six looks and Auto/Light/Dark", (await p.$$(".look-btn")).length === 6 && (await p.$$('input[name="thememode"]')).length === 3 && (await p.getAttribute("#lookBtn", "aria-expanded")) === "true");
check("nothing is selected and Reset is hidden at the default", (await p.$$('.look-btn[aria-pressed="true"]')).length === 0 && (await p.$eval("#lookReset", (e) => e.hidden)));
check("every look button is at least 44px", (await p.$$eval(".look-btn", (b) => b.map((x) => x.getBoundingClientRect().height))).every((h) => h >= 44));
await p.keyboard.press("Escape");
check("Escape closes it and returns focus to the button", (await p.$eval("#lookPop", (e) => e.hidden)) && (await p.evaluate(() => document.activeElement.id)) === "lookBtn");
await p.click("#lookBtn"); await p.mouse.click(20, 400);
check("clicking elsewhere closes it", await p.$eval("#lookPop", (e) => e.hidden));

console.log("3. each look changes colours, tab icon and header mark; the choice sticks");
const seen = new Set();
for (const id of IDS) {
  await menu(p); await p.click(`.look-btn[data-id="${id}"]`);
  const h = await hrefs(p), a = await accent(p);
  seen.add(a);
  check(`${id}: favicon, PNGs and touch icon all switch`, Object.values(h).every((x) => x.includes(`/${id}/`)), JSON.stringify(h));
  check(`${id}: it is marked selected and the accent colour is set`, (await p.getAttribute(`.look-btn[data-id="${id}"]`, "aria-pressed")) === "true" && /^#[0-9a-f]{6}$/i.test(a), a);
  check(`${id}: the tab icon files exist`, (await Promise.all(Object.values(h).map((x) => p.request.get(url + x)))).every((r) => r.ok()));
  if (id === "sky-gold") { await p.reload(); await p.waitForFunction(() => document.documentElement.dataset.ready); check("the choice survives a reload", (await hrefs(p)).svg.includes("/sky-gold/") && (await accent(p)) === a); }
}
check("the six looks have six different accents (light)", seen.size === 6, [...seen].join());
await menu(p); await p.click("#lookReset");
check("Use the default look puts everything back", (await hrefs(p)).svg.includes("/forest-gold/") && (await p.evaluate(() => document.documentElement.style.cssText)) === "" && (await p.evaluate(() => localStorage.getItem("payoutlab.look"))) === null);
await c.close();

console.log("4. light and dark: the same look gets its own dark colours and a legible mark");
c = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "light" }); p = await open(c);
await menu(p); await p.click('.look-btn[data-id="black"]');
check("black on light uses the black mark", (await logo(p)) === "black");
const accL = await accent(p);
await p.click('input[name="thememode"][value="dark"]', { force: true });
check("switching to dark gives black its dark accent and swaps the mark so it stays visible", (await accent(p)) !== accL && (await logo(p)) === "mint-ion", `${accL} -> ${await accent(p)} ${await logo(p)}`);
check("the tab icon stays black (it is the look's icon)", (await hrefs(p)).svg.includes("/black/"));
await p.click('.look-btn[data-id="white"]');
check("white on dark uses the white mark", (await logo(p)) === "white");
await p.click('input[name="thememode"][value="light"]', { force: true });
check("white on light falls back to ion-gold", (await logo(p)) === "ion-gold");
await p.click('input[name="thememode"][value="auto"]', { force: true });
check("the quick moon/sun button and the menu stay in step", (await p.getAttribute("#themeBtn", "aria-label")) === "Switch to dark mode" && (await p.isChecked('input[name="thememode"][value="auto"]')));
await p.keyboard.press("Escape");
await p.click("#themeBtn");
check("one click on the moon flips to dark and the menu follows", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark" && (await p.$eval('input[name="thememode"][value="dark"]', (e) => e.checked)));
await c.close();
{
  const d = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" }); const q = await open(d);
  await menu(q); await q.click('.look-btn[data-id="forest-gold"]');
  check("auto-dark device: forest-gold gets the dark accent and the mint-ion mark", (await accent(q)) === "#6fd49c" && (await logo(q)) === "mint-ion", `${await accent(q)} ${await logo(q)}`);
  await d.close();
}

console.log("5. phone: bottom sheet, no sideways scroll, nothing clipped");
c = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, colorScheme: "dark" }); p = await open(c);
const ys = await Promise.all(["#saveBtn", "#lookBtn", "#settingsBtn", "#tagBtn"].map((s) => p.$eval(s, (e) => { const b = e.getBoundingClientRect(); return b.top + b.height / 2; })));
check("header buttons share a centre line", Math.max(...ys) - Math.min(...ys) <= 1.5, ys.join());
check("the portfolio tag is not cut off", await p.$eval(".tag-status", (e) => e.scrollWidth <= e.clientWidth + 1));
check("the theme menu button is in the header; the quick toggle lives in the menu on phones", (await p.isVisible("#lookBtn")) && !(await p.isVisible("#themeBtn")));
await p.click("#lookBtn"); await p.waitForSelector("#lookPop:not([hidden])");
const r = await p.$eval("#lookPop", (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, bottom: b.bottom, h: innerHeight, w: innerWidth }; });
check("the menu is a full-width sheet at the bottom", r.l <= 1 && r.r >= r.w - 1 && Math.abs(r.bottom - r.h) <= 1, JSON.stringify(r));
check("a scrim is shown behind it", await p.isVisible("#lookScrim"));
check("no sideways scroll", !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
check("tile names are not clipped", await p.$$eval(".look-name", (n) => n.every((x) => x.scrollWidth <= x.clientWidth + 1)));
await p.click("#lookScrim", { position: { x: 5, y: 5 } });
check("tapping the scrim closes it", await p.$eval("#lookPop", (e) => e.hidden));
await c.close();

console.log("6. assets and errors");
check("no missing files", missing.length === 0, missing.join(" | "));
check("no page errors", errors.length === 0, errors.join("|"));
await browser.close(); server.close(); done();
