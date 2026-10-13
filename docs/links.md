# Links

Payout Lab has two kinds of link. Neither involves a server, a shortener or an account.

| | Workspace bookmark | Snapshot link |
|---|---|---|
| Form | `…/#/overview?p=<portfolio id>` | `…/#/snapshot?v=1&c=<0\|1>&d=<payload>` |
| Contains | Only a random portfolio id | A dated copy of holdings and settings |
| Same browser | Opens and selects that portfolio | Opens as a **new** portfolio |
| Another device | Explains it cannot restore anything and offers *Open a packet* | Works: the data is in the link |
| Updates | n/a | Never. Changing a portfolio makes a new link; old links keep the old copy |
| Privacy | Safe to share (reveals nothing) | **Anyone with it can read the holdings. Not encrypted** |

## Snapshot payload

Compact JSON (`{k:"payout-link", v, n, t, i, r, s, h:[[ticker, name, shares, price…, dividend…, schedule…, tax flag]]}`), deflate-compressed in the browser (`CompressionStream`), base64url-encoded into the fragment. Fragments are never sent to a server. Saved reports are **not** included, and opening a link rebuilds a brand-new portfolio (new id, no lineage with the sender).

## Measured sizes

Encoded characters (realistic holdings, compressed):

| Holdings | Characters | Rating |
|---|---|---|
| 1 | 315 | short |
| 7 | 464 | short |
| 15 | 632 | short |
| 30 | 927 | short |
| 60 | 1,471 | short |
| 100 | 2,220 | medium |
| 200 | 4,359 | medium |
| 500 | 10,546 | too large |

Short is up to 2,000 characters, medium up to 8,000, anything over 8,000 is refused. Nothing is ever shortened to fit: a too-large portfolio is told to use **Save packet** instead. Repetitive data compresses better, so real counts vary. A browser without `CompressionStream` writes an uncompressed link (flagged, and longer).

## Safety

- The decoder allows at most 256 KB inflated (decompression-bomb guard), validates every field with the packet rules, and treats names as text, never markup.
- Damaged, cut-off, future-version or hostile links change nothing and say why.
- The payload is removed from the address bar (and so from history navigation) as soon as it is read.
- Opening a link never touches the portfolios already on the device.

Verified by `tests/link.test.mjs` and `e2e/links.mjs` (cross-origin round trip, old links unchanged after updates, oversize refusal, damaged links, no network requests carrying the payload).
