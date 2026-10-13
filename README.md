# 🧪 Payout Lab

**Stress-test the dividend portfolio you already own.** Free, no signup, no broker linking. Your portfolio is a small file that you own.

> **Live site: https://sukonik.github.io/payout-lab/**

## Releases

| Version | Status | Site | Release record |
|---|---|---|---|
| **V1** | Preserved baseline | https://sukonik.github.io/payout-lab/v1/ | Commit [`475287d`](https://github.com/Sukonik/payout-lab/commit/475287db7b2646dee2968c10c91301747dd02489) (verified deployed by Pages run [38339910088](https://github.com/Sukonik/payout-lab/actions/runs/38339910088)) |
| **V2 · Portable Workspace** | Releasing | https://sukonik.github.io/payout-lab/ (current) | Release commit and date are recorded here as soon as the release commit exists. Built from PRs [#21](https://github.com/Sukonik/payout-lab/pull/21), [#22](https://github.com/Sukonik/payout-lab/pull/22), [#23](https://github.com/Sukonik/payout-lab/pull/23), [#24](https://github.com/Sukonik/payout-lab/pull/24) |
| **V3 · Access & Receipts** | Planned | Pending deployment | Not started. See the [roadmap](#roadmap) |

- The main address always shows the latest release. A **preserved build** is the exact web files from its release commit, deployed under its own path (`/v1/`), so old links keep working even after the main site moves on. Preserved builds use the price file as it was at release and do not update.
- Releases are recorded by **commit**, which is permanent. Git tags have not been created yet (tag pushes were not possible from the automation that built V2). To add one: `git tag -a v2.0.0 <release commit> && git push origin v2.0.0`.
- Release notes and verification results: [`docs/release-v2.md`](docs/release-v2.md).

## What it does

- **Overview**: yearly and monthly income, yield, a rack of test tubes showing income by month (tap a tube to see who pays that month), data freshness and a concentration summary.
- **Portfolio**: add holdings, edit shares and values, import a CSV, check for newer market data and choose what to apply.
- **Lab**: dividend cut test, concentration check, goal timeline, add-money test, taxable vs IRA.
- **Receipts**: your packet and what is saved on this device, explained plainly.
- **Explore**: search any of about 590 tickers (the S&P 500, leading ETFs and two foreign ADRs) to see what one share pays, how often, and the last payments.

## Your portfolio is a file

Payout Lab has no accounts and no server. The site is static and your data stays in your browser.

| Word | What it means |
|---|---|
| **Packet** | A `.payout` file with your whole portfolio: holdings, settings and saved reports. It is your account. Open it on any device to continue. It is plain JSON, **not encrypted**, so keep it private. [Format](docs/packet-format.md) |
| **Device** | A copy this browser remembers so you can press *Continue* next time. Convenient, but browsers can clear site data, so it is **not a backup**. It is not synced between devices, and browser sync of bookmarks or passwords does not sync it. |
| **Bookmark** | Opens the website. On this browser it continues your remembered portfolio. On another device it cannot bring your portfolio back: open your packet there. |

The header always shows both states, **Device** and **Packet**, and **Save packet** is available on every tab. Opening a packet never replaces your work by itself: you see a summary, and older or diverging copies open as separate copies so nothing is silently overwritten.

## Data

Prices and dividends come from `data.json`, refreshed on weekdays by a scheduled GitHub Action ([`update-data.yml`](.github/workflows/update-data.yml)). It uses Tiingo (API key stored as a repository secret) and falls back to Yahoo Finance only for tickers Tiingo has no data for. Each run refreshes the 45 stalest tickers, so the whole list cycles in a few days. If Tiingo reports a rate limit the run stops and the rest wait for next time.

Per ticker the file carries price `p`, dividends paid in the last 12 months `d`, the latest payment `per`, the pay schedule `s`, the last ex-dividend date `last`, recent payments `hist`, growth `g3`/`g5`, the provider `src` and when it was refreshed `u`.

In the app, **a portfolio keeps its own dated copy of every value**. A new data file never rewrites it. *Portfolio → Check for updates* shows what changed with provider and date, protects values you typed, flags provider data that is itself stale, and applies only what you choose. You can pick whether "dividend per share" means the **last 12 months** or the **current rate**.

Things to know:
- Pay months come from **ex-dividend dates**, which land a few weeks before cash arrives. The app calls them estimates. Exact pay dates are not available yet.
- The data cannot separate special or one-off payments from regular ones, so the 12-month total can include them.
- Tax type (`q`) is not in the feed; new tickers get a rough default (ordinary for REITs, bond funds and covered-call funds, qualified otherwise). Check it.
- The S&P 500 list came from the open `datasets/s-and-p-500-companies` repo and drifts as the index changes. Add a ticker by adding an entry to `data.json`; it has no `u` date, so the next refresh picks it up first.
- Check Tiingo's terms for displaying data on a public or paid site before charging. Yahoo's endpoint is unofficial and has no commercial terms, so it is only a fallback.

## Privacy and cost

- **Nothing you enter is uploaded.** Calculations, packets, CSV parsing and storage all run in the browser. The page makes no third-party requests (system fonts, no trackers, no analytics).
- **$0 to run.** GitHub Pages hosts the static files; a free GitHub Action refreshes public data. There is no database, no per-user backend and no paid service. A custom domain is optional. If the site moves to a new web address, the copies remembered in the browser do not move, so save a packet first.
- **Browser support.** Current Chrome, Edge and Firefox, and Safari or iOS 16.4 and later (the app uses `<dialog>`, `:has()` and ES modules, with fallbacks for `color-mix`). The automated checks run in **Chromium only**, including phone-size emulation. It has **not yet been verified on a physical iPhone or in Safari or Firefox**.

## Roadmap

**V3 · Access & Receipts** (planned): saved **report receipts** you can compare over time with an explanation of what changed; **workspace bookmarks** and optional **snapshot links** that carry a dated copy in the link itself (never a server account); and **QR cards** generated in the browser. Tracked in [#2](https://github.com/Sukonik/payout-lab/issues/2) with tickets #6, #7 and #8.

Later and optional, each needing its own feasibility review: encrypted packets, passkeys or password-manager unlock keys (#10), and themed Collections (#1).

### Keeping it free to run

The earlier idea of a paid tier with cloud sync no longer fits: accounts and servers are exactly what this design avoids, and paid sync would cost money to operate. Options that keep operating cost at $0 and keep the privacy promise:

- Stay free and open source. Optional supporter links (GitHub Sponsors or similar) cost nothing to run.
- Clearly labelled affiliate links, written so they never read as a recommendation to buy a security.
- Anything paid must run entirely in the browser with no server, and its data must be licensed for commercial display.
- Ads and trackers would break the "nothing leaves your browser" promise.

Before charging for anything: keep the educational disclaimer reviewed for your jurisdiction, add Terms and a Privacy Policy, verify the data licence, and re-check every privacy claim above.

## Run it yourself

```bash
python3 -m http.server 8000     # the app uses ES modules and data.json, so serve it; opening index.html from disk will not work
npm test                        # unit tests (Node 20+, no dependencies)
node e2e/release.mjs            # release checks in Chromium (needs Playwright; see e2e/lib.mjs)
```

Deploy is automatic: pushing to `main` runs [`pages.yml`](.github/workflows/pages.yml), which calls `scripts/build-site.mjs` to assemble the current app plus the preserved builds listed in [`releases.json`](releases.json). One-time setup: Settings → Pages → Source: **GitHub Actions**.

Browser checks in `e2e/`: `packets` (save/open/migration/storage), `workspace` (routing, layout, accessibility), `refresh` (data review), `import` (CSV), `return` (start screen), `regression-v1` (calculators match V1), `release` (the release standard), plus screenshot helpers.

## Project structure

```
index.html                          # app shell: start screen, five views, settings sheet
css/app.css                         # design system (light and dark), phone-first layout
js/app.js                           # controller: working packet, local save, open/save packets
js/core/                            # pure, unit-tested logic: calc, packet schema, store, route, market, refresh, csv
js/ui/                              # rendering: views, tube rack, panels, explore, dialogs, shell, gate, data review, CSV import
data.json                           # public prices and dividends, refreshed on a schedule
releases.json                       # preserved builds: version, path and exact commit
docs/                               # packet format, release notes, screenshots
tests/                              # unit tests (npm test)
e2e/                                # browser checks (Playwright)
scripts/                            # update-data.mjs (refresh), build-site.mjs (Pages assembly)
.github/workflows/                  # data refresh, Pages deploy, tests
LICENSE                             # MPL-2.0
```

## Disclaimer

Payout Lab is an educational calculator. It does not recommend buying or selling anything, and it is not tax or investment advice. Data can be out of date, so check figures against each company's or fund's own announcements.

## License

[Mozilla Public License 2.0](LICENSE)
