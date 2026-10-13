import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [];
const open = async (ctx, hash = "") => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); await p.goto(url + hash); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const view = (p) => p.evaluate(() => [...document.querySelectorAll(".view")].find((v) => !v.hidden)?.dataset.view);
const go = async (p, v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };

console.log("1. routing");
const c1 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
let p = await open(c1);
check("a brand-new visitor sees the start screen", (await p.isVisible("#start")) && (await p.getAttribute("body", "data-gate")) === "first");
check("the start screen replaces tabs and views while it is up", !(await p.isVisible("#tabs")) && !(await p.isVisible("#view-overview")));
await p.click('[data-g="start"]'); await p.waitForSelector("#view-portfolio:not([hidden])");
check("Start leaves the start screen and opens Portfolio", !(await p.isVisible("#start")) && (await p.isVisible("#tabs")));
await go(p, "overview");
check("empty state shown for a new portfolio", await p.isVisible("#ovEmpty") && !(await p.isVisible("#ovMain")));
for (const v of ["portfolio", "lab", "receipts", "explore", "overview"]) { await go(p, v); check(`#/${v} shows ${v}`, (await view(p)) === v); check(`nav marks ${v} current`, (await p.getAttribute(`#tabs a[data-view="${v}"]`, "aria-current")) === "page"); }
await p.evaluate(() => { location.hash = "#/nope"; }); await p.waitForTimeout(200);
check("unknown route recovers to overview", (await view(p)) === "overview" && (await p.evaluate(() => location.hash)) === "#/overview");
await p.close();
p = await open(c1, "#/lab");
check("direct link opens the right view", (await view(p)) === "lab");
check("document title follows the view", (await p.title()) === "Lab · Payout Lab");
await go(p, "explore"); await go(p, "receipts");
await p.goBack(); await p.waitForTimeout(150);
check("browser back works", (await view(p)) === "explore");
await p.goForward(); await p.waitForTimeout(150);
check("browser forward works", (await view(p)) === "receipts");

console.log("2. edits survive navigation across every tab");
await go(p, "portfolio");
await p.click("#sampleBtn");
await p.fill('[data-i="0"][data-k="shares"]', "500");
await go(p, "overview"); await p.waitForTimeout(700);
const inc1 = await p.innerText("#roYear");
await go(p, "lab"); await p.fill('[data-s="target"]', "4321");
await go(p, "explore"); await p.fill("#psq", "KO");
await go(p, "portfolio");
check("holding edit still there", (await p.inputValue('[data-i="0"][data-k="shares"]')) === "500");
await go(p, "overview"); await p.waitForTimeout(600);
check("overview income unchanged by navigation", (await p.innerText("#roYear")) === inc1);
await go(p, "lab");
check("lab setting still there", (await p.inputValue('[data-s="target"]')) === "4321");
await go(p, "explore");
check("explore search still there", (await p.inputValue("#psq")) === "KO");
await go(p, "overview");
await p.click('#cal .tube[data-month="2"]');
check("tapping a tube names the payers", /Mar/.test(await p.innerText("#calDetail")) && /SCHD/.test(await p.innerText("#calDetail")));
check("tube is a labelled toggle", (await p.getAttribute('#cal .tube[data-month="2"]', "aria-pressed")) === "true" && /Mar: \$/.test(await p.getAttribute('#cal .tube[data-month="2"]', "aria-label")));

