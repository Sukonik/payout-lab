# V4 · Splits: release notes

**Released 2026-10-14 · release commit [`ca5c417`](https://github.com/Sukonik/payout-lab/commit/ca5c417ce6875636d1b503d468ebc74c17b5b0ee) · deployed by [Pages run 38645364791](https://github.com/Sukonik/payout-lab/actions/runs/38645364791) (success).** Live at the main address and preserved at `/v4/`.

**Scope** ([#32](https://github.com/Sukonik/payout-lab/issues/32)): a Splits tab on the same ticker table as dividends, forward splits first, reverse selectable, split history formatted by day, month and year, announced splits, compare and what-if. Recurring cost stays $0; nothing is uploaded; no packet change.

## What shipped

| PR | Result |
|---|---|
| [#33](https://github.com/Sukonik/payout-lab/pull/33) | `splits.json` (history and hand-kept announced list), pure split logic and validation, Tiingo-derived refresh script and weekday workflow |
| [#34](https://github.com/Sukonik/payout-lab/pull/34) | Sixth tab: ledger with day/month/year blocks and test-tube split pictures, forward/reverse/both, announced list with source and status, compare, what-if, your holdings |

Details and data format: [`splits.md`](splits.md).

## Verification (automated, Chromium)

| Check | Result |
|---|---|
| Unit tests (`npm test`) | 118 passing (15 new for splits) |
| `e2e/splits.mjs` | new: deep link and six tabs, filters, date blocks, announced list safety, compare, what-if, holdings, 320px layout, missing file, no external requests |
| Other suites | packets, workspace (now six tabs), refresh, import, return, hardening, receipts, links, qr, regression-v1, release all pass |

A real bug was found and fixed on the way: on phones the bottom bar hid whenever a radio button had focus.

## Known limits

- **Announced splits are hand-kept and the list is empty today.** I could not find a verifiable announced forward split after the release date and did not invent one. Automated discovery (SEC 8-K filings) is a possible follow-up. Calendars cannot predict who will announce next.
- **Seeded history**: GOOGL, NFLX, ORLY and LCID are cross-checked. AAPL, NVDA, TSLA, AMZN, AVGO, CMG, WMT and SMCI are from the public record and are shown as "Not yet cross-checked" until the refresh covers them. Coverage grows by 45 tickers per weekday run; only seeded tickers have history until then, and the tab says "only tickers already checked are covered".
- **The split refresh has not run live.** It needs the Tiingo token and outbound access that the build environment does not have; it is tested on fixtures. The first scheduled run is the real test. Price before/after and "move since" stay blank until it runs.
- Not verified on a physical iPhone, Safari or Firefox. No git tags (denied from the automation). Optional unlock keys and passkeys (#10) and Collections (#1) are still not done.
- The live GitHub Pages address cannot be opened from the build environment; verification is through the deploy workflow and the locally built, tested artifact.
