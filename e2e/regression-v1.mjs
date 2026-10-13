// Compares every calculator panel of the current build against the preserved V1 baseline on identical inputs.
// Usage: node e2e/regression-v1.mjs [baselineCommit]   (default 475287d, the verified V1 deployment)
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, serve, check, done } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const commit = process.argv[2] || "475287d";
const old = fs.mkdtempSync(path.join(os.tmpdir(), "payout-v1-"));
fs.writeFileSync(path.join(old, "index.html"), execSync(`git show ${commit}:index.html`, { cwd: root, maxBuffer: 1e8 }));
fs.copyFileSync(path.join(root, "data.json"), path.join(old, "data.json")); // same market data for both builds

const A = await serve(old), B = await serve(root);
const browser = await launch();
const panels = ["#tVal", "#tInc", "#tMo", "#tYld", "#cal", "#calNote", "#concBig", "#conc", "#concNote", "#cutOut", "#goalOut", "#addOut", "#taxOut"];
const read = async (p) => Object.fromEntries(await Promise.all(panels.map(async (s) => [s, (await p.$eval(s, (e) => e.innerHTML)).replace(/\s+/g, " ")])));

async function drive(base, label) {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto(base); await p.waitForTimeout(500);
  await p.click("#sampleBtn");
  const out = { sample: await read(p) };
  // exercise the scenario controls identically
  await p.fill('[data-s="target"]', "3200"); await p.fill('[data-s="contrib"]', "750");
  await p.$eval('[data-s="growth"]', (e) => { e.value = 9; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await p.$eval('[data-s="cutPct"]', (e) => { e.value = 80; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await p.selectOption("#cutT", "O"); await p.selectOption("#addT", "KO"); await p.fill('[data-s="addAmt"]', "25000");
  await p.fill('[data-s="qRate"]', "20"); await p.fill('[data-s="oRate"]', "32");
  await p.uncheck('[data-s="reinvest"]');
  out.scenarios = await read(p);
  await p.fill('[data-i="1"][data-k="shares"]', "123.456"); await p.fill('[data-i="2"][data-k="div"]', "5.5"); await p.selectOption('[data-i="3"][data-k="s"]', "A"); await p.selectOption('[data-i="4"][data-k="q"]', "0");
  out.edited = await read(p);
  await ctx.close();
  return out;
}
const [oldR, newR] = [await drive(A.url, "v1"), await drive(B.url, "current")];
for (const stage of Object.keys(oldR)) for (const s of panels) check(`${stage} ${s}`, oldR[stage][s] === newR[stage][s], `\n   v1:  ${oldR[stage][s].slice(0, 200)}\n   now: ${newR[stage][s].slice(0, 200)}`);
await browser.close(); A.server.close(); B.server.close(); done();
