// Assemble the static site for GitHub Pages: the current app at the root, plus each preserved release under /<path>/.
// A preserved build is the exact web files from that commit (git archive), so it is a real historical site, not a re-skin.
// Usage: node scripts/build-site.mjs <outDir>      Needs full git history (actions/checkout fetch-depth: 0).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const WEB = ["index.html", "data.json", "favicon.svg", "css", "js"];
const out = path.resolve(process.argv[2] || "_site");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const p of WEB) if (existsSync(path.join(root, p))) cpSync(path.join(root, p), path.join(out, p), { recursive: true });

const { releases } = JSON.parse(readFileSync(path.join(root, "releases.json"), "utf8"));
const built = [];
for (const r of releases) {
  if (!/^[0-9a-f]{40}$/.test(r.sha) || !/^[a-z0-9-]+$/.test(r.path)) throw new Error(`Bad release entry: ${JSON.stringify(r)}`);
  const present = WEB.filter((p) => {
    try { execFileSync("git", ["cat-file", "-e", `${r.sha}:${p}`], { cwd: root, stdio: "ignore" }); return true; } catch { return false; }
  });
  if (!present.length) throw new Error(`Commit ${r.sha} has none of the web files; is the history fetched?`);
  const dir = path.join(out, r.path);
  mkdirSync(dir, { recursive: true });
  const tar = execFileSync("git", ["archive", "--format=tar", r.sha, ...present], { cwd: root, maxBuffer: 1 << 28 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  built.push(`${r.version} -> /${r.path}/ (${r.sha.slice(0, 7)}: ${present.join(", ")})`);
}
writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`Built ${out}\n  current -> /\n${built.map((b) => "  " + b).join("\n")}`);
