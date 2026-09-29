import { HEART_PIXELS, HEART_OUTLINE, HEART_HIGHLIGHT } from "../pixelHeart.js";

const pixelRects = (pixels, fill) =>
  pixels.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`).join("");

/** 界面用到的内联 SVG。红心在矩阵里大量出现，用 <use> 引用同一个 symbol。 */
export const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="i-heart" viewBox="0 0 7 6" shape-rendering="crispEdges">${pixelRects(HEART_PIXELS, "var(--heart, #e0262f)")}${pixelRects([HEART_HIGHLIGHT], "var(--heart-shine, #ffffff)")}</symbol>
    <symbol id="i-heart-empty" viewBox="0 0 7 6" shape-rendering="crispEdges">${pixelRects(HEART_OUTLINE, "currentColor")}</symbol>
    <symbol id="i-armor" viewBox="0 0 11 10" shape-rendering="crispEdges">
      <rect x="0" y="0" width="11" height="1" fill="var(--ink, #0a0a0a)"/><rect x="0" y="9" width="11" height="1" fill="var(--ink, #0a0a0a)"/>
      <rect x="0" y="0" width="1" height="10" fill="var(--ink, #0a0a0a)"/><rect x="10" y="0" width="1" height="10" fill="var(--ink, #0a0a0a)"/>
      <g transform="translate(2 2)">${pixelRects(HEART_PIXELS, "var(--heart, #e0262f)")}${pixelRects([HEART_HIGHLIGHT], "var(--heart-shine, #ffffff)")}</g>
    </symbol>
    <symbol id="i-shield" viewBox="0 0 24 24">
      <path d="M12 2.5 20 5.5v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10v-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter"/>
      <path d="M12 3v18" stroke="currentColor" stroke-width="1.4"/>
    </symbol>
    <symbol id="i-potion" viewBox="0 0 24 24">
      <path d="M9.5 3h5M10.5 3v5L5.8 16a4.2 4.2 0 0 0 3.6 6.3h5.2a4.2 4.2 0 0 0 3.6-6.3L13.5 8V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" stroke-linecap="square"/>
      <path d="M7.4 15h9.2l1.6 2.6a3 3 0 0 1-2.6 4.4H8.4a3 3 0 0 1-2.6-4.4z" fill="var(--heart, #e0262f)"/>
    </symbol>
    <symbol id="i-key" viewBox="0 0 24 24">
      <circle cx="7.5" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M11.5 12H21M18 12v3.5M15.2 12v2.5" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-flag" viewBox="0 0 24 24">
      <path d="M5 21V4M5 4h12l-2.5 4L17 12H5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-run" viewBox="0 0 24 24">
      <path d="M14 4.5a1.8 1.8 0 1 0 0 .01M9 20l3-5.5-3-2.5 2-4 4 3h3M12 14.5l3 2V21M8 9.5l-3 1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"/>
    </symbol>
    <symbol id="i-sound" viewBox="0 0 24 24">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>
      <path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-mute" viewBox="0 0 24 24">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>
      <path d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-restart" viewBox="0 0 24 24">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4.5H9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"/>
    </symbol>
    <symbol id="i-menu" viewBox="0 0 24 24">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-help" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
      <circle cx="12" cy="17" r="1.1" fill="currentColor"/>
    </symbol>
    <symbol id="i-rotate" viewBox="0 0 24 24">
      <path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3v4.5H14M5.5 21v-4.5H10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"/>
    </symbol>
    <symbol id="i-star" viewBox="0 0 24 24">
      <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" fill="currentColor"/>
    </symbol>
    <symbol id="i-lock" viewBox="0 0 24 24">
      <rect x="5" y="10.5" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
    </symbol>
    <symbol id="i-close" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-combo" viewBox="0 0 24 24">
      <path d="M4 5l7 7-7 7M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" stroke-linejoin="miter"/>
    </symbol>
    <symbol id="i-chase" viewBox="0 0 24 24">
      <path d="M3 12h13M11 6l6 6-6 6M20 5v14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"/>
    </symbol>
    <symbol id="i-perfect" viewBox="0 0 24 24">
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12z" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M12 8l4 4-4 4-4-4z" fill="currentColor"/>
    </symbol>
    <symbol id="i-cd" viewBox="0 0 24 24">
      <path d="M5.5 3h13M5.5 21h13M7 3l10 18M17 3 7 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>
      <path d="M9.5 18.5h5L12 14z" fill="currentColor"/>
    </symbol>
    <symbol id="i-bag" viewBox="0 0 24 24">
      <path d="M4 8h16v13H4zM9 8V4h6v4M4 13h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/>
    </symbol>
    <symbol id="i-sword" viewBox="0 0 24 24">
      <path d="M12 2.5v12.5M6.5 15h11M12 15v5M9.5 21h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/>
      <path d="M10.6 3.5 12 1.5l1.4 2V14h-2.8z" fill="currentColor"/>
    </symbol>
    <symbol id="i-skill" viewBox="0 0 24 24">
      <path d="M14 2 5 14h6l-1.5 8L19 10h-6z" fill="currentColor"/>
    </symbol>
    <symbol id="i-anvil" viewBox="0 0 24 24">
      <path d="M2.5 6h15.5c0 3.2-2.6 5.5-6 5.5h-1v3h4V19H6v-4.5h2.5v-3h-1C4.4 11.5 2.5 9.2 2.5 6z" fill="currentColor"/>
      <path d="M18 6h3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-chest" viewBox="0 0 24 24">
      <path d="M3 9h18v11H3zM3 9V6.5a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 6.5V9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/>
      <path d="M10 11h4v4h-4z" fill="currentColor"/>
    </symbol>
    <symbol id="i-fog" viewBox="0 0 24 24">
      <path d="M3 7h12M8 12h13M3 17h9M16 17h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-exit" viewBox="0 0 24 24">
      <path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="2.2"/>
      <path d="M9 9h6v6H9z" fill="currentColor"/>
    </symbol>
    <symbol id="i-mirror" viewBox="0 0 24 24">
      <path d="M12 2v20" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2.5 2"/>
      <path d="M9 6 3 12l6 6zM15 6l6 6-6 6z" fill="currentColor"/>
    </symbol>
    <symbol id="i-extend" viewBox="0 0 24 24">
      <path d="M2 8h8v8H2z" fill="currentColor"/>
      <path d="M13 8h8v8h-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>
    </symbol>
    <symbol id="i-music" viewBox="0 0 24 24">
      <path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
      <circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="17.5" cy="16" r="2.6" fill="currentColor"/>
    </symbol>
    <symbol id="i-music-off" viewBox="0 0 24 24">
      <path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" opacity="0.45"/>
      <circle cx="6.5" cy="18" r="2.6" fill="currentColor" opacity="0.45"/><circle cx="17.5" cy="16" r="2.6" fill="currentColor" opacity="0.45"/>
      <path d="m3 3 18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
    </symbol>
    <symbol id="i-orbit" viewBox="0 0 24 24">
      <path d="M12 2.5 18 5.5 12 8.5 6 5.5z" fill="currentColor"/>
      <path d="M6 5.5v6l6 3v-6M18 5.5v6l-6 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="miter"/>
      <path d="M3 14.5c1.6 3.6 5 5.5 9 5.5 3.2 0 6-1.2 7.8-3.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
      <path d="M16.2 16.4 20 16.2 20.4 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"/>
    </symbol>
    <symbol id="i-stagger" viewBox="0 0 24 24">
      <path d="M3 5h9v6H3z" fill="currentColor"/>
      <path d="M7.5 11v9" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/>
      <path d="m15 4 2.5 5.5L15 12l4 7M20 6.5l1.5-1M21.5 12H23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"/>
    </symbol>
    <symbol id="i-energy" viewBox="0 0 24 24">
      <path d="M12 2.6 20.4 12 12 21.4 3.6 12z" fill="var(--accent, #002fa7)" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="miter"/>
      <path d="M12 7 8.8 12H12z" fill="#ffffff" opacity="0.55"/>
    </symbol>
    <symbol id="i-wait" viewBox="0 0 24 24">
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>
    </symbol>
    <symbol id="i-pierce" viewBox="0 0 24 24">
      <path d="M12 2v15M7 12l5 6 5-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/>
      <path d="M4 21h16" stroke="currentColor" stroke-width="2.4" stroke-dasharray="3 2"/>
    </symbol>
  </defs>
</svg>`;

