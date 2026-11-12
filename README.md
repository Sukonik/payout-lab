<p align="center"><img src="assets/logo/forest-gold/payout-lab-atom-forest-gold.svg" alt="Payout Lab atom logo" width="96"></p>

# Payout Lab

**Stress-test the dividend portfolio you already own.** Free, no signup, no broker linking. Your portfolio is a small file that you own.

> **Live site: https://sukonik.github.io/payout-lab/**

## Releases

| Version | Status | Site | Release record |
|---|---|---|---|
| **V1** | Preserved baseline | https://sukonik.github.io/payout-lab/v1/ | Commit [`475287d`](https://github.com/Sukonik/payout-lab/commit/475287db7b2646dee2968c10c91301747dd02489) (verified deployed by Pages run [38339910088](https://github.com/Sukonik/payout-lab/actions/runs/38339910088)) |
| **V2 · Portable Workspace** | Released 2026-10-13 · superseded | https://sukonik.github.io/payout-lab/v2/ | Commit [`8f106b3`](https://github.com/Sukonik/payout-lab/commit/8f106b37ea01c5a1e29a04dbb6414e9dfaf71a9a) (deployed by Pages run [38449323089](https://github.com/Sukonik/payout-lab/actions/runs/38449323089)). Merged PRs [#21](https://github.com/Sukonik/payout-lab/pull/21) packets, [#22](https://github.com/Sukonik/payout-lab/pull/22) five tabs, [#23](https://github.com/Sukonik/payout-lab/pull/23) data provenance, [#24](https://github.com/Sukonik/payout-lab/pull/24) CSV and Continue, [#25](https://github.com/Sukonik/payout-lab/pull/25) release |
| **V3 · Access & Receipts** | Released 2026-10-13 · superseded | https://sukonik.github.io/payout-lab/v3/ | Commit [`e094a6d`](https://github.com/Sukonik/payout-lab/commit/e094a6dced32c6950c4e635eded3accbcc589157) (app code deployed by Pages run [38456071536](https://github.com/Sukonik/payout-lab/actions/runs/38456071536)). Merged PRs [#27](https://github.com/Sukonik/payout-lab/pull/27) saved reports and comparison, [#28](https://github.com/Sukonik/payout-lab/pull/28) bookmarks and snapshot links, [#29](https://github.com/Sukonik/payout-lab/pull/29) QR cards. Notes: [`docs/release-v3.md`](docs/release-v3.md) |
| **V4 · Splits** | Released 2026-10-14 · superseded | https://sukonik.github.io/payout-lab/ · preserved at https://sukonik.github.io/payout-lab/v4/ | Commit [`ca5c417`](https://github.com/Sukonik/payout-lab/commit/ca5c417ce6875636d1b503d468ebc74c17b5b0ee) (deployed by Pages run [38645364791](https://github.com/Sukonik/payout-lab/actions/runs/38645364791)). Merged PRs [#33](https://github.com/Sukonik/payout-lab/pull/33) split data and refresh, [#34](https://github.com/Sukonik/payout-lab/pull/34) Splits tab. Notes: [`docs/release-v4.md`](docs/release-v4.md) |
| **V4.1 · Fresh data & live lookup** | Released 2026-11-12 · superseded | https://sukonik.github.io/payout-lab/ | Commit [`182d862`](https://github.com/Sukonik/payout-lab/commit/182d862d91c736d6ca7d27b23952276e4ce16bc7) (deployed by Pages run [43259012524](https://github.com/Sukonik/payout-lab/actions/runs/43259012524)). Merged PRs [#37](https://github.com/Sukonik/payout-lab/pull/37) UX sweep, [#38](https://github.com/Sukonik/payout-lab/pull/38) data pipeline, [#39](https://github.com/Sukonik/payout-lab/pull/39) live lookup and source labels, [#40](https://github.com/Sukonik/payout-lab/pull/40) refresh workflows. Notes: [`docs/release-v4-1.md`](docs/release-v4-1.md). No separate preserved copy: this is the main address |
| **V4.2 · Atom 2.0 branding** | **Released** 2026-11-12 · current | https://sukonik.github.io/payout-lab/ | Commit [`3ba575a`](https://github.com/Sukonik/payout-lab/commit/3ba575a2823c7d28a818973b5a718bb1c4b38a1d) (deployed by Pages run [43273263128](https://github.com/Sukonik/payout-lab/actions/runs/43273263128)). Merged PR [#42](https://github.com/Sukonik/payout-lab/pull/42): six looks (colour theme + app icon) in a Theme menu, Atom 2.0 logo, light and dark. Notes: [`docs/theme-and-icons.md`](docs/theme-and-icons.md) |

