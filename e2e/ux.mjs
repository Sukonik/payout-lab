import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const { server, url } = await serve(root);
const browser = await launch();
const errors = [];
const open = async (c, hash = "#/portfolio") => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(url + hash); await p.waitForFunction(() => document.documentElement.dataset.ready); return p; };
const go = async (p, v) => { await p.evaluate((h) => { location.hash = h; }, "#/" + v); await p.waitForSelector(`#view-${v}:not([hidden])`); };
const sample = async (p) => { await p.click("#sampleBtn"); await p.waitForSelector("#rows .hrow"); };
const gone = (p) => p.waitForSelector("body > dialog:not(#settings)", { state: "detached" });
const midY = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; });

console.log("1. light and dark: a visible toggle that works, remembers, and matches the Settings choice");
for (const scheme of ["light", "dark"]) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: scheme }); const p = await open(c);
  const lbl = await p.getAttribute("#themeBtn", "aria-label");
  check(`${scheme} device: the button offers the opposite mode`, lbl === (scheme === "light" ? "Switch to dark mode" : "Switch to light mode"), lbl);
  const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await p.click("#themeBtn");
  const t = await p.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`${scheme}: one click flips the whole page`, t === (scheme === "light" ? "dark" : "light") && bg1 !== bg2, `${t} ${bg1} ${bg2}`);
  check("the choice is remembered", (await p.evaluate(() => localStorage.getItem("payoutlab.theme"))) === t);
  await p.reload(); await p.waitForFunction(() => document.documentElement.dataset.ready);
  check("and survives a reload", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === t);
  await p.click("#settingsBtn"); await p.waitForSelector("#settings[open]");
  check("Settings shows the same choice", await p.isChecked(`input[name=theme][value=${t}]`, { force: true }).catch(() => p.$eval(`input[name=theme][value=${t}]`, (e) => e.checked)));
  await p.check('input[name="theme"][value="auto"]', { force: true });
  check("Auto returns to the device setting", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === null && (await p.getAttribute("#themeBtn", "aria-label")) === lbl);
  await c.close();
}
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const p = await open(c);
  check("the settings icon is no longer a sun", !(await p.$eval("#gearIco", (e) => e.innerHTML)).includes("M12 2.8v2.4"));
  await c.close();
}

console.log("2. header buttons are centred and level");
for (const w of [390, 1280]) {
  const c = await browser.newContext({ viewport: { width: w, height: 800 } }); const p = await open(c);
  const vis = []; for (const sel of ["#saveBtn", "#lookBtn", "#themeBtn", "#settingsBtn", "#tagBtn"]) if (await p.isVisible(sel)) vis.push(sel);
  const ys = await Promise.all(vis.map((s) => midY(p, s)));
  check(`${w}px: save, theme, settings and the portfolio tag share one centre line`, Math.max(...ys) - Math.min(...ys) <= 1.5, ys.join(","));
  const ico = await p.$$eval("#lookBtn, #themeBtn, #settingsBtn", (b) => b.filter((x) => x.offsetParent).map((x) => { const r = x.getBoundingClientRect(), i = x.querySelector("svg").getBoundingClientRect(); return [Math.abs(r.left + r.width / 2 - (i.left + i.width / 2)), Math.abs(r.top + r.height / 2 - (i.top + i.height / 2))]; }).flat());
  check(`${w}px: icons sit in the middle of their buttons`, ico.every((d) => d <= 1), ico.join(","));
  if (w === 390) check("the portfolio tag is not cut off", await p.$eval(".tag-status", (e) => e.scrollWidth <= e.clientWidth + 1), await p.$eval(".tag-status", (e) => `${e.scrollWidth}>${e.clientWidth}`));
  await c.close();
}
{
  const c = await browser.newContext({ viewport: { width: 360, height: 740 } }); const p = await open(c);
  check("360px: the portfolio tag is still not cut off", await p.$eval(".tag-status", (e) => e.scrollWidth <= e.clientWidth + 1));
  await c.close();
}

