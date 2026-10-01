# 🧪 Payout Lab

**Stress-test the dividend portfolio you already own.**

Payout Lab is a free, privacy-first dividend calculator. Enter your holdings and it shows what they pay, when they pay it, and how fragile that income is. There is no signup and no broker linking, and nothing leaves your browser.

It is a single static file (`index.html`) with no build step, no backend and no dependencies beyond two Google Fonts.

## Features

| Tool | What it answers |
|---|---|
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
- Built-in starter database of about 28 popular dividend stocks and ETFs, plus a one-click sample portfolio.

## Run locally

Open `index.html` in a browser. You can also serve it:

```bash
python3 -m http.server 8000
```

## Deploy

No build step. Any static host works:

- **Cloudflare Pages**: connect the repo, leave the build command empty and set the output directory to `/`.
- **Netlify**: drag the folder into Netlify Drop, or connect the repo.
- **GitHub Pages**: serve from the root of the branch.

## Data

The `DB` object near the top of the `<script>` block holds the starter data (price, yearly dividend per share, payout schedule, qualified flag). **The figures are approximate placeholders. Replace them with verified numbers before a public launch.** `DATA_AS_OF` controls the label shown under the title.

To add a ticker, add an entry:

```js
SCHD:{n:"Schwab US Dividend Equity ETF", p:27.5, d:1.03, s:"Q3", q:true}
```

Schedules: `M` monthly, `Q1`/`Q2`/`Q3` quarterly (Jan/Apr/Jul/Oct, Feb/May/Aug/Nov, Mar/Jun/Sep/Dec), `S` twice a year, `A` yearly.

## Monetization roadmap

The product has a clear audience (income investors) and an obvious trust angle (no data collection). Suggested path, cheapest first:

1. **Launch free and collect traffic.** Ship on a custom domain and add basic privacy-friendly analytics (Plausible or Cloudflare Web Analytics). Write SEO pages around the queries people already search, such as "dividend calculator", "dividend cut calculator" and "how many shares of SCHD for $1,000 a month".
2. **Verified live data.** The biggest quality gap is the hardcoded starter data. Pull prices and dividends from a market data API (for example Financial Modeling Prep, Polygon or Tiingo) through a small serverless function so API keys stay private. Check each provider's terms for commercial and redistribution use first.
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
index.html   # the entire app: HTML, CSS, JS, starter data
README.md
LICENSE      # MPL-2.0
```

## Disclaimer

Payout Lab is an educational calculator. It does not recommend buying or selling anything, and it is not tax or investment advice. Starter data is approximate and may be out of date.

## License

[Mozilla Public License 2.0](LICENSE)
