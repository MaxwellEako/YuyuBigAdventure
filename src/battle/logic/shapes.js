/**
 * 红心矩阵与攻击形状。
 * 矩阵格值：VOID 表示此处没有心槽；0 为已失去的心；1 为普通红心；2 为护甲心（需两次命中）。
 * 形状默认不旋转、不镜像（获得变形强化的武器可以在战斗中变形）；落点可以超出矩阵边界，超出部分直接忽略。
 */
export const VOID = -1;
export const EMPTY = 0;
export const HEART = 1;
export const ARMOR = 2;

/**
 * 用字符画定义形状：'#' 为命中格，'@' 为鼠标所指的锚点格（同时也是命中格），
 * 'o' 为不命中的锚点，'.' 为空白。未写锚点时取最靠近中心的命中格。
 */
export function parseShape(art) {
  const lines = Array.isArray(art) ? art : [art];
  const cells = [];
  let pivot = null;
  lines.forEach((line, r) =>
    [...line].forEach((ch, c) => {
      if (ch === "#" || ch === "@") cells.push([r, c]);
      if (ch === "@" || ch === "o") pivot = [r, c];
    }),
  );
  if (!cells.length) throw new Error(`空形状：${lines.join("/")}`);
  if (!pivot) {
    const cr = (lines.length - 1) / 2;
    const cc = (Math.max(...lines.map((l) => l.length)) - 1) / 2;
    pivot = [...cells].sort(
      (a, b) => Math.hypot(a[0] - cr, a[1] - cc) - Math.hypot(b[0] - cr, b[1] - cc),
    )[0];
  }
  const offsets = cells.map(([r, c]) => [r - pivot[0], c - pivot[1]]);
  return {
    art: lines,
    cells,
    offsets,
    pivot,
    rows: lines.length,
    cols: Math.max(...lines.map((l) => l.length)),
    size: cells.length,
  };
}

/** 生命矩阵字符画：'#' 红心，'A' 护甲心，'.' 无心槽。 */
export function parseMatrix(art) {
  return art.map((line) =>
    [...line].map((ch) => (ch === "#" ? HEART : ch === "A" ? ARMOR : VOID)),
  );
}

export function filledMatrix(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(HEART));
}

export const cloneMatrix = (m) => m.map((row) => [...row]);

export function inBounds(m, r, c) {
  return r >= 0 && c >= 0 && r < m.length && c < m[0].length;
}

/** 锚点（形状 pivot）落在 (r,c) 时覆盖的所有坐标，包括越界部分。 */
export function footprint(shape, r, c) {
  return shape.offsets.map(([dr, dc]) => [r + dr, c + dc]);
}

/** 命中结果：只包含界内、且当前仍有心的格子；pierce 直接击碎护甲心。 */
export function resolveHits(matrix, shape, r, c, { pierce = false } = {}) {
  const hits = [];
  for (const [hr, hc] of footprint(shape, r, c)) {
    if (!inBounds(matrix, hr, hc)) continue;
    const before = matrix[hr][hc];
    if (before <= EMPTY) continue;
    hits.push({ r: hr, c: hc, before, after: pierce ? EMPTY : before - 1 });
  }
  return hits;
}

export function resolveHeal(matrix, shape, r, c) {
  const heals = [];
  for (const [hr, hc] of footprint(shape, r, c)) {
    if (!inBounds(matrix, hr, hc) || matrix[hr][hc] !== EMPTY) continue;
    heals.push({ r: hr, c: hc, before: EMPTY, after: HEART });
  }
  return heals;
}

export function applyChanges(matrix, changes) {
  const next = cloneMatrix(matrix);
  for (const { r, c, after } of changes) next[r][c] = after;
  return next;
}

export function countHearts(matrix) {
  let hearts = 0;
  let armor = 0;
  let slots = 0;
  for (const row of matrix)
    for (const v of row) {
      if (v === VOID) continue;
      slots += 1;
      if (v > EMPTY) hearts += 1;
      if (v >= ARMOR) armor += 1;
    }
  return { hearts, armor, slots };
}

export const isDead = (matrix) => countHearts(matrix).hearts === 0;

/**
 * 所有至少覆盖到一个界内格的锚点。
 * 因为不设边界，锚点本身可以落在矩阵外（例如只让形状的一角擦到边缘）。
 */
export function allAnchors(matrix, shape) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const seen = new Set();
  const anchors = [];
  for (const [dr, dc] of shape.offsets)
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const ar = r - dr;
        const ac = c - dc;
        const key = `${ar},${ac}`;
        if (seen.has(key)) continue;
        seen.add(key);
        anchors.push([ar, ac]);
      }
  return anchors;
}

/** 按伤害（削减的格值总量）从高到低列出落点，用于怪物瞄准与测试。 */
export function rankPlacements(matrix, shape, options) {
  return allAnchors(matrix, shape)
    .map(([r, c]) => {
      const hits = resolveHits(matrix, shape, r, c, options);
      const damage = hits.reduce((sum, h) => sum + (h.before - h.after), 0);
      return { r, c, hits, damage };
    })
    .filter((p) => p.damage > 0)
    .sort((a, b) => b.damage - a.damage);
}

/** 形状最远覆盖距离，用于在界面中给矩阵留出可悬停的“界外”边距。 */
export function reach(shape) {
  let up = 0;
  let down = 0;
  let left = 0;
  let right = 0;
  for (const [dr, dc] of shape.offsets) {
    up = Math.max(up, -dr);
    down = Math.max(down, dr);
    left = Math.max(left, -dc);
    right = Math.max(right, dc);
  }
  return { up, down, left, right };
}

/** 由相对锚点的偏移量重新组装形状（变形后使用）。 */
export function shapeFromOffsets(offsets) {
  const minR = Math.min(...offsets.map(([r]) => r));
  const minC = Math.min(...offsets.map(([, c]) => c));
  const maxR = Math.max(...offsets.map(([r]) => r));
  const maxC = Math.max(...offsets.map(([, c]) => c));
  const cells = offsets.map(([r, c]) => [r - minR, c - minC]);
  const pivot = [0 - minR + 0, 0 - minC + 0];
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const filled = new Set(cells.map(([r, c]) => `${r},${c}`));
  const art = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const isPivot = r === pivot[0] && c === pivot[1];
      if (filled.has(`${r},${c}`)) return isPivot ? "@" : "#";
      return isPivot ? "o" : ".";
    }).join(""),
  );
  return { art, cells, offsets: offsets.map(([r, c]) => [r, c]), pivot, rows, cols, size: cells.length };
}

/**
 * 变形：先左右镜像，再顺时针旋转 rot×90°。变形始终围绕锚点进行。
 * 只有获得了对应强化的武器才会在战斗中用到这里。
 */
export function transformShape(shape, { rot = 0, flip = false } = {}) {
  const turns = ((rot % 4) + 4) % 4;
  if (!turns && !flip) return shape;
  let offsets = shape.offsets.map(([r, c]) => [r, flip ? -c : c]);
  for (let i = 0; i < turns; i += 1) offsets = offsets.map(([r, c]) => [c, -r]);
  return shapeFromOffsets(offsets.map(([r, c]) => [r + 0, c + 0]));
}

/** 与平移无关的形状指纹：用来判断两种朝向是否其实是同一个形状。 */
export function shapeKey(shape) {
  return shape.cells
    .map(([r, c]) => `${r},${c}`)
    .sort()
    .join("|");
}
