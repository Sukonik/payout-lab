# 🧪 Payout Lab

> **Live site: https://sukonik.github.io/payout-lab/**

| | |
|---|---|
| **What it is** | Free dividend calculator that shows what each share pays, when, and how fragile your income is |
| **Hosting** | GitHub Pages via Actions (`.github/workflows/pages.yml`), static files only (`index.html` + `data.json`), no backend. One-time setup: Settings → Pages → Source: **GitHub Actions** |
| **Data** | Refreshed on weekdays by a GitHub Action from Tiingo (API key stored as a repo secret), with Yahoo Finance as fallback |
| **Privacy** | Portfolios stay in your browser's local storage, no accounts, no third-party requests |
| **Status** | Pre-launch. Numbers are starter estimates until the first data refresh succeeds, and the site says so |

**Stress-test the dividend portfolio you already own.**

Payout Lab is a free, privacy-first dividend calculator. Enter your holdings and it shows what they pay, when they pay it, and how fragile that income is. There is no signup and no broker linking, and nothing leaves your browser.

It is one static page (`index.html`) plus a data file (`data.json`), with no build step, backend or API key.

## Features

| Tool | What it answers |
|---|---|
| **Per-share payouts** | Search any ticker to see what one share pays per payment, how often, and in which months, with price, yearly total and yield. |
| **Holdings table** | Portfolio value, yearly income, average monthly income and yield for the shares you enter. |
| **Monthly income calendar** | Which months the money arrives, based on each holding's payout schedule (monthly, quarterly cycles, semi-annual, annual). |
| **Dividend cut test** | "If this holding cuts its dividend by X%, what happens to my income?" |
| **Concentration check** | How much of your income depends on your largest holdings. |
| **Goal timeline** | When you reach a monthly income goal given monthly contributions, dividend growth, a slow-growth scenario and optional reinvestment. |
| **Add-money test** | What a lump sum added to one holding does to income and yield. |
| **Taxable vs IRA** | Estimated tax drag using qualified and ordinary rates plus state tax. |

Other details:
- Light and dark themes (follows the system setting).
- Portfolio saved in `localStorage` only (key `payoutlab.v1`).
- Mobile-friendly, with safe-area insets.
- Two foreign ADRs (LYG, NTDOY) with an explanation of why their dollar payouts move with FX and withholding.
- Universe of about 590 tickers: the S&P 500, about 70 leading ETFs (broad market, dividend, covered-call, sector, bond) and two foreign ADRs. Tickers appear in search once they have been refreshed. Plus a one-click sample portfolio.
- No third-party requests from the page (system fonts, no trackers).

## Run locally

Serve the folder (needed so the page can load `data.json`; opening `index.html` directly also works with the built-in starter numbers):

```bash
python3 -m http.server 8000
```

## Deploy

Static files only: `index.html` + `data.json`. Cloudflare Pages, Netlify, or GitHub Pages all work with no build step.

## Data: real numbers

