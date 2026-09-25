/** 统一描边图标直接内联 SVG，不引入整套图标库，也不请求外部字体。 */
const paths = {
  compass:
    '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  trophy:
    '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 0h8"/>',
  book: '<path d="M12 5v15M3 4c4-1 6-1 9 1 3-2 5-2 9-1v15c-4-1-6-1-9 1-3-2-5-2-9-1V4Z"/>',
  volume:
    '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>',
  hint: '<path d="M8 16c0-3-3-3-3-7a7 7 0 1 1 14 0c0 4-3 4-3 7m-8 0h8m-7 4h6m-5 3h4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  expand: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
  rotate: '<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m4 5v2"/>',
  gem: '<path d="m12 2 7 7-7 13L5 9l7-7Zm-7 7h14m-7-7-3 7 3 13 3-13-3-7Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  steps:
    '<path d="M8 3c-4 0-5 8-1 9s5-9 1-9Zm-1 12-1 5m11-13c-4 0-5 8-1 9s5-9 1-9Zm-1 12-1 3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
  keyboard:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 16h10"/>',
  leaf: '<path d="M19 3C8 2 3 6 4 13c1 7 12 7 14-1l1-9ZM4 21 15 9"/>',
  flag: '<path d="M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
  grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
};
export const icon = (name, className = "") =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.compass}</svg>`;
export const foxLogo = `<svg class="fox-logo" viewBox="0 0 40 40" aria-hidden="true"><path fill="currentColor" d="M7 4h9v7h8V4h9v9h4v20H3V13h4z"/><path fill="#fff2cf" d="M8 18h24v13H8z"/><path fill="#49533d" d="M12 20h4v5h-4zm12 0h4v5h-4z"/><path fill="#de8e53" d="M18 27h4v3h-4z"/></svg>`;