- The main address always shows the latest release. A **preserved build** is the exact web files from its release commit, deployed under its own path (`/v1/`), so old links keep working even after the main site moves on. Preserved builds use the price file as it was at release and do not update.
- Releases are recorded by **commit**, which is permanent. Git tags have not been created yet (tag pushes were not possible from the automation that built V2). To add one: `git tag -a v2.0.0 <release commit> && git push origin v2.0.0`.
- Release notes and verification results: [`docs/release-v2.md`](docs/release-v2.md), [`docs/release-v3.md`](docs/release-v3.md), [`docs/release-v4.md`](docs/release-v4.md), [`docs/release-v4-1.md`](docs/release-v4-1.md).

## What it does

- **Overview**: yearly and monthly income, yield, a rack of test tubes showing income by month (tap a tube to see who pays that month), data freshness and a concentration summary.
- **Portfolio**: add holdings, edit shares and values, import a CSV, and refresh: **Refresh now** asks the quote provider live for the tickers you hold, **Check for updates** re-reads the daily file, and either way you review and choose what to apply. Every holding names its source and whether it is the **main data source** (Yahoo Finance) or a **secondary data source** (Tiingo).
- **Lab**: dividend cut test, concentration check, goal timeline, add-money test, taxable vs IRA.
- **Receipts**: saved **reports** (frozen, dated copies) you can compare with an explanation of what changed (your holdings, market data or assumptions), plus your packet, what is saved on this device, links and **QR cards**.
- **Splits**: a ledger of stock splits by day, month and year (forward splits first, reverse on request), announced splits with their source, a Google-vs-Lucid style compare, a what-if for your share count, and which of your holdings have split. [Details](docs/splits.md)
- **Explore**: search any of 1,500+ tickers (the S&P 500, leading ETFs, ADRs and more; coverage below) to see what one share pays, how often, and the last payments. A ticker that is not in the daily file gets a **Look up live** button. [Details](docs/live-lookup.md)
- **Light, dark and six looks**: the Theme button opens Auto / Light / Dark and six looks (Forest + Gold, Ion + Gold, Mint Ion, Black, White, Sky + Gold). Each look is a colour theme **and** an app icon (browser tab, iPhone home screen, header mark), in glass tiles, saved on your device. A moon/sun button gives one-click light/dark. [Details](docs/theme-and-icons.md)

## Your portfolio is a file

Payout Lab has no accounts and no server. The site is static and your data stays in your browser.

| Word | What it means |
|---|---|
| **Packet** | A `.payout` file with your whole portfolio: holdings, settings and saved reports. It is your account. Open it on any device to continue. It is plain JSON, **not encrypted**, so keep it private. [Format](docs/packet-format.md) |
| **Device** | A copy this browser remembers so you can press *Continue* next time. Convenient, but browsers can clear site data, so it is **not a backup**. It is not synced between devices, and browser sync of bookmarks or passwords does not sync it. |
| **Bookmark** | Opens the website. On this browser it continues your remembered portfolio. On another device it cannot bring your portfolio back: open your packet there. |
| **Snapshot link** | A dated copy of your holdings **inside the link**. It works anywhere and never updates, but **anyone with the link can read your holdings** (not encrypted). Too large for a link? You are told to use a packet. [Details](docs/links.md) |
| **QR card** | A QR code with the name, ID and date, to save or print. Default is a bookmark with no holdings in it; a card that carries your holdings is a separate, explicit choice. [Details](docs/qr.md) |

