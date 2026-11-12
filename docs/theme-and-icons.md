# Theme and app icon

The **Theme** button in the header (palette icon) opens a menu with Light / Dark / Auto and **six looks**. A look is a colour theme **and** an app icon: it changes the accent and tints the page, switches the browser-tab icon (SVG, 16 and 32px PNG and the iPhone home-screen icon) and, where it is legible, the header mark. The choice is saved on this device only (`localStorage`, key `payoutlab.look`), never in a packet. On phones the menu is a bottom sheet and the quick moon/sun button moves into it.

| Look | Mark colours | Page colours (light / dark) |
|---|---|---|
| Forest + Gold | forest green ring, gold nucleus | deep forest on warm cream / bright forest on dark green with gold liquid |
| Ion + Gold | ion green ring, gold nucleus | Green Ion (the app's own colours) |
| Mint Ion | mint ring, ion nucleus | teal-mint on cool white / neon mint on deep teal |
| Black | black | graphite on neutral grey / silver on charcoal |
| White | white | ice blue on frost / pale ice on navy |
| Sky + Gold | neon sky-blue ring, gold nucleus (new, made for this set) | sky blue on pale blue / neon sky on deep navy |

Each look has its own light and dark colours, so switching mode never leaves a stale colour.

## Defaults (nothing chosen)

- **Tab icon:** forest + gold (it reads on light and dark browser chrome and is the pack's primary identity).
- **Header mark:** ion + gold on light, mint ion on dark.
- **Colours:** the app's Green Ion theme.

## When a look's mark can't be seen

The header mark follows the look only where it is legible: the Black and Forest + Gold marks are dark, so on a dark page the header falls back to mint ion; the White and Mint Ion marks are light, so on a light page it falls back to ion + gold. The tab icon always follows the look (a white icon in a light browser tab is that look's own choice). The menu tiles put each mark on a fixed light or dark glass chip so every mark is visible in either mode.

## Accessibility

`tests/looks.test.mjs` checks every look in light and dark against WCAG AA: button text on the accent, accent text on cards and on the selected tab, body text (7:1), and muted text on every background (4.5:1). A colour change that breaks readability fails the build.

## Where the files are

`assets/logo/<look>/` holds the SVG master, `favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` (180px on a solid tile, because iOS fills transparency with black). The root `favicon.svg` and `favicon.ico` are the forest + gold default. They are generated from the Atom 2.0 logo pack by `node scripts/build-icons.mjs <pack folder>`; the pack's own notes are in [`brand/logo-pack-readme.md`](brand/logo-pack-readme.md).

The code is `js/core/looks.js` (data and contrast helpers) and `js/ui/look.js` (the menu). The menu pattern follows the WYWO app's theme menu.
