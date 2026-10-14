# Splits

The **Splits** tab (route `#/splits`) is a research view built on public split data. It explains what a split does and shows what has happened and what has been announced. **It does not predict splits and does not tell you what to buy.** A split changes how many shares you hold and what each costs, not what you own.

## What is on the tab

| Part | What it shows |
|---|---|
| Kind switch | **Forward** (default: more shares, lower price, e.g. Alphabet 20-for-1), **Reverse** (fewer shares, higher price, e.g. Lucid 1-for-10) or **Both** |
| Announced, not yet done | Splits an issuer has announced with a first-day-at-new-count date, a countdown, a status (announced, confirmed, unverified) and a source link |
| Split history | A ledger, newest first, grouped by year. Each event is a **day / month / year** block, the ratio, a test-tube picture (one tube becoming many, or many becoming one, with the same liquid shared out), what 10 shares became, the price per share before and after when known, and the move since |
| Compare two stocks | Side by side counts of forward and reverse splits, latest split, combined share factor and current price (Google vs Lucid is preloaded) |
| What would a split do | Enter shares and a ratio: shares after, price of a $100 share, total value unchanged, and the fractional-share warning for reverse splits |
| Your holdings | Which of your holdings have a split in their history, and the combined factor, so older dividend-per-share figures are read correctly. This reads your portfolio in the browser only; nothing is uploaded |

Reverse splits carry a plain note that companies often do them to keep a listing, so they are a warning sign worth reading about.

## Data

`splits.json` is public data, separate from `data.json` and **never part of a packet** (no packet schema change).

```
tickers.<TICKER> = { n: name, s: [ { d: "YYYY-MM-DD", a, b, src, ver, pre?, post? } ], u: last refreshed }
upcoming = [ { t, n, a, b, exDate, announced?, payDate?, status, src, url?, asOf? } ]
```

- `d` / `exDate` is the first day trading at the new share count. `a`-for-`b` means `a` new shares for every `b` old ones, so 20-for-1 is forward and 1-for-10 is reverse.
- `ver: 1` means cross-checked against a company filing or reputable coverage. `ver: 0` comes from the public record and is shown as **Not yet cross-checked**.
- `pre` and `post` are the raw closing prices before and after, recorded by the refresh. "Move since" puts them on the same footing by dividing out any later splits.
- The page rebuilds every entry from known fields and bounds: bad dates, ratios, links or markup are dropped, and only `https:` links are shown as links.

### History refresh

`scripts/update-splits.mjs` (workflow `update-splits.yml`) runs on weekdays, refreshing the 45 stalest tickers from Tiingo daily prices, where the split factor on a day gives the ratio. A rate limit stops the run and nothing falls back silently. Seeded entries older than 2010 are kept. It runs at a different hour from the dividend refresh so the free hourly limit is not shared. Tested on fixtures; the first scheduled run is the live test.

### Announced splits (hand-kept)

Add an entry to `upcoming` in `splits.json` only when an issuer has announced it, with a `src` and, when you have one, an `https` `url` (a press release or SEC 8-K). Use `status: "unverified"` for a single calendar listing you could not confirm, and `"cancelled"` to withdraw one. Past and cancelled entries are hidden automatically. Update `upcomingAsOf` when you review the list. Automated discovery from SEC filings is a possible follow-up; see [#32](https://github.com/Sukonik/payout-lab/issues/32).

Calendars report splits after announcement. Nothing here can say who will announce one next.