export const icon = (name, cls = "icon") =>
  `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const heartSvg = (kind = "heart") =>
  kind === "armor"
    ? `<svg class="heart-svg ${kind}" viewBox="0 0 11 10" aria-hidden="true"><use href="#i-${kind}"/></svg>`
    : `<svg class="heart-svg ${kind}" viewBox="0 0 7 6" aria-hidden="true"><use href="#i-${kind}"/></svg>`;

/**
 * 把形状画成小网格：命中格为实心，锚点加一个小方块标记（悬停时鼠标对准的那一格）。
 */
export function shapeSvg(shape, { cell = 11, gap = 2, tone = "attack", pivot = true } = {}) {
  const w = shape.cols * (cell + gap) - gap;
  const h = shape.rows * (cell + gap) - gap;
  const filled = new Set(shape.cells.map(([r, c]) => `${r},${c}`));
  let body = "";
  for (let r = 0; r < shape.rows; r += 1)
    for (let c = 0; c < shape.cols; c += 1) {
      const x = c * (cell + gap);
      const y = r * (cell + gap);
      const on = filled.has(`${r},${c}`);
      body += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" class="${on ? "on" : "off"}"/>`;
    }
  if (pivot) {
    const [pr, pc] = shape.pivot;
    const k = Math.max(2, Math.round(cell * 0.36));
    body += `<rect x="${pc * (cell + gap) + (cell - k) / 2}" y="${pr * (cell + gap) + (cell - k) / 2}" width="${k}" height="${k}" class="pivot"/>`;
  }
  return `<svg class="shape-svg ${tone}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
}

/** 矩阵缩略图（用于怪物信息卡与主角状态栏）。 */
export function matrixSvg(matrix, { cell = 10, gap = 2 } = {}) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const w = cols * (cell + gap) - gap;
  const h = rows * (cell + gap) - gap;
  let body = "";
  matrix.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v < 0) return;
      const x = c * (cell + gap);
      const y = r * (cell + gap);
      const cls = v === 0 ? "empty" : v >= 2 ? "armor" : "heart";
      body += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" class="${cls}"/>`;
    }),
  );
  return `<svg class="matrix-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
}
