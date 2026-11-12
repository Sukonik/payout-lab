import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_ICON, DEFAULT_LOGO, ICON_FILES, LOOKS, contrast, headerLogo, lookById, lookVars, normalizeLook } from "../js/core/looks.js";

const BASE = { light: { "--card": "#ffffff", "--ink": "#0b1f17", "--muted": "#4a6256" }, dark: { "--card": "#0e1d16", "--ink": "#e8f5ee", "--muted": "#9bb8a8" } };
const exists = (p) => fs.existsSync(new URL("../" + p, import.meta.url));

test("there are six looks, each with its own icon files", () => {
  assert.equal(LOOKS.length, 6);
  assert.deepEqual(LOOKS.map((l) => l.id), ["forest-gold", "ion-gold", "mint-ion", "black", "white", "sky-gold"]);
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, 6);
  for (const l of [...LOOKS.map((x) => x.id), DEFAULT_ICON, ...Object.values(DEFAULT_LOGO)]) for (const [k, p] of Object.entries(ICON_FILES(l))) assert.ok(exists(p), `${l} ${k}: ${p}`);
});

test("the default icon is forest-gold and the header mark is ion-gold on light, mint-ion on dark", () => {
  assert.equal(DEFAULT_ICON, "forest-gold"); assert.deepEqual(DEFAULT_LOGO, { light: "ion-gold", dark: "mint-ion" });
  assert.equal(headerLogo(null, "light"), "ion-gold"); assert.equal(headerLogo(null, "dark"), "mint-ion"); assert.equal(headerLogo("nope", "dark"), "mint-ion");
});

test("a look's own mark is used only where it can be seen; otherwise the light/dark default", () => {
  assert.equal(headerLogo("black", "light"), "black"); assert.equal(headerLogo("black", "dark"), "mint-ion", "black on a dark page would vanish");
  assert.equal(headerLogo("white", "dark"), "white"); assert.equal(headerLogo("white", "light"), "ion-gold", "white on a light page would vanish");
  assert.equal(headerLogo("mint-ion", "light"), "ion-gold"); assert.equal(headerLogo("mint-ion", "dark"), "mint-ion");
  assert.equal(headerLogo("forest-gold", "dark"), "mint-ion"); assert.equal(headerLogo("forest-gold", "light"), "forest-gold");
  assert.equal(headerLogo("sky-gold", "light"), "sky-gold"); assert.equal(headerLogo("sky-gold", "dark"), "sky-gold");
});

test("every look sets the same variables in light and dark, so switching never leaves a stale colour", () => {
  for (const l of LOOKS) {
    const a = Object.keys(l.light).filter((k) => k !== "--card").sort(), b = Object.keys(l.dark).filter((k) => k !== "--card").sort();
    assert.deepEqual(a, b, l.id);
    for (const v of [...Object.values(l.light), ...Object.values(l.dark)]) assert.match(v, /^(#[0-9a-f]{6}|rgba\(\d+,\d+,\d+,[.\d]+\))$/i, `${l.id} ${v}`);
  }
});

test("text stays readable in every look, in light and dark (WCAG AA)", () => {
  for (const l of LOOKS) for (const m of ["light", "dark"]) {
    const v = { ...BASE[m], ...l[m] }, at = (a, b) => contrast(v[a], v[b]);
    assert.ok(at("--accent-ink", "--accent") >= 4.5, `${l.id} ${m}: button text ${at("--accent-ink", "--accent").toFixed(2)}`);
    assert.ok(at("--accent-strong", "--card") >= 4.5, `${l.id} ${m}: accent text on cards`);
    assert.ok(at("--accent-strong", "--accent-soft") >= 4.5, `${l.id} ${m}: selected tab text`);
    assert.ok(at("--ink", "--bg") >= 7, `${l.id} ${m}: body text`);
    for (const bg of ["--bg", "--bg2", "--glass", "--card"]) assert.ok(at("--muted", bg) >= 4.5, `${l.id} ${m}: muted text on ${bg} ${at("--muted", bg).toFixed(2)}`);
    assert.ok(at("--accent", "--card") >= 3, `${l.id} ${m}: accent as a UI colour`);
  }
});

test("looks are found by id, junk is ignored", () => {
  assert.equal(lookById("sky-gold").name, "Sky + Gold"); assert.equal(lookById("x"), null); assert.equal(normalizeLook("<script>"), null); assert.equal(normalizeLook("white"), "white");
  assert.deepEqual(lookVars(null, "dark"), {}); assert.ok(lookVars("black", "dark")["--card"]);
});