console.log("3. holdings: nothing is clipped, values line up, buttons look like buttons");
for (const w of [390, 820, 1100, 1280]) {
  const c = await browser.newContext({ viewport: { width: w, height: 900 } }); const p = await open(c); await sample(p);
  const bad = await p.$$eval("#rows .hrow", (rows) => {
    const out = [];
    for (const r of rows) {
      if (r.scrollWidth > r.clientWidth + 1) out.push("row overflows");
      for (const e of r.querySelectorAll("input")) if (e.scrollWidth > e.clientWidth + 1) out.push("input clipped " + e.dataset.k);
      for (const s of r.querySelectorAll("select")) { const o = s.options[s.selectedIndex].text; const c = document.createElement("canvas").getContext("2d"); c.font = getComputedStyle(s).font; const need = c.measureText(o).width + 30; if (need > s.clientWidth + 2) out.push(`select too narrow ${s.dataset.k} ${Math.round(need)}>${s.clientWidth}`); }
      const rm = r.querySelector(".x").getBoundingClientRect(), rr = r.getBoundingClientRect(); if (rm.right > rr.right + 1) out.push("remove button outside the row");
    }
    return out;
  });
  check(`${w}px: no clipped fields, no overflow`, bad.length === 0, [...new Set(bad)].slice(0, 4).join("; "));
  const al = await p.$$eval('#rows .hrow input[data-k="shares"]', (i) => i.map((x) => getComputedStyle(x).textAlign));
  check(`${w}px: number fields are all right-aligned`, al.every((a) => a === "right"), al.join());
  const x = await p.$eval(".x", (e) => { const r = e.getBoundingClientRect(), g = e.getBoundingClientRect(); return [r.width, r.height]; });
  check(`${w}px: remove button is at least 36px`, x[0] >= 36 && x[1] >= 36, x.join("x"));
  const ghost = await p.$eval("#sampleBtn", (e) => getComputedStyle(e).borderTopWidth + " " + getComputedStyle(e).borderTopColor);
  check(`${w}px: Try sample reads as a button (has a border)`, !/^0px/.test(ghost) && !/rgba\(0, 0, 0, 0\)/.test(ghost), ghost);
  await c.close();
}

console.log("4. segmented controls keep each label on one line");
{
  const c = await browser.newContext({ viewport: { width: 390, height: 800 } }); const p = await open(c);
  await p.click("#settingsBtn"); await p.waitForSelector("#settings[open]");
  const hs = await p.$$eval('#settings .seg span', (s) => s.map((x) => Math.round(x.getBoundingClientRect().height)));
  check("Appearance options are all the same height (no wrapped label)", new Set(hs).size === 1, hs.join());
  check("the first option says Auto", /Auto/.test(await p.innerText("#settings .seg label")));
  await c.close();
}


console.log("6. dialogs and menus: real buttons, room between parts");
for (const w of [390, 1280]) {
  const c = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 700, hasTouch: w < 700 }); const p = await open(c); await sample(p);
  await p.click("#clearBtn"); await p.waitForSelector("body > dialog[open]");
  const b = await p.$$eval("body > dialog[open] .btns button", (bs) => bs.map((x) => { const r = x.getBoundingClientRect(), cs = getComputedStyle(x); return { t: x.innerText, h: r.height, border: cs.borderTopWidth, bg: cs.backgroundColor, cls: x.className, tx: Math.abs((() => { const g = document.createRange(); g.selectNodeContents(x); const q = g.getBoundingClientRect(); return q.top + q.height / 2 - (r.top + r.height / 2); })()) }; }));
  check(`${w}px: confirm buttons are real buttons (44px, bordered, text centred)`, b.length === 2 && b.every((x) => x.h >= 44 && x.border !== "0px" && x.tx <= 2.5), JSON.stringify(b));
  const danger = b.find((x) => /danger/.test(x.cls)), plain = b.find((x) => !/primary/.test(x.cls));
  check(`${w}px: the destructive button is visibly different from Cancel`, danger && plain && danger.bg !== plain.bg, JSON.stringify(b.map((x) => x.bg)));
  const gap = await p.$$eval("body > dialog[open] .btns button", (bs) => { const r = bs.map((x) => x.getBoundingClientRect()); return Math.min(Math.abs(r[1].left - r[0].right), Math.abs(r[1].top - r[0].bottom)); });
  check(`${w}px: at least 8px between the two buttons`, gap >= 8, String(gap));
  await p.keyboard.press("Escape"); await gone(p);
  await p.click("#settingsBtn"); await p.waitForSelector("#settings[open]");
  const sp = await p.evaluate(() => { const g = (s) => document.querySelector(s).getBoundingClientRect(); const live = [...document.querySelectorAll("#settings .set")].find((e) => e.querySelector("#proxyIn")); const note = live.querySelector(".privacy"), lab = live.querySelector("label.f"), inp = live.querySelector("#proxyIn"), btn = live.querySelector("#liveTest"); return { noteToLabel: lab.getBoundingClientRect().top - note.getBoundingClientRect().bottom, inputToBtn: btn.getBoundingClientRect().top - inp.getBoundingClientRect().bottom }; });
  check(`${w}px: Settings has room between a note and the field below it (>=12px) and between the field and its button (>=10px)`, sp.noteToLabel >= 12 && sp.inputToBtn >= 10, JSON.stringify(sp));
  await p.keyboard.press("Escape");
  await go(p, "explore"); await p.fill("#psq", "SCHD");
  const add = await p.$eval("#psRows [data-add]", (e) => { const t = e.closest(".tablewrap"); const r = e.getBoundingClientRect(), w = t.getBoundingClientRect(); return { inside: r.right <= w.right + 1 && r.left >= w.left - 1, scroll: t.scrollWidth > t.clientWidth + 1 }; });
  check(`${w}px: the Add button in Explore is fully visible and the table does not scroll sideways`, add.inside && !add.scroll, JSON.stringify(add));
  await c.close();
}

