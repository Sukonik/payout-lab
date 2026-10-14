import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { afterSplit, compareTickers, cumulativeFactorSince, dateParts, daysBetween, filterLedger, holdingsWithSplits, kindOf, ledger, moveSince, priceAfter, ratioFromFactor, ratioLabel, sanitizeSplit, sanitizeSplitsFile, sanitizeUpcoming, splitsFromPrices, upcomingView, yearGroups, loadSplits } from "../js/core/splits.js";
import { mergeSplits } from "../scripts/update-splits.mjs";

const seed = JSON.parse(fs.readFileSync(new URL("../splits.json", import.meta.url), "utf8"));
const file = sanitizeSplitsFile(seed);

test("the shipped splits.json passes its own validation, entry for entry", () => {
  assert.ok(file);
  const rawCount = Object.values(seed.tickers).reduce((n, v) => n + v.s.length, 0);
  assert.equal(Object.values(file.tickers).reduce((n, v) => n + v.s.length, 0), rawCount, "nothing was dropped");
  assert.ok(file.tickers.GOOGL.s[0].a === 20 && file.tickers.LCID.s[0].b === 10);
});

test("forward and reverse are told apart, and labelled the way people say them", () => {
  assert.equal(kindOf(20, 1), "forward"); assert.equal(kindOf(1, 10), "reverse"); assert.equal(kindOf(3, 3), "none");
  assert.equal(ratioLabel({ a: 3, b: 2 }), "3-for-2"); assert.equal(ratioLabel({ a: 1, b: 10 }), "1-for-10");
});

test("what a split does: shares multiply, price divides, value is unchanged", () => {
  const g = { a: 20, b: 1 };
  assert.equal(afterSplit(5, g), 100); assert.equal(priceAfter(2000, g), 100);
  assert.equal(afterSplit(5, g) * priceAfter(2000, g), 5 * 2000);
  const r = { a: 1, b: 10 }; assert.equal(afterSplit(100, r), 10); assert.equal(priceAfter(2, r), 20);
  assert.equal(afterSplit(15, { a: 3, b: 2 }), 22.5);
});

test("dates split into day, month and year without time-zone drift", () => {
  assert.deepEqual(dateParts("2022-07-18"), { day: "18", month: "JUL", year: "2022", iso: "2022-07-18" });
  assert.equal(dateParts("2024-02-29").day, "29"); assert.equal(dateParts("2023-02-29"), null); assert.equal(dateParts("junk"), null);
  assert.equal(daysBetween("2026-10-14", "2026-10-21"), 7); assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
});

test("ratios are recovered from the factors a price feed reports", () => {
  assert.deepEqual(ratioFromFactor(20), { a: 20, b: 1 }); assert.deepEqual(ratioFromFactor(1.5), { a: 3, b: 2 });
  assert.deepEqual(ratioFromFactor(0.1), { a: 1, b: 10 }); assert.deepEqual(ratioFromFactor(0.2), { a: 1, b: 5 });
  assert.deepEqual(ratioFromFactor(4), { a: 4, b: 1 }); assert.equal(ratioFromFactor(1), null); assert.equal(ratioFromFactor(0), null);
  assert.equal(ratioFromFactor(1.37123), null, "an odd factor is refused rather than guessed");
});

test("splits are derived from daily rows with the price before and after", () => {
  const rows = [
    { date: "2025-06-06T00:00:00+00:00", close: 1375.65, splitFactor: 1 },
    { date: "2025-06-09T00:00:00+00:00", close: 1380, splitFactor: 1 },
    { date: "2025-06-10T00:00:00+00:00", close: 92.1, splitFactor: 15 },
    { date: "2025-06-11T00:00:00+00:00", close: 93, splitFactor: 1 },
    { date: "2025-09-02T00:00:00+00:00", close: 17, splitFactor: 0.1 },
    { date: "2025-09-03T00:00:00+00:00", close: 17, splitFactor: 1.37123 },
  ];
  const s = splitsFromPrices(rows);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { d: "2025-06-10", a: 15, b: 1, src: "Tiingo", ver: 1, pre: 1380, post: 92.1 });
  assert.equal(s[1].a, 1); assert.equal(s[1].b, 10);
});

