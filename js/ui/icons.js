// Small inline stroke icons (24px grid). Decorative: always paired with a text label.
const P = {
  overview: '<path d="M9 3h6v2.2l-1 1.6V12l4.2 7.2A2 2 0 0 1 16.5 22h-9a2 2 0 0 1-1.7-2.8L10 12V6.8L9 5.2z"/><path d="M8.2 16h7.6"/>',
  portfolio: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"/><path d="M3 12.5h18"/>',
  lab: '<path d="M10 3h4"/><path d="M10.5 3v6L5.2 18.2A2.2 2.2 0 0 0 7.1 21.5h9.8a2.2 2.2 0 0 0 1.9-3.3L13.5 9V3"/><path d="M7.5 15.5h9"/><circle cx="11" cy="18.2" r=".6"/><circle cx="14" cy="17.2" r=".6"/>',
  receipts: '<path d="M6 3h12v18l-2.4-1.6L13.2 21 12 19.9 10.8 21l-2.4-1.6L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  explore: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/><path d="M11 8v6M8 11h6" opacity=".55"/>',
  save: '<path d="M12 4v11"/><path d="m7.5 10.8 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  open: '<path d="M4 19.5V6.5A1.5 1.5 0 0 1 5.5 5H10l2 2.5h6.5A1.5 1.5 0 0 1 20 9v1"/><path d="M3.8 19.5 6.3 11a1.5 1.5 0 0 1 1.4-1.1H21a.9.9 0 0 1 .9 1.2L19.6 18.4a1.5 1.5 0 0 1-1.4 1.1z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  device: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2.5 19.5h19"/>',
  file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flask: '<path d="M10 3h4M10.5 3v6L5.2 18.2A2.2 2.2 0 0 0 7.1 21.5h9.8a2.2 2.2 0 0 0 1.9-3.3L13.5 9V3"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
};
export function icon(name, size = 22) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ""}</svg>`;
}