The header always shows both states, **Device** and **Packet**, and **Save packet** is available on every tab. Opening a packet never replaces your work by itself: you see a summary, and older or diverging copies open as separate copies so nothing is silently overwritten.

## Data

Prices, dividends and split history come from `data.json` and `splits.json`, refreshed three times a day by a scheduled GitHub Action ([`update-data.yml`](.github/workflows/update-data.yml)). **One main data source, named secondary ones:** Yahoo Finance's public chart endpoint (no key) is the main data source and answers for every ticker; Tiingo (key in a repository secret) is a secondary data source used only when Yahoo gives nothing, and the Nasdaq calendar is a secondary source for announced splits. Each ticker's record comes from one source, and the app labels it "main data source" or "secondary data source" by name. Each run refreshes the 300 stalest tickers, so the whole list cycles in about two days, and each ticker shows which source it came from. [`docs/data-sources.md`](docs/data-sources.md) lists every source, what it is used for and its limits.

**Theme: Green Ion.** The look comes from Green Ion, a small dependency-free design system (`css/green-ion.css`, vendored from the SunAgentic `green-ion/` folder) with a Payout Lab mapping in `css/green-ion-theme.css`. It keeps every class name and all behavior, adds an ion-green palette with WCAG AA contrast in light and dark, press and hover feedback, and a phone tab bar. Colors in the app are CSS variables, so changing the theme means editing one file.

<!-- coverage:start -->
**Coverage on 2026-11-12:** 860 stocks and 673 ETFs have live data (1533 tickers). 50 more are in `tickers-seed.json` waiting for their first data fetch; with them the list reaches 884 stocks and 699 ETFs. Target: at least 500 stocks and 400 ETFs.
<!-- coverage:end -->

**Coverage target: at least 500 stocks and 400 ETFs.** `tickers-seed.json` lists the tickers we want covered (broad-market, size and style, dividend, international, sector, thematic, bond, commodity, crypto and income ETFs, plus top tech and the stocks the owner watches). Each refresh spends about two thirds of its 45 tickers on seed tickers that are not in `data.json` yet and the rest on the stalest existing ones. A seed ticker is added only when a data provider returns a real price for it, so a delisted or mistyped symbol is skipped and nothing is ever published with made-up numbers. At about 90 new tickers a day the backlog fills in over about a week. Each refresh also redeploys the site, and free Actions artifact storage is limited, so the schedule stays modest. The run log prints a coverage line, and `tests/coverage.test.mjs` fails if data plus seed ever drops below the target. New tickers also get split history from `scripts/update-splits.mjs`, which works from the same list.

Per ticker the file carries price `p`, dividends paid in the last 12 months `d`, the latest payment `per`, the pay schedule `s`, the last ex-dividend date `last`, recent payments `hist`, growth `g3`/`g5`, the provider `src` and when it was refreshed `u`.

In the app, **a portfolio keeps its own dated copy of every value**. A new data file never rewrites it. *Portfolio → Check for updates* shows what changed with provider and date, protects values you typed, flags provider data that is itself stale, and applies only what you choose. You can pick whether "dividend per share" means the **last 12 months** or the **current rate**.

Stock split history and announced splits come from separate sources ([`docs/splits.md`](docs/splits.md) lists each one, its status and its limits).