test("move since a split accounts for later splits so prices are on the same footing", () => {
  const list = [{ d: "2020-01-01", a: 2, b: 1, post: 100 }, { d: "2022-01-01", a: 4, b: 1, post: 60 }];
  // after the first split the stock was 100; one 4-for-1 later that is 25 in today's terms. Now 50 is +100%.
  assert.ok(Math.abs(moveSince(list, list[0], 50) - 1) < 1e-9);
  assert.ok(Math.abs(moveSince(list, list[1], 66) - 0.1) < 1e-9);
  assert.equal(moveSince(list, { d: "2023-01-01", a: 2, b: 1 }, 50), null, "no price at the split: no move claimed");
  assert.equal(cumulativeFactorSince(list, "2020-01-01"), 8); assert.equal(cumulativeFactorSince(list, "2021-01-01"), 4);
});

test("hostile or broken entries are refused", () => {
  for (const bad of [null, {}, { d: "2022-02-30", a: 2, b: 1 }, { d: "2022-01-01", a: 2, b: 2 }, { d: "2022-01-01", a: 0, b: 1 }, { d: "2022-01-01", a: 2.5, b: 1 }, { d: "2022-01-01", a: 5000, b: 1 }]) assert.equal(sanitizeSplit(bad), null, JSON.stringify(bad));
  const s = sanitizeSplit({ d: "2022-01-01", a: 2, b: 1, src: "<img onerror=x>", pre: -4, post: "9" });
  assert.equal(s.src, "img onerror=x"); assert.ok(!("pre" in s) && !("post" in s));
  assert.equal(sanitizeSplitsFile({ tickers: null }), null);
  const f = sanitizeSplitsFile({ tickers: { "bad ticker!": { s: [] }, ok: { n: "<b>x</b>", s: [{ d: "2020-01-01", a: 2, b: 1 }] } }, upcoming: [{}, 5, null] });
  assert.deepEqual(Object.keys(f.tickers), ["OK"]); assert.equal(f.tickers.OK.n, "bx/b", "markup characters removed"); assert.equal(f.upcoming.length, 0);
});

test("announced splits keep their source, status and link, and unsafe links are dropped", () => {
  const u = sanitizeUpcoming({ t: "abc", n: "Abc Corp", a: 10, b: 1, exDate: "2026-11-20", announced: "2026-10-01", status: "announced", src: "8-K", url: "https://www.sec.gov/Archives/x.htm" });
  assert.equal(u.t, "ABC"); assert.equal(u.status, "announced"); assert.equal(u.url, "https://www.sec.gov/Archives/x.htm");
  assert.equal(sanitizeUpcoming({ t: "ABC", a: 10, b: 1, exDate: "2026-11-20", url: "javascript:alert(1)" }).url, "");
  assert.equal(sanitizeUpcoming({ t: "ABC", a: 10, b: 1, exDate: "2026-11-20", status: "rumoured" }).status, "unverified");
  assert.equal(sanitizeUpcoming({ t: "ABC", a: 10, b: 1, exDate: "soon" }), null);
});

test("upcoming view hides past and cancelled events and filters by kind", () => {
  const f = sanitizeSplitsFile({ tickers: {}, upcoming: [
    { t: "AAA", a: 10, b: 1, exDate: "2026-10-20", status: "announced" }, { t: "BBB", a: 1, b: 8, exDate: "2026-10-25", status: "announced" },
    { t: "CCC", a: 2, b: 1, exDate: "2026-10-01", status: "confirmed" }, { t: "DDD", a: 3, b: 1, exDate: "2026-10-30", status: "cancelled" }] });
  assert.deepEqual(upcomingView(f, "2026-10-14").map((x) => x.t), ["AAA"]);
  assert.deepEqual(upcomingView(f, "2026-10-14", { kind: "all" }).map((x) => x.t), ["AAA", "BBB"]);
  assert.equal(upcomingView(f, "2026-10-14")[0].days, 6);
});

