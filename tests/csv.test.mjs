import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseSchedule, guessMapping, privateColumns, parseRows, consolidate, buildImportPlan, applyImportPlan, holdingsToCsv, neutralize, TEMPLATE_CSV, CSV_LIMITS } from "../js/core/csv.js";
import { newPacket, parsePacketText, serializePacket } from "../js/core/packet.js";
import { setMarket } from "../js/core/market.js";
import { holdingFromMarket } from "../js/core/market.js";

setMarket({ updated: null, source: null, loaded: true, tickers: {
  SCHD: { n: "Schwab US Dividend Equity ETF", p: 32, d: 1.05, s: "Q3", q: true, src: "Tiingo", u: "2026-10-12T22:00:00Z", per: 0.26 },
  "BRK-B": { n: "Berkshire", p: 500, d: 0, s: "Q3", q: true, src: "Tiingo", u: "2026-10-12T22:00:00Z" },
  O: { n: "Realty Income", p: 54, d: 3.2, s: "M", q: false, src: "Yahoo Finance", u: "2026-10-12T22:00:00Z", per: 0.27 },
} });

const load = (text) => { const c = parseCsv(text); assert.equal(c.ok, true, JSON.stringify(c.error)); const m = guessMapping(c.headers); return { c, m, rows: parseRows(c.rows, m) }; };

test("the template imports as documented", () => {
  const { rows, m } = load(TEMPLATE_CSV);
  assert.deepEqual(m, { ticker: 0, shares: 1, name: 2, currency: 3, price: 4, dividend: 5, schedule: 6 });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.errors.length === 0));
  assert.equal(rows[1].shares, 50.5, "fractional shares");
  assert.deepEqual([rows[2].price, rows[2].dividend, rows[2].schedule], [25, 1.2, "Q1"]);
});

test("parser: quoted commas, doubled quotes, embedded newlines, BOM, CRLF, CR-only and blank lines", () => {
  const text = '﻿Symbol,Quantity,Description\r\n\r\nSCHD,"1,234.5","Schwab, ""US"" Dividend\nEquity"\r\n\r\nO,10,Realty\r\n';
  const { c, rows } = load(text);
  assert.deepEqual(c.headers, ["Symbol", "Quantity", "Description"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].shares, 1234.5);
  assert.equal(rows[0].name, 'Schwab, "US" Dividend\nEquity');
  assert.equal(load("Symbol,Quantity\rSCHD,5\rO,6").rows.length, 2);
  assert.equal(load("Symbol,Quantity\nSCHD,5\nO,6").rows.length, 2);
});

test("parser: semicolon and tab delimiters are detected", () => {
  assert.equal(load("Symbol;Quantity\nSCHD;5,5\n").rows[0].shares, 5.5);
  assert.equal(load("Symbol\tQuantity\nSCHD\t7\n").rows[0].shares, 7);
});

test("parser rejects broken, binary, empty and oversized input without throwing", () => {
  assert.equal(parseCsv('Symbol,Quantity\n"SCHD,5').error.code, "bad_quote");
  assert.equal(parseCsv("a,b\u0000c\n1,2").error.code, "binary");
  assert.equal(parseCsv("Symbol,Quantity").error.code, "empty");
  assert.equal(parseCsv("").error.code, "empty");
  assert.equal(parseCsv("x".repeat(CSV_LIMITS.maxChars + 1)).error.code, "too_large");
  assert.equal(parseCsv(null).error.code, "bad_input");
  assert.equal(parseCsv("a,b\n" + "1,2\n".repeat(CSV_LIMITS.maxRows + 5)).error.code, "too_many_rows");
  assert.equal(parseCsv(Array.from({ length: 70 }, (_, i) => "c" + i).join(",") + "\n" + "1,".repeat(69) + "1").error.code, "too_many_columns");
  assert.equal(parseCsv("Symbol,Quantity\nSCHD," + "9".repeat(600)).error.code, "cell_too_long");
});