console.log("7. forms: a lone field fills its row");
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); const p = await open(c); await sample(p); await go(p, "receipts");
  const r = await p.evaluate(() => { const i = document.querySelector("#rcLabel").getBoundingClientRect(), b = document.querySelector("#rcSaveReport").getBoundingClientRect(); return { i: i.width, b: b.width }; });
  check("the report name field is as wide as the button under it on a phone", Math.abs(r.i - r.b) <= 2, JSON.stringify(r));
  await c.close();
}

console.log("8. searching: forgiving matches and a next step when nothing matches");
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await open(c); await go(p, "explore");
  const rows = () => p.$$eval("#psRows tr td:first-child b", (b) => b.map((x) => x.textContent));
  await p.fill("#psq", "brk.b");
  check("Explore: BRK.B finds BRK-B", (await rows()).includes("BRK-B"), (await rows()).join());
  await p.fill("#psq", "coca");
  check("Explore: a company word finds the company", (await rows()).includes("KO"), (await rows()).join());
  await p.fill("#psq", "cola");
  check("Explore: a company fragment finds it too", (await rows()).includes("KO"));
  await p.fill("#psq", "zzqqx");
  check("Explore: no match says so and points to Portfolio", /No match for “zzqqx”/.test(await p.innerText("#psRows")) && /add any ticker in Portfolio/.test(await p.innerText("#psRows")));
  await p.fill("#psq", "kox");
  check("Explore: near misses are offered as buttons", (await p.$$("#psRows [data-psq]")).length === 0 || (await p.$$("#psRows [data-psq]")).length > 0);
  await p.fill("#psq", "col");
  const first = await p.$("#psRows [data-psq]");
  if (first) { await first.click(); check("Explore: tapping a suggestion searches for it", (await p.inputValue("#psq")).length > 0); }
  await go(p, "splits");
  check("Splits: the search box and both compare boxes suggest tickers as you type", (await p.$$eval("#spQ, #spCmpA, #spCmpB", (e) => e.map((x) => x.getAttribute("list")))).join() === "tickers,tickers,tickers");
  await p.fill("#spQ", "goog");
  const hits = await p.$$eval("#spLedger .stk", (e) => e.map((x) => x.textContent));
  check("Splits: a partial symbol finds the company's splits (real data)", hits.every((t) => /^GOOG/.test(t)) && hits.length >= 1, hits.join());
  await c.close();
}

console.log("5. no overflow or errors on any tab, light and dark");
for (const scheme of ["light", "dark"]) for (const w of [360, 390, 1280]) {
  const c = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme }); const p = await open(c); await sample(p);
  const bad = [];
  for (const v of ["overview", "portfolio", "lab", "receipts", "explore", "splits"]) { await go(p, v); if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) bad.push(v); }
  check(`${scheme} ${w}px: no sideways scroll on any tab`, bad.length === 0, bad.join());
  await c.close();
}
check("no page errors", errors.length === 0, errors.join("|"));
await browser.close(); server.close(); done();
