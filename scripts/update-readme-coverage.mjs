// Rewrites the coverage block in README.md from data.json and tickers-seed.json. Run: node scripts/update-readme-coverage.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { coverage } from "./update-data.mjs";

const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
const README = new URL("../README.md", import.meta.url);
const START = "<!-- coverage:start -->", END = "<!-- coverage:end -->";

export function coverageBlock(data, seed, today) {
  const have = coverage(data.tickers), planned = coverage(data.tickers, seed);
  const waiting = Object.keys(seed).filter((t) => !data.tickers[t]).length;
  return `${START}\n**Coverage on ${today}:** ${have.stocks} stocks and ${have.etfs} ETFs have live data (${Object.keys(data.tickers).length} tickers). ${waiting} more are in \`tickers-seed.json\` waiting for their first data fetch; with them the list reaches ${planned.stocks} stocks and ${planned.etfs} ETFs. Target: at least 500 stocks and 400 ETFs.\n${END}`;
}

export function applyBlock(readme, block) {
  const i = readme.indexOf(START), j = readme.indexOf(END);
  if (i === -1 || j === -1 || j < i) return null;
  return readme.slice(0, i) + block + readme.slice(j + END.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const next = applyBlock(readFileSync(README, "utf8"), coverageBlock(read("data.json"), read("tickers-seed.json").tickers, new Date().toISOString().slice(0, 10)));
  if (!next) { console.error("README.md has no coverage markers"); process.exit(1); }
  writeFileSync(README, next);
  console.log("README coverage block updated");
}