test("the ledger is newest first, filters by kind and search, and groups by year", () => {
  const rows = ledger(file, { GOOGL: { p: 300 } });
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].d >= r.d));
  assert.ok(filterLedger(rows).every((r) => r.kind === "forward") && !filterLedger(rows).some((r) => r.t === "LCID"));
  assert.deepEqual(filterLedger(rows, { kind: "reverse" }).map((r) => r.t), ["LCID"]);
  assert.ok(filterLedger(rows, { kind: "all" }).some((r) => r.t === "LCID"));
  assert.deepEqual(filterLedger(rows, { kind: "all", query: "alpha" }).map((r) => r.t), ["GOOGL"]);
  assert.deepEqual(filterLedger(rows, { kind: "all", since: "2025-01-01" }).map((r) => r.d.slice(0, 4)).filter((y) => y < "2025"), []);
  const years = yearGroups(filterLedger(rows, { kind: "all" })).map((g) => g.year);
  assert.deepEqual(years, [...new Set(years)], "each year appears once");
});

test("your holdings with a split in their history, with the combined factor", () => {
  const h = holdingsWithSplits([{ ticker: "GOOGL", name: "Alphabet", shares: 3 }, { ticker: "NOPE", shares: 1 }, { ticker: "NVDA", shares: 2 }], file);
  assert.deepEqual(h.map((x) => x.ticker), ["GOOGL", "NVDA"]);
  assert.equal(h[0].factor, 20); assert.equal(h[1].factor, 40);
});

test("comparing a forward-split stock with a reverse-split one", () => {
  const [g, l] = compareTickers(file, { GOOGL: { p: 300, n: "Alphabet" } }, "GOOGL", "LCID");
  assert.equal(g.forward, 1); assert.equal(g.reverse, 0); assert.equal(l.reverse, 1); assert.equal(l.forward, 0);
  assert.equal(g.price, 300); assert.equal(l.price, null);
  const [x] = compareTickers(file, {}, "ZZZZ", "AAPL"); assert.equal(x.known, false); assert.equal(x.count, 0);
});

test("refresh keeps older seeded splits and replaces newer ones with the feed's", () => {
  const existing = [{ d: "2005-03-01", a: 2, b: 1, src: "seed", ver: 0 }, { d: "2020-08-31", a: 4, b: 1, src: "seed", ver: 0 }];
  const derived = [{ d: "2020-08-31", a: 4, b: 1, src: "Tiingo", ver: 1, post: 129 }];
  const m = mergeSplits(existing, derived, "2010-01-01");
  assert.deepEqual(m.map((s) => [s.d, s.src]), [["2005-03-01", "seed"], ["2020-08-31", "Tiingo"]]);
});

test("loadSplits keeps working when the file is missing or broken", async () => {
  assert.equal((await loadSplits("x", async () => ({ ok: false, status: 404 }))).loaded, false);
  assert.equal((await loadSplits("x", async () => ({ ok: true, json: async () => ({ nope: 1 }) }))).loaded, false);
  assert.equal((await loadSplits("x", async () => ({ ok: true, json: async () => seed }))).loaded, true);
});

import { archiveDone, fromNasdaqRows, parseRatio, parseUsDate, reconcileUpcoming } from "../js/core/splits.js";

test("calendar ratios and dates in the formats seen in Nasdaq-style rows are read, anything else is refused", () => {
  assert.deepEqual(parseRatio("2 : 1"), { a: 2, b: 1 }); assert.deepEqual(parseRatio("1:10"), { a: 1, b: 10 });
  assert.deepEqual(parseRatio("3-for-2"), { a: 3, b: 2 }); assert.deepEqual(parseRatio("10 for 1"), { a: 10, b: 1 }); assert.deepEqual(parseRatio("4 : 2"), { a: 2, b: 1 });
  for (const bad of ["", null, "2", "2 : 2", "0 : 1", "a:b", "5000 : 1", "2 : 1 : 3"]) assert.equal(parseRatio(bad), null, String(bad));
  assert.equal(parseUsDate("10/20/2026"), "2026-10-20"); assert.equal(parseUsDate("1/5/2027"), "2027-01-05"); assert.equal(parseUsDate("2026-10-20"), "2026-10-20");
  assert.equal(parseUsDate("13/40/2026"), null); assert.equal(parseUsDate("N/A"), null);
});

