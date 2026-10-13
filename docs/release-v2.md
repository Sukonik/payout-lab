# V2 · Portable Workspace: release notes

**Scope** (from roadmap [#2](https://github.com/Sukonik/payout-lab/issues/2)): a five-tab redesign, portable `.payout` packets, local portfolio continuation, CSV import and accurate data provenance.

## What shipped

| PR | Issue | Result |
|---|---|---|
| [#21](https://github.com/Sukonik/payout-lab/pull/21) | #3 | Versioned `.payout` packets, local accounts, one-time V1 migration, open/save with copy-on-diverge |
| [#22](https://github.com/Sukonik/payout-lab/pull/22) | #5 | Overview, Portfolio, Lab, Receipts and Explore tabs; specimen tag with separate Device and Packet states; redesigned test-tube rack; settings sheet; light and dark |
| [#23](https://github.com/Sukonik/payout-lab/pull/23) | #4 | Refresh preview, per-value provenance, protected manual values, ex-date vs pay-date, trailing vs current-rate dividends |
| [#24](https://github.com/Sukonik/payout-lab/pull/24) | #9, #10 (core) | CSV import with mapping, preview and explicit update/replace/add; Continue start screen; bookmark help |
| release PR | | Preserved V1 build at `/v1/`, `scripts/build-site.mjs`, release checks, README and these notes |

## Release standard

A user can save a packet, open it in a fresh browser, continue working and keep previous reports. Navigation preserves edits. A short link never implies it can recover data that exists only on another device. Verified by `e2e/release.mjs` (below).

## Verification (automated, Chromium)

| Check | Result |
|---|---|
| Unit tests (`npm test`) | 72 passing: packets, store, calc, route, refresh, CSV, market data |
| `e2e/packets.mjs` | 28: round trip into a fresh browser, bad files, copy-on-diverge, migration, denied storage |
| `e2e/workspace.mjs` | 58: routing, edits across tabs, no sideways scroll at 320/360/390/768/1280px, contrast, reduced motion |
| `e2e/refresh.mjs` | 36: review sheet, manual protection, stale data, basis switch, caveats |
| `e2e/import.mjs` | 47: CSV safety, privacy, modes, formula-safe export |
| `e2e/return.mjs` | 31: Continue, deep links, several portfolios, guest, blocked storage, cleared data |
| `e2e/hardening.mjs` | 17: regressions for the code-review findings below |
| `e2e/regression-v1.mjs` | 39/39 calculator outputs identical to V1 |
| `e2e/release.mjs` (24) | The site built exactly as deployed. The preserved V1 build is byte-identical to its commit and still works; a portfolio made in the **real V1 build** migrates intact (fractional shares, edited dividend, schedule, goal) with the V1 key untouched; a packet moves to a fresh browser, continues, and keeps an earlier saved report unchanged; no third-party URLs in any shipped file |

## Independent code review

Before release, an independent review of `js/` found real problems. All were fixed and are covered by tests.

| Finding | Fix |
|---|---|
| Typing an extreme price, dividend or rate produced a packet the app could not reopen | Entries are clamped to packet limits; the app also re-reads every packet it writes and refuses to download one it could not open |
| Local backups were written even in guest mode | Backups follow the "remember on this device" setting; messages no longer claim a backup that was not kept |
| A new revision on every autosave overflowed the history window and later made true ancestors look "diverged" | Revisions start only when editing begins after a copy may exist elsewhere (loaded, opened or exported); window widened to 200 |
| Import compared an incoming packet with unsaved state | Follows from the revision change; checked end to end |
| Combined CSV lots and legacy portfolios could exceed packet limits | Rejected or capped, with a message |
| Public price data was not validated | `data.json` entries are rebuilt from known fields and bounds |
| Two different staleness thresholds | One rule shared by the Overview and the review sheet |
| Drawing a tab could change saved settings silently | Rendering no longer writes into the portfolio |
| Fragile save when closing the page | Saves on `visibilitychange` as well as `pagehide` |
| Re-importing an export added apostrophes to names | The export's formula guard is removed on import |

## Known limits

- **Not verified on a physical iPhone, Safari or Firefox.** The checks use Chromium with phone emulation. iOS file save/open and the share sheet are untested.
- **No git tags.** Tag pushes were denied from the automation that built this release, so releases are recorded by commit. Create tags with `git tag -a v2.0.0 <commit> && git push origin v2.0.0` if you want them.
- **Saved reports have no UI yet.** The packet format already carries them and V2 preserves them untouched; creating and comparing them is V3 (#6).
- **Not included:** the optional unlock-key and password-manager spike and passkeys (#10, a separate feasibility review), and Collections (#1).
- Pay months are ex-dividend estimates and special payments are not separated (a data limitation, stated in the app).
- The live GitHub Pages address could not be opened from the build environment (outbound access is restricted), so the live site was verified through the deploy workflow and the locally built, tested artifact.
