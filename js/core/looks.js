// Looks: six colour themes, each paired with an app icon (favicon, touch icon and header logo). Pure data and helpers.
// "Default" (no choice made) keeps the app's own Green Ion colours, the forest-gold favicon, and a header logo that follows light/dark:
// ion-gold on light, mint-ion on dark. A look changes the accent colours and tints the neutrals, in light and dark separately.

export const LOOKS = [
  { id: "forest-gold", chip: "light", name: "Forest + Gold", tip: "Deep forest green with dividend gold", g: ["#12a36e", "#f5b82e"],
    light: { "--accent": "#0a5c3e", "--accent-ink": "#ffffff", "--accent-soft": "#dcecdf", "--accent-strong": "#064430", "--gi-glow": "rgba(10,92,62,.24)", "--liq-a": "#0a6b49", "--liq-b": "#f2b72e", "--bg": "#f5f6ec", "--bg2": "#ecefe0", "--glass": "#f1f3e6", "--line": "#dde3cf", "--line2": "#c3cdb0" },
    dark: { "--accent": "#6fd49c", "--accent-ink": "#052315", "--accent-soft": "#17382a", "--accent-strong": "#b2f0cb", "--gi-glow": "rgba(245,184,46,.18)", "--liq-a": "#1a9e66", "--liq-b": "#f5c451", "--bg": "#08130d", "--bg2": "#0d1c13", "--glass": "#14291e", "--line": "#243f2d", "--line2": "#33563f" },
    logo: { light: "forest-gold", dark: null } },
  { id: "ion-gold", chip: "light", name: "Ion + Gold", tip: "Bright ion green with gold", g: ["#16c978", "#ffd45a"],
    light: { "--accent": "#087a45", "--accent-ink": "#ffffff", "--accent-soft": "#d9f5e5", "--accent-strong": "#06532f", "--gi-glow": "rgba(18,184,102,.26)", "--liq-a": "#0a9453", "--liq-b": "#5ee79b", "--bg": "#f4f8f5", "--bg2": "#e9f1ec", "--glass": "#f0f6f2", "--line": "#d5e2da", "--line2": "#b9cfc3" },
    dark: { "--accent": "#16c978", "--accent-ink": "#04230f", "--accent-soft": "#0f3d29", "--accent-strong": "#7bf0b0", "--gi-glow": "rgba(22,201,120,.32)", "--liq-a": "#12b866", "--liq-b": "#7bf0b0", "--bg": "#07120d", "--bg2": "#0b1c14", "--glass": "#132a20", "--line": "#1f3a2d", "--line2": "#2c5140" },
    logo: { light: "ion-gold", dark: "ion-gold" } },
  { id: "mint-ion", chip: "dark", name: "Mint Ion", tip: "Cool mint and ion green", g: ["#7dffe0", "#16c978"],
    light: { "--accent": "#0b7f69", "--accent-ink": "#ffffff", "--accent-soft": "#d3f5ea", "--accent-strong": "#07584a", "--gi-glow": "rgba(11,127,105,.24)", "--liq-a": "#0b8f77", "--liq-b": "#7dffe0", "--bg": "#f2f9f7", "--bg2": "#e5f2ee", "--glass": "#eaf5f1", "--line": "#d0e5de", "--line2": "#b2d3c9" },
    dark: { "--accent": "#6ff0c8", "--accent-ink": "#03251d", "--accent-soft": "#11403a", "--accent-strong": "#b6ffe9", "--gi-glow": "rgba(111,240,200,.28)", "--liq-a": "#19b79a", "--liq-b": "#9bffe5", "--bg": "#061412", "--bg2": "#0a1f1b", "--glass": "#11302a", "--line": "#1d4a41", "--line2": "#2a6358" },
    logo: { light: null, dark: "mint-ion" } },
  { id: "black", chip: "light", name: "Black", tip: "Graphite and smoke", g: ["#8b5cff", "#1a1033"],
    light: { "--accent": "#1e2a30", "--accent-ink": "#ffffff", "--accent-soft": "#e4e9ec", "--accent-strong": "#0f171b", "--gi-glow": "rgba(30,42,48,.2)", "--liq-a": "#2f3d44", "--liq-b": "#8fa0a8", "--bg": "#f3f4f5", "--bg2": "#e8eaec", "--glass": "#eef0f1", "--line": "#d7dbde", "--line2": "#bcc3c8" },
    dark: { "--accent": "#d3dde2", "--accent-ink": "#0b1114", "--accent-soft": "#232e34", "--accent-strong": "#ffffff", "--gi-glow": "rgba(210,225,235,.14)", "--liq-a": "#7f929b", "--liq-b": "#cfdde4", "--bg": "#090c0e", "--bg2": "#0f1417", "--glass": "#182025", "--line": "#2a363d", "--line2": "#3c4b54", "--card": "#11181c" },
    logo: { light: "black", dark: null } },
  { id: "white", chip: "dark", name: "White", tip: "Frosted ice", g: ["#9fd8ff", "#ffffff"],
    light: { "--accent": "#2a6a9c", "--accent-ink": "#ffffff", "--accent-soft": "#dfeefa", "--accent-strong": "#184a72", "--gi-glow": "rgba(42,106,156,.22)", "--liq-a": "#3b86bd", "--liq-b": "#bfe3ff", "--bg": "#f5f9fc", "--bg2": "#e9f1f8", "--glass": "#eef4fa", "--line": "#d5e1ec", "--line2": "#b8cadb" },
    dark: { "--accent": "#bfe3ff", "--accent-ink": "#04202f", "--accent-soft": "#183349", "--accent-strong": "#e6f5ff", "--gi-glow": "rgba(191,227,255,.2)", "--liq-a": "#5da9dc", "--liq-b": "#d5efff", "--bg": "#09111a", "--bg2": "#0e1927", "--glass": "#152433", "--line": "#243a50", "--line2": "#345270", "--card": "#0f1a26" },
    logo: { light: null, dark: "white" } },
  { id: "sky-gold", chip: "light", name: "Sky + Gold", tip: "Neon sky blue with gold", g: ["#19b6ff", "#ffd45a"],
    light: { "--accent": "#0a6fd6", "--accent-ink": "#ffffff", "--accent-soft": "#dbeaff", "--accent-strong": "#064a98", "--gi-glow": "rgba(10,111,214,.26)", "--liq-a": "#1a7fe6", "--liq-b": "#ffd45a", "--bg": "#f3f8ff", "--bg2": "#e6eefb", "--glass": "#ecf3fd", "--line": "#d3e0f2", "--line2": "#b6c9e4" },
    dark: { "--accent": "#4db3ff", "--accent-ink": "#031b33", "--accent-soft": "#0f2f55", "--accent-strong": "#a9dbff", "--gi-glow": "rgba(77,179,255,.3)", "--liq-a": "#1f8be0", "--liq-b": "#ffd45a", "--bg": "#060f1c", "--bg2": "#0a1830", "--glass": "#112641", "--line": "#1d3a60", "--line2": "#2c527f", "--card": "#0b1729" },
    logo: { light: "sky-gold", dark: "sky-gold" } },
];

