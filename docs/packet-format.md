# Payout packet format (schema version 1)

A **packet** is the portable copy of a portfolio: one plain JSON file with the extension `.payout`.
Opening a packet restores the holdings, settings and saved reports without signup or upload. The latest packet is enough to continue.

> **A packet contains your holdings and share counts, unencrypted.** Keep it somewhere private. Payout Lab never receives it:
> files are read and written in your browser only. Encryption is a possible future extension and is not implied by this format.

## Envelope

| Field | Type | Notes |
|---|---|---|
| `format` | `"payout-packet"` | Identifies the file type |
| `schemaVersion` | integer | Currently `1`. Files with a higher number are rejected with a message, never partly read |
| `portfolioId` | `pf_` + 13 chars | Random identity label from browser cryptographic randomness. Not a password and not proof of anything |
| `portfolioName` | text, ≤ 80 chars | Editable |
| `revisionId` | `rv_` + 13 chars | Changes every time the working copy is saved |
| `parentRevisionId` | revision id or `null` | The revision this one was made from |
| `lineage` | list of revision ids, ≤ 100 | Recent revisions, oldest first, ending with `revisionId`. Used to tell newer / older / diverged copies apart |
| `createdAt`, `savedAt` | ISO 8601 | |
| `app` | `{ name, version }` | Which build wrote the file |
| `origin` | `{ portfolioId, revisionId, relation: "copy" }` | Present when a packet was opened as a separate copy |
| `holdings` | list, ≤ 500 | See below |
| `settings` | object | Scenario settings (see below) |
| `snapshots` | list, ≤ 50 | Frozen report receipts (see below) |
| `checksum` | `{ alg: "sha-256", value }` | Hash of the canonical JSON of everything else |

The checksum catches **accidental** damage. It is not a signature: anyone can edit a file and recompute it. A file whose checksum does not match opens only after a warning.

## Holdings

```json
{
  "id": "h_…", "ticker": "SCHD", "name": "Schwab US Dividend Equity ETF", "shares": 12.5,
  "fields": {
    "price":    { "v": 32.65, "src": "tiingo", "asOf": "2026-10-12", "manual": false },
    "dividend": { "v": 1.055, "src": "tiingo", "asOf": "2026-10-12", "manual": false, "basis": "trailing" },
    "schedule": { "v": "Q3",  "src": "tiingo", "asOf": "2026-10-12", "manual": false, "basis": "ex-date" },
    "tax":      { "v": true,  "src": "data",   "asOf": null,         "manual": false }
  }
}
```

* `shares` may be fractional (0 to 1e12).
* Every value field records where it came from. `src` is `tiingo`, `yahoo`, `seed` (starter estimate), `csv`, `user` or `legacy` (brought forward from the first version, origin unknown).
* `asOf` is the date the provider observed the value, or `null` if unknown. It is never the date the file was saved.
* `manual: true` means you set the value yourself. Manual values are protected from data refreshes.
* `dividend.v` is the yearly dividend per share. `basis` says whether it is a trailing 12-month total or an indicated forward rate.
* `schedule.v` is one of `M`, `Q1`, `Q2`, `Q3`, `S`, `A`. `schedule.basis: "ex-date"` means the months were derived from ex-dividend dates, not known cash-payment dates.
* `tax.v` is `true` for qualified dividends, `false` for ordinary income.

## Settings

`target`, `contrib`, `growth`, `slow`, `reinvest`, `cutT`, `cutPct`, `addT`, `addAmt`, `qRate`, `oRate`, `stRate`, `dividendBasis`.
Missing keys take their defaults. Present-but-invalid keys reject the file.

## Snapshots (report receipts)

An immutable dated report: the holdings, their provenance, the assumptions, the calculated outputs and the formula version, all frozen at capture time.
Opening a receipt never applies today's data to it. See `js/core/packet.js` (`validateReceipt`) for the exact fields and bounds.

## Validation rules

Before anything reaches the application, a packet is:

1. size-checked (≤ 5 million characters) and parsed as JSON,
2. checked for `format` and `schemaVersion`,
3. rebuilt from whitelisted fields only (unknown fields are dropped),
4. type-checked, with finite numbers inside fixed bounds, valid IDs, dates, tickers and enumerated values,
5. checked for duplicate tickers and duplicate receipts.

Text is cleaned of control characters and always escaped when displayed. File content is never executed.

## Opening a packet

Opening shows a summary and never replaces current work merely because a file was chosen.
If you already have the same portfolio, revisions are compared through `lineage`:

| Relation | What Payout Lab offers |
|---|---|
| Not on this device | Open it (your current portfolio is kept) |
| Identical | Nothing to do |
| Incoming is newer (your revision is in its history) | Continue from it, or open as a separate copy |
| Incoming is older | Open as a separate copy (recommended), or replace mine with a backup kept |
| Diverged (both changed) | Open as a separate copy (recommended), or replace mine with a backup kept. No silent last-write-wins |

A separate copy gets a new `portfolioId` and records `origin`.