test("numbers: US and decimal-comma formats, currency signs, rejects junk instead of returning 0", () => {
  const v = (s) => parseNumber(s).value;
  assert.equal(v("1,234.5"), 1234.5); assert.equal(v("$1,000"), 1000); assert.equal(v("12.5"), 12.5); assert.equal(v(".5"), 0.5);
  assert.equal(v("1.234,5"), 1234.5); assert.equal(v("5,5"), 5.5); assert.equal(v("(7)"), -7); assert.equal(v("-3"), -3);
  assert.equal(parseNumber("").empty, true);
  for (const bad of ["abc", "12abc", "NaN", "Infinity", "1e999", "--5", "1,2,3", "0x10"]) assert.ok(parseNumber(bad).error, bad);
});

test("rows: invalid values become actionable errors, never zeros", () => {
  const { rows } = load("Symbol,Quantity,Price,Annual Dividend\nSCHD,abc,,\nO,-5,,\nSCHD,0,,\n,5,,\nBAD TICKER,5,,\n<img>,5,,\nO,5,-1,\nO,5,,xyz\nSPAXX**,3,,\nO,9e999,,\n");
  assert.equal(rows.length, 10);
  assert.ok(rows.every((r) => r.errors.length > 0), JSON.stringify(rows.map((r) => r.errors)));
  assert.match(rows[0].errors[0], /Shares "abc" is not a number/);
  assert.match(rows[1].errors[0], /more than 0/);
  assert.match(rows[4].errors[0], /not a valid ticker/);
  assert.match(rows[8].errors[0], /not a valid ticker/, "identifiers are preserved, not silently cleaned");
});

test("ticker handling: dotted class shares resolve only when the alias exists; other dots are kept", () => {
  const { rows } = load("Symbol,Quantity\nBRK.B,2\nVOD.L,3\nSCHD,1\n");
  assert.equal(rows[0].ticker, "BRK-B"); assert.equal(rows[0].aliasOf, "BRK.B"); assert.match(rows[0].warnings[0], /matched to BRK-B/);
  assert.equal(rows[1].ticker, "VOD.L", "an exchange suffix is preserved");
  assert.equal(rows[2].known, true); assert.equal(rows[1].known, false);
});

test("duplicates in one file are combined deterministically with a warning", () => {
  const { rows } = load("Symbol,Quantity,Price\nSCHD,10,30\nO,5,\nSCHD,2.5,31\nSCHD,1,\n");
  const c = consolidate(rows);
  assert.equal(c.rows.length, 2);
  const s = c.rows.find((r) => r.ticker === "SCHD");
  assert.equal(s.shares, 13.5); assert.equal(s.price, 30, "first value wins");
  assert.ok(s.warnings.some((w) => /appears on rows 1, 3, 4/.test(w)));
  assert.ok(s.warnings.some((w) => /different price/.test(w)));
  assert.ok(!s.warnings.some((w) => /different name/.test(w)), "differing names are not worth a warning");
  assert.equal(c.merged, 2);
});

test("columns that look like account details are never mapped, shown or kept", () => {
  const headers = ["Account Number", "Account Name", "Symbol", "Quantity", "Owner", "Last Price"];
  assert.deepEqual(privateColumns(headers), [0, 1, 4]);
  const m = guessMapping(headers);
  assert.deepEqual(m, { ticker: 2, shares: 3, name: -1, currency: -1, price: 5, dividend: -1, schedule: -1 });
  const csv = "Account Number,Account Name,Symbol,Quantity\n12345678,Jane Q Public,SCHD,5\n";
  const c = parseCsv(csv); const rows = parseRows(c.rows, guessMapping(c.headers));
  const p = newPacket(); const cons = consolidate(rows); const plan = buildImportPlan(p, cons.rows, "set"); applyImportPlan(p, cons.rows, plan);
  const text = serializePacket(p);
  assert.doesNotMatch(text, /12345678|Jane|Public/);
});

test("preamble lines above the header are dropped", () => {
  const c = parseCsv('Positions for account X1234\nGenerated 2026-10-01\n\nSymbol,Quantity\nSCHD,5\n');
  assert.deepEqual(c.headers, ["Symbol", "Quantity"]);
  assert.equal(c.skippedPreamble, 2);
  assert.equal(c.rows.length, 1);
});