The page reads `data.json`. A scheduled GitHub Action (`.github/workflows/update-data.yml`) runs `scripts/update-data.mjs` three times each weekday. Each run refreshes the 45 stalest tickers (Tiingo's free plan allows about 50 symbols an hour), so the whole list cycles in a few days. You can run it by hand with a bigger batch from the Actions tab. For each ticker it tries **Tiingo** first (needs the `TIINGO_TOKEN` repo secret) and falls back to **Yahoo Finance's** public endpoint only if Tiingo has no data for that ticker. If Tiingo reports a rate limit (HTTP 429), the run stops and the remaining tickers wait for the next run. It then works out:

- `p` price (latest close)
- `d` dividends paid in the last 12 months, per share
- `per` the most recent payment per share
- `s` pay schedule (monthly, quarterly cycle, twice a year, yearly)
- `type` one of `EQUITY_STANDARD`, `ETF_PASS_THROUGH`, `ADR_VARIABLE`; picks which explanation the card shows (set by hand, not by the feed)
- `hist` the last 8 payments, shown as a small bar chart (shows steady vs jagged payouts)
- `g3`, `g5` dividend growth per year over 3 and 5 years, when enough history exists
- `src` which provider supplied that ticker, `u` when it was last refreshed
- `est` true when no provider reported dividends for a ticker that should pay one, so the dividend is a starter estimate

and commits the result. If a ticker fails on every provider, its old values stay. If everything fails, the file is left untouched. A successful refresh redeploys the site.

**Until a refresh succeeds, `data.json` holds approximate starter estimates and the site says so.** Trigger one from the repo's Actions tab (Refresh dividend data, then Run workflow).

Things to know:
- Check Tiingo's terms for displaying data on a public or paid site before charging, and upgrade to their commercial plan if the free plan does not cover it. Yahoo's endpoint is unofficial and has no commercial terms, so it is only a fallback.
- Pay months come from ex-dividend dates, which usually land a few weeks before the cash arrives.
- Tax type (`q`) is not provided by the feed. It is kept from the seed data, so check it for new tickers.
- To add a ticker, add an entry to `data.json` such as `"XYZ":{"n":"Example Corp","q":true,"type":"EQUITY_STANDARD"}`. It has no `u` date, so the next refresh picks it up first.
- The S&P 500 list came from the open `datasets/s-and-p-500-companies` repo and will drift as the index changes. Tax type (`q`) for new tickers is a rough default: ordinary for REITs, bond funds and covered-call funds, qualified for the rest. Verify before relying on it.
- Tiingo's free plan also caps unique symbols per month. If it runs out, the script falls back to Yahoo for the rest.

## Monetization roadmap

The product has a clear audience (income investors) and an obvious trust angle (no data collection). Suggested path, cheapest first:

1. **Launch free and collect traffic.** Ship on a custom domain and add basic privacy-friendly analytics (Plausible or Cloudflare Web Analytics). Write SEO pages around the queries people already search, such as "dividend calculator", "dividend cut calculator" and "how many shares of SCHD for $1,000 a month".
2. **Licensed data.** Before charging, confirm your data provider's plan allows commercial display (Tiingo commercial plan, or Financial Modeling Prep, Polygon/Massive, EODHD). The key stays in a GitHub secret and the browser never calls the API.
3. **Pro tier ($4 to $8/month or ~$40/year).** Candidates for gating:
   - Unlimited saved portfolios and cloud sync across devices.
   - CSV import from brokers.
   - Live prices and dividend-calendar alerts.
   - Exportable PDF or CSV reports.
   - DRIP backtesting and multi-scenario comparison.
   - Keep the core calculator free so it keeps ranking and sharing.
   - Payments: Stripe Checkout or Lemon Squeezy, with Cloudflare Workers or Supabase for auth and entitlements.
4. **Affiliate links, used carefully.** Broker referral links and tax-software links, placed clearly and labelled. Avoid anything that reads as a recommendation to buy a specific security.
5. **Sponsorship or light display ads.** Only if traffic justifies it. Ads would weaken the "nothing leaves your browser" promise.

### Before charging money

- **Compliance:** the calculator must stay educational and must not recommend securities. Keep the disclaimer and have it reviewed for your jurisdiction. Give it a Terms of Service and Privacy Policy page.
- **Accuracy:** verify the starter data and the tax math before charging for anything.
- **Privacy positioning:** if you add accounts or cloud sync, update the "nothing leaves your browser" claim, because it will no longer be true for paid users.

## Project structure

```
index.html                          # the whole app: HTML, CSS, JS
data.json                           # prices and dividends, refreshed daily
scripts/update-data.mjs             # the refresh script (Node 20, no deps)
.github/workflows/update-data.yml   # schedule for the refresh
README.md
LICENSE      # MPL-2.0
```

## Disclaimer

Payout Lab is an educational calculator. It does not recommend buying or selling anything, and it is not tax or investment advice. Starter data is approximate and may be out of date.

## License

[Mozilla Public License 2.0](LICENSE)
