# V3 · Access & Receipts: release notes

**Released 2026-10-13 · release commit [`e094a6d`](https://github.com/Sukonik/payout-lab/commit/e094a6dced32c6950c4e635eded3accbcc589157) · app code deployed by [Pages run 38456071536](https://github.com/Sukonik/payout-lab/actions/runs/38456071536) (success).** Live at the main address and preserved at `/v3/`. Later commits to main are documentation only.

**Scope** (roadmap [#2](https://github.com/Sukonik/payout-lab/issues/2)): saved reports you can compare over time, personal links, QR Portfolio Cards and a polished device transfer. Built on V2's portable `.payout` packets. Recurring cost stays $0, no signup, nothing uploaded.

## What shipped

| PR | Issue | Result |
|---|---|---|
| [#27](https://github.com/Sukonik/payout-lab/pull/27) | #6 | Saved **reports** (frozen, dated, in the packet, max 50), open from a file, exact comparison that splits the income change into holdings, market data and overlap, a counterfactual goal-timeline explanation, printable report |
| [#28](https://github.com/Sukonik/payout-lab/pull/28) | #7 | **Workspace bookmark** (id only) and **snapshot link** (dated copy in the link, compressed in the browser). Details and measured sizes: [`links.md`](links.md) |
| [#29](https://github.com/Sukonik/payout-lab/pull/29) | #8 | **QR Portfolio Card**: bookmark card by default, snapshot card by explicit choice, PNG and print, fixed error correction. Details: [`qr.md`](qr.md) |

## Release standard

Comparisons are explained, links never imply they can recover data that exists only on another device, link size limits are enforced rather than hidden, and a person moving between devices always has the packet as the lossless route. Verified by `e2e/release.mjs` section 5 on the site as built for deployment.

## Verification (automated, Chromium)

| Check | Result |
|---|---|
| Unit tests (`npm test`) | 103 passing (adds receipts, link codec, QR) |
| `e2e/receipts.mjs` | 41: frozen reports, attribution split adds up, goal explanation, printable report, packet round trip |
| `e2e/links.mjs` | 20: cross-origin round trip, old links unchanged after updates, damaged and hostile links change nothing, oversize refused, nothing sent over the network |
| `e2e/qr.mjs` | 18: saved PNG scanned back (jsQR) to the exact bookmark and snapshot links, same contrast in light and dark, oversize refused, print path |
| `e2e/release.mjs` | 36 (V3 section: comparison explanation, link and bookmark on the deployed address, snapshot opening as a new portfolio on another device, bookmark recovery explanation, QR scan, report travelling in a packet and comparing on a fresh device) |
| Earlier suites | packets 28, workspace 58, refresh 36, import 47, return 31, hardening 17, regression-v1 39 (calculators identical to V1) all still pass |

## Link and card limits (measured)

Encoded snapshot length: 1 holding 315 characters, 15 → 632, 60 → 1,471, 100 → 2,220, 200 → 4,359, 500 → 10,546. Over 8,000 is refused for links. A QR code holds fewer: a card is refused when the link does not fit the largest standard code at fixed Medium error correction, with a message pointing to **Save packet**. Nothing is ever shortened or weakened.

## Recovery explanations

| Situation | What the app says |
|---|---|
| Open a bookmark on a device that has never seen the portfolio | It carries no data and cannot bring it back; open the packet |
| Open a snapshot link | Preview of a fixed, dated copy; opens as a new portfolio; your portfolios untouched |
| Damaged, cut-off or newer-version link | Why it failed, nothing changed, ask for a packet |
| Portfolio too large for a link or card | Too large; nothing was shortened; use Save packet |

## Known limits

- **Not verified on a physical iPhone, Safari or Firefox**, and **no real camera scan** of a printed or on-screen card. Decoding is tested with jsQR on the generated image only.
- **No git tags** (tag pushes are denied from the build automation). Releases are recorded by commit.
- Snapshot links and cards are **not encrypted**: anyone holding one can read the holdings. The app says so wherever one is made.
- Browser address length limits differ by app. Links over about 2,000 characters are flagged "medium" because some chat and email apps cut them.
- **Not included:** optional encryption, passkeys and password-manager unlock keys (#10, separate feasibility review), and Collections (#1).
- The live GitHub Pages address cannot be opened from the build environment; the live site is verified through the deploy workflow and the locally built, tested artifact.