test("schedule words map to codes; ambiguous ones are not guessed", () => {
  assert.equal(parseSchedule("Monthly").value, "M"); assert.equal(parseSchedule("q2").value, "Q2"); assert.equal(parseSchedule("Annual").value, "A");
  assert.match(parseSchedule("Quarterly").warning, /does not say which months/);
  assert.match(parseSchedule("weekly").warning, /not recognised/);
  assert.equal(parseSchedule("").empty, true);
});

function planFor(existing, csv, mode) {
  const p = newPacket();
  for (const [t, n] of existing) p.holdings.push(holdingFromMarket(t, n, { n: t, p: 10, d: 1, s: "Q3", q: true, src: "Tiingo", u: "2026-10-12T00:00:00Z" }));
  const { rows } = load(csv);
  const cons = consolidate(rows);
  return { p, cons, plan: buildImportPlan(p, cons.rows, mode) };
}

test("modes: importing a full export does not double shares unless 'add' is chosen", () => {
  const csv = "Symbol,Quantity\nSCHD,100\nO,50\n";
  for (const [mode, expectSchd, expectKeep] of [["set", 100, true], ["replace", 100, false], ["add", 200, true]]) {
    const { p, cons, plan } = planFor([["SCHD", 100], ["KO", 7]], csv, mode);
    applyImportPlan(p, cons.rows, plan);
    assert.equal(p.holdings.find((h) => h.ticker === "SCHD").shares, expectSchd, mode);
    assert.equal(!!p.holdings.find((h) => h.ticker === "KO"), expectKeep, mode);
    assert.equal(p.holdings.find((h) => h.ticker === "O").shares, 50, mode);
  }
  const { plan } = planFor([["SCHD", 100], ["KO", 7]], csv, "replace");
  assert.deepEqual(plan.removed, [{ ticker: "KO", shares: 7 }]);
  assert.equal(plan.counts.same, 1, "SCHD is unchanged in replace mode");
});

test("preview counts match what is applied", () => {
  const { p, cons, plan } = planFor([["SCHD", 100]], "Symbol,Quantity\nSCHD,150\nO,5\nNEW1,3\n", "set");
  assert.deepEqual([plan.counts.new, plan.counts.update, plan.counts.same], [2, 1, 0]);
  assert.equal(plan.total, 3);
  applyImportPlan(p, cons.rows, plan);
  assert.equal(p.holdings.length, 3);
});

test("values from the file are the user's own: provenance csv, manual, never a provider label", () => {
  const { p, cons, plan } = planFor([["SCHD", 10]], "Symbol,Quantity,Price,Annual Dividend,Schedule,Name\nSCHD,10,31.5,1.1,Q2,ignored name\nMYFUND,4,25,1.2,monthly,My Fund\nO,2,,,,\n", "set");
  applyImportPlan(p, cons.rows, plan);
  const f = (t) => p.holdings.find((h) => h.ticker === t).fields;
  assert.deepEqual([f("SCHD").price.v, f("SCHD").price.src, f("SCHD").price.manual, f("SCHD").price.asOf], [31.5, "csv", true, null]);
  assert.deepEqual([f("SCHD").dividend.v, f("SCHD").dividend.basis], [1.1, null]);
  assert.deepEqual([f("SCHD").schedule.v, f("SCHD").schedule.basis], ["Q2", "user"]);
  assert.equal(f("MYFUND").price.src, "csv");
  assert.equal(p.holdings.find((h) => h.ticker === "MYFUND").name, "My Fund");
  assert.equal(p.holdings.find((h) => h.ticker === "SCHD").name, "SCHD", "existing names are kept");
  assert.equal(f("O").price.src, "yahoo", "a known ticker with no values in the file keeps its provider data");
  assert.equal(f("O").price.manual, false);
});

test("an unknown ticker with no values is flagged so the user knows to fill it in", () => {
  const { plan } = planFor([], "Symbol,Quantity\nNOPE,5\nSCHD,1\n", "set");
  assert.equal(plan.counts.unknown, 1);
});

