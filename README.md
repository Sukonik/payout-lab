# 🧪 Payout Lab

> **Live site: https://sukonik.github.io/payout-lab/**

| | |
|---|---|
| **What it is** | Free dividend calculator that shows what each share pays, when, and how fragile your income is |
| **Hosting** | GitHub Pages, static files only (`index.html` + `data.json`), no backend |
| **Data** | Refreshed on weekdays by a GitHub Action from Yahoo Finance's public endpoint, no API key |
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
- About 28 popular dividend stocks and ETFs built in, plus a one-click sample portfolio.
- No third-party requests from the page (system fonts, no trackers).

## Run locally

Serve the folder (needed so the page can load `data.json`; opening `index.html` directly also works with the built-in starter numbers):

```bash
python3 -m http.server 8000
```

## Deploy

Static files only: `index.html` + `data.json`. Cloudflare Pages, Netlify, or GitHub Pages all work with no build step.

## Data: real numbers, no API key

The page reads `data.json`. A scheduled GitHub Action (`.github/workflows/update-data.yml`) runs `scripts/update-data.mjs` every weekday after the US close. It pulls price and dividend history from Yahoo Finance's public chart endpoint, then works out for each ticker:

- `p` price
- `d` dividends paid in the last 12 months, per share
- `per` the most recent payment per share
- `s` pay schedule (monthly, quarterly cycle, twice a year, yearly)
- `type` one of `EQUITY_STANDARD`, `ETF_PASS_THROUGH`, `ADR_VARIABLE`; picks which explanation the card shows (set by hand, not by the feed)
- `hist` the last 8 payments, shown as a small bar chart (shows steady vs jagged payouts)
- `g3`, `g5` dividend growth per year over 3 and 5 years, when enough history exists

and commits the result. If a ticker fails, its old values stay. If everything fails, the file is left untouched.

**Until the first run, `data.json` holds approximate starter estimates and the site says so.** Trigger the first refresh from the repo's Actions tab (Refresh dividend data, then Run workflow).

Things to know:
- Yahoo's endpoint is unofficial and has no SLA or published terms for commercial redistribution. For a paid product, review their terms and consider a licensed source later.
- Pay months come from ex-dividend dates, which usually land a few weeks before the cash arrives.
- Tax type (`q`) is not provided by the feed. It is kept from the seed data, so check it for new tickers.
- To add a ticker, add an entry to `data.json` such as `"AVGO": {"n": "Broadcom", "p": 1, "d": 0}` and the next refresh fills it in.

## Monetization roadmap

The product has a clear audience (income investors) and an obvious trust angle (no data collection). Suggested path, cheapest first:

1. **Launch free and collect traffic.** Ship on a custom domain and add basic privacy-friendly analytics (Plausible or Cloudflare Web Analytics). Write SEO pages around the queries people already search, such as "dividend calculator", "dividend cut calculator" and "how many shares of SCHD for $1,000 a month".
2. **Licensed data.** The free Yahoo-based refresh is fine for launch. Before charging, move to a provider whose terms allow commercial use (for example Financial Modeling Prep, Polygon or Tiingo), called from a serverless function so keys stay private.
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