test("calendar rows become announced entries with source, link and as-of date; broken rows are counted and dropped", () => {
  const { rows, dropped } = fromNasdaqRows([
    { symbol: "abc", name: "Abc Corp", ratio: "10 : 1", executionDate: "11/20/2026", announcedDate: "10/01/2026", payableDate: "11/19/2026" },
    { symbol: "XYZ", name: "Xyz", ratio: "1 : 8", executionDate: "11/25/2026" },
    { symbol: "BAD", name: "Bad", ratio: "n/a", executionDate: "11/25/2026" },
    { symbol: "bad ticker", ratio: "2 : 1", executionDate: "11/25/2026" }, null,
  ], "2026-10-14");
  assert.equal(rows.length, 2); assert.equal(dropped, 3);
  assert.deepEqual([rows[0].t, rows[0].a, rows[0].b, rows[0].exDate, rows[0].announced, rows[0].status, rows[0].src], ["ABC", 10, 1, "2026-11-20", "2026-10-01", "announced", "Nasdaq calendar"]);
  assert.ok(rows[0].url.startsWith("https://")); assert.equal(rows[1].b, 8);
  assert.deepEqual(fromNasdaqRows("nope", "2026-10-14"), { rows: [], dropped: 0 });
});

test("reconcile keeps manual entries, refreshes calendar ones and distrusts a vanished one", () => {
  const manual = { t: "MAN", a: 2, b: 1, exDate: "2026-11-01", status: "confirmed", src: "8-K", url: "" };
  const gone = { t: "GONE", a: 3, b: 1, exDate: "2026-11-05", status: "announced", src: "Nasdaq calendar", url: "" };
  const old = { t: "OLD", a: 3, b: 1, exDate: "2026-10-01", status: "announced", src: "Nasdaq calendar", url: "" };
  const stay = { t: "STAY", a: 5, b: 1, exDate: "2026-11-10", status: "announced", src: "Nasdaq calendar", url: "", announced: "2026-10-01" };
  const fresh = [{ ...stay, announced: "2026-10-02" }, { t: "NEW", a: 4, b: 1, exDate: "2026-11-12", status: "announced", src: "Nasdaq calendar", url: "" }, { ...manual, src: "Nasdaq calendar", status: "announced" }];
  const out = reconcileUpcoming([manual, gone, old, stay], fresh, "2026-10-14");
  const by = Object.fromEntries(out.map((u) => [u.t, u]));
  assert.equal(by.MAN.src, "8-K"); assert.equal(by.MAN.status, "confirmed", "a hand-kept entry wins over the calendar");
  assert.equal(by.GONE.status, "unverified", "no longer listed: distrusted, not deleted");
  assert.ok(!by.OLD, "past calendar entries not listed any more are dropped");
  assert.equal(by.STAY.announced, "2026-10-02"); assert.ok(by.NEW);
  assert.deepEqual(out.map((u) => u.t), ["MAN", "GONE", "STAY", "NEW"].sort((x, y) => (by[x].exDate < by[y].exDate ? -1 : 1)));
});

test("a done calendar split becomes unverified history for tracked tickers only, and is not added twice", () => {
  const mk = () => sanitizeSplitsFile({ tickers: { ABC: { n: "Abc", s: [{ d: "2020-01-01", a: 2, b: 1 }] } }, upcoming: [
    { t: "ABC", a: 10, b: 1, exDate: "2026-10-01", status: "announced", src: "Nasdaq calendar" },
    { t: "ZZZ", a: 10, b: 1, exDate: "2026-10-01", status: "announced", src: "Nasdaq calendar" },
    { t: "QQQ", a: 10, b: 1, exDate: "2026-10-01", status: "unverified", src: "Nasdaq calendar" },
    { t: "NEXT", a: 2, b: 1, exDate: "2026-12-01", status: "announced", src: "Nasdaq calendar" }] });
  const f = mk(); const moved = archiveDone(f, "2026-10-14", new Set(["ABC", "QQQ", "NEXT"]));
  assert.deepEqual(moved.map((m) => m.t), ["ABC"]);
  assert.deepEqual(f.tickers.ABC.s.map((s) => [s.d, s.ver]), [["2020-01-01", 0], ["2026-10-01", 0]]);
  assert.deepEqual(f.upcoming.map((u) => u.t).sort(), ["NEXT", "QQQ"], "untracked and unverified ones are not promoted to history");
  const g = mk(); g.tickers.ABC.s.push({ d: "2026-10-01", a: 10, b: 1, src: "Tiingo", ver: 1 });
  assert.equal(archiveDone(g, "2026-10-14", new Set(["ABC"])).length, 0, "already in history: not duplicated");
});
