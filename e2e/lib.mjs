// Shared helpers for the browser checks. Run with: node e2e/<file>.mjs  (needs Playwright + Chromium; see README)
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require("playwright"); } catch { /* fall through */ }
  const g = execSync("npm root -g").toString().trim();
  return require(path.join(g, "playwright"));
}
export const { chromium } = loadPlaywright();

export function serve(root, port = 0) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

export async function launch() {
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  return chromium.launch(exe ? { executablePath: exe } : {});
}

let failures = 0;
export function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${detail}`); }
}
export function done() { console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed"); process.exit(failures ? 1 : 0); }
