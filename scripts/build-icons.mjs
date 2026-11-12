// Builds assets/logo/<variant>/ from the Payout Lab Atom 2.0 logo pack (SVG masters) with Chromium, so every size is rendered
// the same way. Usage: node scripts/build-icons.mjs <extracted pack folder>   (needs Playwright's Chromium, as in e2e/lib.mjs)
// Per variant: the SVG, favicon 16 and 32, icon 192 and 512 (transparent), and a 180px apple-touch icon on a solid tile
// (iOS fills transparency with black). The sixth variant, sky-gold, is made from the forest-gold master with new colours.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { launch } from "../e2e/lib.mjs";

const pack = path.resolve(process.argv[2] ?? "");
const root = path.resolve(new URL("..", import.meta.url).pathname);
const VARIANTS = {
  "forest-gold": { tile: "#FBF6E9" }, "ion-gold": { tile: "#06261C" }, "mint-ion": { tile: "#0A2A21" },
  black: { tile: "#FFFFFF" }, white: { tile: "#07583F" }, "sky-gold": { tile: "#071B33", ring: "#1E90FF" },
};
const svgOf = (slug) => {
  if (slug === "sky-gold") return fs.readFileSync(path.join(pack, "forest-gold", "payout-lab-atom-forest-gold.svg"), "utf8").replace(/#07583F/gi, VARIANTS[slug].ring);
  return fs.readFileSync(path.join(pack, slug, `payout-lab-atom-${slug}.svg`), "utf8");
};

const browser = await launch();
const page = await browser.newPage();
async function png(svg, px, file, bg = null, mark = 1) {
  const inner = `<div style="width:${px}px;height:${px}px;display:grid;place-items:center;background:${bg ?? "transparent"}"><div style="width:${px * mark}px;height:${px * mark}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></div>`;
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${inner}`);
  fs.writeFileSync(file, await page.screenshot({ omitBackground: !bg, clip: { x: 0, y: 0, width: px, height: px } }));
}
for (const [slug, v] of Object.entries(VARIANTS)) {
  const dir = path.join(root, "assets", "logo", slug); fs.mkdirSync(dir, { recursive: true });
  const svg = svgOf(slug);
  fs.writeFileSync(path.join(dir, `payout-lab-atom-${slug}.svg`), svg);
  await png(svg, 16, path.join(dir, "favicon-16.png")); await png(svg, 32, path.join(dir, "favicon-32.png"));
  await png(svg, 192, path.join(dir, "icon-192.png")); await png(svg, 512, path.join(dir, "icon-512.png"));
  await png(svg, 180, path.join(dir, "apple-touch-icon.png"), v.tile, 0.72);
}
await browser.close();
const f = path.join(root, "assets", "logo", "forest-gold");
fs.copyFileSync(path.join(f, "payout-lab-atom-forest-gold.svg"), path.join(root, "favicon.svg"));
const tmp = fs.mkdtempSync("/tmp/ico-"); // a multi-size .ico for browsers that still ask for /favicon.ico
const sizes = [16, 32, 48]; const b2 = await launch(); const p2 = await b2.newPage();
for (const s of sizes) { const svg = svgOf("forest-gold").replace("<svg ", '<svg width="100%" height="100%" '); await p2.setViewportSize({ width: s, height: s }); await p2.setContent(`<style>html,body{margin:0;background:transparent}</style><div style="width:${s}px;height:${s}px">${svg}</div>`); fs.writeFileSync(path.join(tmp, `${s}.png`), await p2.screenshot({ omitBackground: true })); }
await b2.close();
execFileSync("convert", [...sizes.map((s) => path.join(tmp, `${s}.png`)), path.join(root, "favicon.ico")]);
console.log("built", Object.keys(VARIANTS).join(", "));
