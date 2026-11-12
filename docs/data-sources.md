# Data sources

One rule keeps this readable: **every ticker's record comes from one source, and says which.** Values from two providers are never mixed inside one ticker. The source and the date it was observed show next to every holding ("Yahoo Finance · Nov 12").

| Data | Source | Key? | Used for | Status |
|---|---|---|---|---|
| Price, dividends, split history | **Yahoo Finance** public chart endpoint (`query1.finance.yahoo.com/v8/finance/chart/<ticker>`) | none | The scheduled refresh of `data.json` and `splits.json` (one request gives all three). The **primary** source for every ticker | Used. Unofficial: no published terms or limits; not licensed for commercial redistribution |
| Same, as a fallback | **Tiingo** daily prices | `TIINGO_TOKEN` repository secret | Only when Yahoo returns nothing for a ticker and the token exists. The ticker is then labelled Tiingo | Optional. The free plan allows about 50 requests an hour and 1,000 a day, so it cannot be the bulk source |
| Announced splits (not yet done) | **Nasdaq splits calendar** (unofficial) | none | `scripts/update-upcoming.mjs`; shown as "Announced · Nasdaq calendar" | Not verified live; see [`splits.md`](splits.md) |
| Confirming an announcement | **SEC EDGAR 8-K** | none (User-Agent) | Not built yet | Proposed |
| Live lookup in the browser | Yahoo chart endpoint, called by your browser | none | Refreshing your holdings or looking up any ticker on demand | See below |

## Why one primary source

Before this, the file mixed Tiingo and Yahoo records (and an update review could show a Tiingo value replaced by a Yahoo one). The cause was capacity, not preference: Tiingo's free limits allow about 45 tickers per run, so with 1,400+ tickers each was refreshed about every two weeks and most of the list showed "stale". Yahoo has no per-hour cap that blocks a few hundred requests, so one source can now keep the whole list inside about two days.

## Freshness

- `data.json` is refreshed three times a day. Each run takes the **300 stalest** tickers, so the full list cycles in about two days. New seed tickers get at most 20% of a run (and at most 60), so adding coverage cannot starve freshness.
- A ticker is shown as **stale** after 7 days.
- A run that refreshes nothing leaves the files untouched and fails visibly; eight failures in a row stop the run early.

## Licensing, honestly

The primary source is unofficial. That is fine for an educational, free, open-source tool and it is why the README warns against charging before the data licence is sorted. If the site is ever monetised, replace the primary source with a licensed feed by changing `providerOrder` in `scripts/update-data.mjs`; the rest of the pipeline does not care which provider answered.
