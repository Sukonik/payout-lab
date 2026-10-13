# QR Portfolio Cards

A card is a QR code plus plain words: portfolio name, abbreviated ID, card type, saved date and revision, and what scanning does. It can be copied as a link, saved as a PNG or printed. Everything is generated in the browser by the vendored [Nayuki QR generator](../THIRD_PARTY_NOTICES.md) (MIT). No QR or URL-shortening service is contacted.

| Card | Contains | Default |
|---|---|---|
| **Workspace bookmark** | Only a random portfolio id. Opens the portfolio on a browser that already has it. On another device it explains it cannot restore anything and offers *Open a packet*. | Yes |
| **Snapshot** | A dated copy of the holdings (same payload as a [snapshot link](links.md)). Needs an explicit choice and an "I understand" tick. | No |

Rules the code enforces (`js/core/qr.js`, tested in `tests/qr.test.mjs` and `e2e/qr.mjs`):

- **Error correction is fixed** (Medium, about 15% damage tolerated). It is never lowered to squeeze data in, and the link is never shortened.
- If a link does not fit the largest QR version, the card says so and points to **Save packet**. No broken or truncated code is ever shown or saved.
- The code is **black on white with a 4-module quiet zone in light and dark themes alike**, because scanners need the contrast. PNG modules are whole pixels.
- Codes over 900 bytes are flagged as dense: print them large.
- Tests decode the generated image back to the exact link with jsQR (a test-only dependency installed in CI with `npm install --no-save jsqr`; it is not shipped).
- The bookmark card never names a holding or shows a balance.
