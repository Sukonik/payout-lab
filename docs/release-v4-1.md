# V4.1 · Fresh data & live lookup: release notes

**Released 2026-11-12 · commit [`182d862`](https://github.com/Sukonik/payout-lab/commit/182d862d91c736d6ca7d27b23952276e4ce16bc7) · deployed by [Pages run 43259012524](https://github.com/Sukonik/payout-lab/actions/runs/43259012524) (success).** Live at the main address. It is a point release on V4, so there is no separate preserved copy.

## Why

A real portfolio showed most holdings **stale** (13-16 days old) and a confusing mix of Tiingo and Yahoo sources. The data file had grown to 1,400+ tickers while each run refreshed only 45 (Tiingo's free limit), and 65% of each run went to adding new tickers.

## What shipped

| PR | Result |
|---|---|
| [#37](https://github.com/Sukonik/payout-lab/pull/37) | UX sweep: light/dark toggle in the header (the settings icon is no longer a sun), header buttons on one centre line, holdings fields and dropdowns that never clip on phones or desktop, ghost buttons that read as buttons, "Auto" instead of "Match device" |
| [#38](https://github.com/Sukonik/payout-lab/pull/38) | Data: Yahoo Finance is the main source for every ticker, the 300 stalest tickers refresh per run (about two days for the full list), new tickers capped at 20% of a run, split history comes from the same request, Tiingo is a fallback; shared parser `js/core/quotes.js` |
| [#39](https://github.com/Sukonik/payout-lab/pull/39) | **Refresh now** (your holdings, live) and **Look up live** (any ticker) in the browser, opt-in and only ticker symbols sent; Settings off switch, own-proxy field and Test button; **main data source / secondary data source** labels by name everywhere a source is shown |
| [#40](https://github.com/Sukonik/payout-lab/pull/40) | Refresh workflows take turns and retry the push: a manual run lost its data because main moved while it ran |

Sources, roles and limits: [`data-sources.md`](data-sources.md). Live lookups and the optional proxy: [`live-lookup.md`](live-lookup.md).

## Verified

- Unit tests 141 passing, 2 skipped (QR decode tests need `jsqr`, installed in CI). New: quote parsing incl. splits, live lookup, source roles, queue policy.
- Browser suites in CI (Chromium): new `ux` and `live`, plus all earlier suites.
- **A real Actions run** of the new pipeline refreshed 296 tickers from Yahoo in about two minutes (4 failures: delisted symbols), added 56 seed tickers and updated 106 split histories; a second run did the same (296, 56 added, 127 split histories). The Nasdaq announced-splits step also ran live and listed 20 announced splits.

## State after the refresh on 2026-11-12

1,533 tickers (860 stocks, 673 ETFs; 884 and 699 with the seed list). 723 refreshed in the last two days; **365 were still older than 7 days** and are shown as stale until the next runs reach them (900 refreshes a day, so about a day and a half for the full list).

## Known limits

- **Live lookup from a browser is untested against the real provider** (the build environment cannot reach it), including whether the provider allows direct browser calls (CORS) and the optional Cloudflare proxy. The app handles a refusal in plain words; use Settings → Test live lookup.
- Yahoo's endpoint is unofficial with no commercial terms. Settle a licensed source before charging for anything.
- Tiingo-labelled records switch to Yahoo as they are refreshed; the review sheet shows the source change.
- Not verified on a physical iPhone, Safari or Firefox. No git tags.