Things to know:
- Pay months come from **ex-dividend dates**, which land a few weeks before cash arrives. The app calls them estimates. Exact pay dates are not available yet.
- The data cannot separate special or one-off payments from regular ones, so the 12-month total can include them.
- Tax type (`q`) is not in the feed; new tickers get a rough default (ordinary for REITs, bond funds and covered-call funds, qualified otherwise). Check it.
- The S&P 500 list came from the open `datasets/s-and-p-500-companies` repo and drifts as the index changes. Add a ticker by adding an entry to `data.json`; it has no `u` date, so the next refresh picks it up first.
- Yahoo's chart endpoint is unofficial and has no commercial terms, and Tiingo's free plan is limited too. Settle a licensed data source before charging for anything ([`docs/data-sources.md`](docs/data-sources.md)).

## Privacy and cost

- **Nothing you enter is uploaded.** Calculations, packets, CSV parsing and storage all run in the browser. The page makes no third-party requests on its own (system fonts, no trackers, no analytics). The one exception is opt-in: if you press **Refresh now** or **Look up live**, the ticker symbols you asked about go to the quote provider (or your own proxy); never your holdings or shares, and Settings can turn it off. [Details](docs/live-lookup.md).
- **$0 to run.** GitHub Pages hosts the static files; a free GitHub Action refreshes public data. There is no database, no per-user backend and no paid service. A custom domain is optional. If the site moves to a new web address, the copies remembered in the browser do not move, so save a packet first.
- **Browser support.** Current Chrome, Edge and Firefox, and Safari or iOS 16.4 and later (the app uses `<dialog>`, `:has()` and ES modules, with fallbacks for `color-mix`). The automated checks run in **Chromium only**, including phone-size emulation. It has **not yet been verified on a physical iPhone or in Safari or Firefox**.

## Roadmap

**Done:** V1 baseline, V2 Portable Workspace, V3 Access & Receipts and V4 Splits (roadmap [#2](https://github.com/Sukonik/payout-lab/issues/2)).

**Not done yet:** automated discovery of announced splits (the announced list is hand-kept, see [#32](https://github.com/Sukonik/payout-lab/issues/32)); verification on a physical iPhone, Safari and Firefox; scanning a QR card with a real phone camera.

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
npm test                        # unit tests (Node 20+, no dependencies; QR decode tests also use jsqr if you `npm install --no-save jsqr`)
node e2e/release.mjs            # release checks in Chromium (needs Playwright; see e2e/lib.mjs)
```

Deploy is automatic: pushing to `main` runs [`pages.yml`](.github/workflows/pages.yml), which calls `scripts/build-site.mjs` to assemble the current app plus the preserved builds listed in [`releases.json`](releases.json). One-time setup: Settings → Pages → Source: **GitHub Actions**.

Link format, sizes and safety: [`docs/links.md`](docs/links.md). QR cards: [`docs/qr.md`](docs/qr.md).

Browser checks in `e2e/`: `ux` (header, theme toggle, no clipped fields), `brand` (the six looks, icons, light and dark), `live` (Refresh now and Look up live with a mocked provider), `packets` (save/open/migration/storage), `workspace` (routing, layout, accessibility), `refresh` (data review), `import` (CSV), `return` (start screen), `receipts` (reports and comparison), `links` (bookmarks and snapshot links), `qr` (cards decoded back to their link), `regression-v1` (calculators match V1), `release` (the release standard on the built site), plus screenshot helpers.

## Project structure

```
index.html                          # app shell: start screen, five views, settings sheet
css/app.css                         # design system (light and dark), phone-first layout
js/app.js                           # controller: working packet, local save, open/save packets
js/core/                            # pure, unit-tested logic: calc, packet schema, store, route, market, refresh, csv, receipts, links, qr, splits, quotes, live
js/vendor/                          # vendored Nayuki QR generator (MIT, see THIRD_PARTY_NOTICES.md)
js/ui/                              # rendering: views, tube rack, panels, explore, dialogs, shell, gate, data review, CSV import
data.json                           # public prices and dividends, refreshed on a schedule
releases.json                       # preserved builds: version, path and exact commit
worker/                             # optional free Cloudflare Worker proxy for live lookups
assets/logo/                        # Atom 2.0 logo in six looks: SVG, favicons, touch icons (scripts/build-icons.mjs)
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