console.log("3. keyboard and focus");
await go(p, "portfolio");
await p.focus('#tabs a[data-view="lab"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
check("Enter on a tab navigates", (await view(p)) === "lab");
check("focus moves to the view heading", await p.evaluate(() => document.activeElement?.id === "h-lab"));
await p.keyboard.press("Tab");
check("skip link exists and is first focusable", await p.evaluate(() => document.querySelector(".skip")?.getAttribute("href") === "#main"));
await p.close();

console.log("4. layout at phone, tablet and desktop widths: no page-wide horizontal overflow");
for (const [w, h] of [[320, 640], [360, 740], [390, 844], [768, 1024], [1280, 860]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 });
  const q = await open(ctx, "#/portfolio");
  await q.click("#sampleBtn");
  let bad = [];
  for (const v of ["overview", "portfolio", "lab", "receipts", "explore"]) {
    await go(q, v); await q.waitForTimeout(120);
    const o = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    if (o.sw > o.iw + 1) bad.push(`${v} ${o.sw}>${o.iw}`);
  }
  check(`${w}px wide`, bad.length === 0, bad.join(", "));
  if (w === 390) {
    check("bottom nav visible on phones with five items", (await q.isVisible("#bottomnav")) && (await q.locator("#bottomnav a").count()) === 5);
    check("desktop tabs hidden on phones", !(await q.isVisible("#tabs")));
    const small = await q.evaluate(() => [...document.querySelectorAll("button,a.btn,#bottomnav a,input:not([type=range]):not([type=checkbox]),select")].filter((e) => e.offsetParent && !e.closest("dialog:not([open])")).map((e) => { const r = e.getBoundingClientRect(); return { n: (e.id || e.className || e.tagName).toString().slice(0, 20), h: r.height, w: r.width }; }).filter((x) => x.h < 36 || x.w < 36));
    check("touch targets are at least 36px", small.length === 0, JSON.stringify(small.slice(0, 5)));
    check("inputs use 16px text (no iOS zoom)", await q.evaluate(() => [...document.querySelectorAll("input[type=text],input[type=number],input[type=search],select")].filter((e) => e.offsetParent).every((e) => parseFloat(getComputedStyle(e).fontSize) >= 16)));
  }
  if (w === 1280) check("bottom nav hidden on desktop", !(await q.isVisible("#bottomnav")) && (await q.isVisible("#tabs")));
  await ctx.close();
}

console.log("5. settings, appearance and storage choices");
const c5 = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "light" });
p = await open(c5, "#/portfolio");
await p.click("#sampleBtn");
await p.waitForFunction(() => /Device\s+saved/.test(document.querySelector("#status").innerText));
await p.click("#settingsBtn"); await p.waitForSelector("#settings[open]");
await p.check('input[name="theme"][value="dark"]', { force: true });
check("dark theme applies", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
check("theme choice is remembered", (await p.evaluate(() => localStorage.getItem("payoutlab.theme"))) === "dark");
await p.check('input[name="theme"][value="auto"]', { force: true });
check("auto returns to the device setting", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === null);
await p.uncheck("#remChk", { force: true }); await p.waitForTimeout(300);
check("turning off remembering shows guest mode", /Device\s+off/.test(await p.innerText("#status")));
check("and removes the on-device copy", await p.evaluate(async () => { const r = await new Promise((res) => { const q = indexedDB.open("payoutlab"); q.onsuccess = () => { const t = q.result.transaction("kv").objectStore("kv").getAllKeys(); t.onsuccess = () => res(t.result); }; }); return !r.some((k) => String(k).startsWith("p:")); }));
await p.keyboard.press("Escape");
await p.close();

console.log("6. reduced motion");
const c6 = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 860 } });
p = await open(c6, "#/portfolio"); await p.click("#sampleBtn"); await go(p, "overview");
check("bubble animation is off", (await p.evaluate(() => getComputedStyle(document.querySelector(".bub")).animationName)) === "none");
check("liquid transition is off", (await p.evaluate(() => getComputedStyle(document.querySelector(".liqg")).transitionDuration)) === "0s");
await p.close();

console.log("7. dark theme, contrast of key text pairs");
const c7 = await browser.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 860 } });
p = await open(c7, "#/portfolio"); await p.click("#sampleBtn");
const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
for (const [theme, ctxOpts] of [["dark", c7], ["light", await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 860 } })]]) {
  const q = theme === "dark" ? p : await open(ctxOpts, "#/portfolio");
  if (theme !== "dark") await q.click("#sampleBtn");
  const pairs = await q.evaluate(() => {
    const cs = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    return { body: [cs("body", "color"), cs("body", "backgroundColor")], card: [cs(".card .lede", "color"), cs(".card", "backgroundColor")], save: [cs(".save", "color"), cs(".save", "backgroundColor")], tab: [cs("#tabs a[aria-current]", "color"), cs("#tabs a[aria-current]", "backgroundColor")], chip: [cs(".chipsrc", "color"), cs(".chipsrc", "backgroundColor")], name: [cs(".hrow .nm", "color"), cs(".card", "backgroundColor")] };
  });
  for (const [name, [fg, bg]] of Object.entries(pairs)) check(`${theme} ${name} contrast ≥ 4.5`, ratio(fg, bg) >= 4.5, `${fg} on ${bg} = ${ratio(fg, bg).toFixed(2)}`);
}

check("no console or page errors", errors.length === 0, errors.join(" | "));
await browser.close(); server.close(); done();
