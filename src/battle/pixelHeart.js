/**
 * 统一的像素红心：7×6 点阵，左上角一颗白色高光像素。
 * 界面 SVG、3D 铭牌、粒子与药水徽章都从这里取形状，保证处处一致。
 */
export const HEART_ART = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
export const HEART_W = 7;
export const HEART_H = 6;
export const HEART_HIGHLIGHT = [1, 1];

export const HEART_PIXELS = HEART_ART.flatMap((row, y) =>
  [...row].map((ch, x) => (ch === "#" ? [x, y] : null)).filter(Boolean),
);

const filled = new Set(HEART_PIXELS.map(([x, y]) => `${x},${y}`));

/** 轮廓像素：形状里至少有一个上下左右邻居在形状外的格子（空心红心用）。 */
export const HEART_OUTLINE = HEART_PIXELS.filter(([x, y]) =>
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => !filled.has(`${x + dx},${y + dy}`)),
);

/** 在 Canvas 上画像素红心，(x, y) 为左上角，px 为单个像素的边长。 */
export function drawPixelHeart(ctx, x, y, px, color, { highlight = "#ffffff" } = {}) {
  ctx.fillStyle = color;
  for (const [hx, hy] of HEART_PIXELS) ctx.fillRect(x + hx * px, y + hy * px, px, px);
  if (highlight) {
    ctx.fillStyle = highlight;
    ctx.fillRect(x + HEART_HIGHLIGHT[0] * px, y + HEART_HIGHLIGHT[1] * px, px, px);
  }
}
