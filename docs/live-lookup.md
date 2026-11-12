# Live lookups

The site ships a daily price file, refreshed three times a day ([`data-sources.md`](data-sources.md)). **Refresh now** and **Look up live** let you go past it:

- **Refresh now** (Portfolio → Market data) asks the quote provider, from your browser, for the tickers you hold (up to 40), then opens the usual review sheet. Nothing changes until you choose what to apply, and values you typed yourself are protected exactly as before.
- **Look up live** (Explore) appears when you search a ticker that is not in the daily file (SNDK, a new listing). It fetches that ticker, shows it, and lets you add it.

## What is sent

Only ticker symbols, in the web address of a plain GET request: no cookies, no referrer, no custom headers. Shares, portfolio names, packets and anything else stay in your browser. The requests happen only when you press a button, never on load, and **Settings → Live lookups** switches the whole feature off.

## Provider and limits

The provider is Yahoo Finance's public chart endpoint: no key, unofficial, no published terms or limits. Consequences you will see in the app:

| Message | Meaning |
|---|---|
| Your browser blocked the request | Browsers only allow a web page to call another site if that site agrees (CORS). If the provider does not, direct lookups cannot work. The app stops after two blocked answers instead of retrying, tells you, and keeps using the daily file |
| The provider has no data for that ticker | Unknown or delisted symbol |
| Limiting requests right now | Rate limit: wait a few minutes |
| Not priced in US dollars | Foreign listing in another currency; not shown with a wrong price |

**Whether direct calls work from a web page could not be tested from the project's build environment** (it cannot reach the provider). Use **Settings → Test live lookup**: it reports success or the exact reason.

## If your browser blocks it: your own free proxy

[`worker/yahoo-proxy.js`](../worker/yahoo-proxy.js) is a 25-line Cloudflare Worker that forwards one kind of request (a single ticker's chart) and adds the CORS header. Cloudflare's free plan needs no card. Deploy it, paste its address into **Settings → Live lookups → Your own lookup proxy** (https only), press **Test live lookup**. The proxy sees only ticker symbols. It is optional and the site works without it; it has not been run against the provider from the build environment either, so test it.

## Why this is separate from the daily file

The daily file keeps every user fast and offline-tolerant and costs nothing per visitor. Live lookups cost the provider one request per ticker per press, from the visitor's own address, so they scale with users without any server of ours.