test("imported holdings survive a packet round trip with provenance", () => {
  const { p, cons, plan } = planFor([], "Symbol,Quantity,Price\nMYFUND,4.5,25\nO,2\n", "set");
  applyImportPlan(p, cons.rows, plan);
  const r = parsePacketText(serializePacket(p));
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const my = r.packet.holdings.find((h) => h.ticker === "MYFUND");
  assert.deepEqual([my.shares, my.fields.price.v, my.fields.price.src, my.fields.price.manual], [4.5, 25, "csv", true]);
});

test("a plan that would exceed the holdings limit is flagged", () => {
  const p = newPacket();
  const lines = ["Symbol,Quantity"]; for (let i = 0; i < 501; i++) lines.push(`T${i},1`);
  const { rows } = load(lines.join("\n"));
  assert.equal(buildImportPlan(p, consolidate(rows).rows, "set").tooMany, true);
});

test("CSV export defuses spreadsheet formulas and quotes awkward text", () => {
  for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) assert.equal(neutralize(evil)[0], "'", JSON.stringify(evil));
  assert.equal(neutralize("SCHD"), "SCHD");
  const p = newPacket();
  p.holdings.push({ id: "h_abcd", ticker: "SCHD", name: '=cmd|" /C calc"!A0', shares: 1.5, fields: holdingFromMarket("SCHD", 1, { p: 1, d: 1, s: "Q3", q: true }).fields });
  p.holdings.push({ id: "h_abce", ticker: "O", name: "Realty, Inc", shares: 2, fields: holdingFromMarket("O", 1, { p: 1, d: 1, s: "Q3", q: true }).fields });
  const csv = holdingsToCsv(p);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "ticker,shares,name,currency");
  assert.match(lines[1], /^SCHD,1\.5,"'=cmd\|"" \/C calc""!A0",USD$/);
  assert.equal(lines[2], 'O,2,"Realty, Inc",USD');
  assert.equal(csv.split("\r\n").slice(1).every((l) => !/^[=+\-@]/.test(l)), true);
  // and it round-trips through our own parser
  const back = load(csv);
  assert.equal(back.rows.length, 2);
  assert.equal(back.rows[1].name, "Realty, Inc");
});

test("names defused for export come back clean on re-import", () => {
  const p = newPacket();
  p.holdings.push({ id: "h_abcd", ticker: "ZZZ1", name: "=Special Fund", shares: 2, fields: holdingFromMarket("ZZZ1", 1, { p: 1, d: 1, s: "Q3", q: true }).fields });
  const csv = holdingsToCsv(p);
  assert.match(csv, /'=Special Fund/);
  const { rows } = load(csv);
  assert.equal(rows[0].name, "=Special Fund");
  const cons = consolidate(rows);
  const q = newPacket(); applyImportPlan(q, cons.rows, buildImportPlan(q, cons.rows, "set"));
  assert.equal(q.holdings[0].name, "=Special Fund", "no apostrophe accumulates");
});

test("lots that add up past the share limit are rejected, not clamped silently", () => {
  const { rows } = load("Symbol,Quantity\nBIG,600000000000\nBIG,600000000000\nOK,5\n");
  const c = consolidate(rows);
  assert.deepEqual(c.rows.map((r) => r.ticker), ["OK"]);
  assert.deepEqual(c.overLimit, ["BIG"]);
  assert.equal(c.invalid, 1);
  const p = newPacket();
  const plan = buildImportPlan(p, c.rows, "set");
  applyImportPlan(p, c.rows, plan);
  assert.equal(parsePacketText(serializePacket(p)).ok, true);
});

test("'add' never produces more shares than a packet can hold", () => {
  const p = newPacket();
  p.holdings.push(holdingFromMarket("SCHD", 9e11, { p: 1, d: 1, s: "Q3", q: true }));
  const { rows } = load("Symbol,Quantity\nSCHD,9e11\n");
  const c = consolidate(rows);
  const plan = buildImportPlan(p, c.rows, "add");
  assert.equal(plan.items[0].to, 1e12);
  applyImportPlan(p, c.rows, plan);
  assert.equal(p.holdings[0].shares, 1e12);
});