export const DEFAULT_ICON = "forest-gold";                    // the browser-tab icon until you choose a look
export const DEFAULT_LOGO = { light: "ion-gold", dark: "mint-ion" };   // the header mark follows light/dark
export const ICON_FILES = (id) => ({
  svg: `assets/logo/${id}/payout-lab-atom-${id}.svg`, png32: `assets/logo/${id}/favicon-32.png`, png16: `assets/logo/${id}/favicon-16.png`,
  apple: `assets/logo/${id}/apple-touch-icon.png`, icon192: `assets/logo/${id}/icon-192.png`, icon512: `assets/logo/${id}/icon-512.png`,
});

export const lookById = (id) => LOOKS.find((l) => l.id === id) ?? null;
export const lookVars = (id, mode) => (lookById(id) ? lookById(id)[mode === "dark" ? "dark" : "light"] : {});
// Which logo file the header shows: the look's own mark where it is legible on that background, otherwise the light/dark default.
export const headerLogo = (id, mode) => lookById(id)?.logo[mode === "dark" ? "dark" : "light"] ?? DEFAULT_LOGO[mode === "dark" ? "dark" : "light"];
export const normalizeLook = (v) => (lookById(v) ? v : null);

// WCAG contrast, used by the tests so a colour change that makes text unreadable fails loudly.
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const luminance = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
