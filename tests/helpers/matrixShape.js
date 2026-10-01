import { VOID } from "../../src/battle/logic/shapes.js";

/**
 * 心阵“长相”的检查工具（只给测试和生成器用，不进游戏包）。
 *
 * 玩家的直觉是“每一击都要挨着上一击”，而“挨着”指的是上下左右相邻。
 * 所以心阵的主体必须由上下左右相邻的心连成一整片：
 *   - 连通：只按上下左右算，整片心阵是一块，不能断成几块；
 *   - 没有孤立的心：每颗心至少有一个上下左右的邻居；
 *   - 细枝不能太多：只有 0～1 个上下左右邻居的心，最多占三分之一（斜向只做轮廓的边，不做主体）；
 *   - 对称：普通怪物左右对称或中心对称，保持“符号感”。
 */

/** 上下左右四个方向。 */
const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 这一格有没有心（护甲心也算心）。 */
const isHeart = (matrix, r, c) => (matrix[r]?.[c] ?? VOID) > VOID;

/** 列出所有心的坐标。 */
function heartCells(matrix) {
  const cells = [];
  matrix.forEach((row, r) => row.forEach((_, c) => isHeart(matrix, r, c) && cells.push([r, c])));
  return cells;
}

/** 一颗心有几个上下左右的邻居。 */
const orthogonalDegree = (matrix, [r, c]) => ORTHOGONAL.filter(([dr, dc]) => isHeart(matrix, r + dr, c + dc)).length;

/** 按上下左右相邻数连通块（广度优先搜索）。 */
function countComponents(matrix, cells) {
  const seen = new Set();
  let components = 0;
  for (const [r0, c0] of cells) {
    if (seen.has(`${r0},${c0}`)) continue;
    components += 1;
    const queue = [[r0, c0]];
    seen.add(`${r0},${c0}`);
    while (queue.length) {
      const [r, c] = queue.pop();
      for (const [dr, dc] of ORTHOGONAL) {
        const key = `${r + dr},${c + dc}`;
        if (isHeart(matrix, r + dr, c + dc) && !seen.has(key)) {
          seen.add(key);
          queue.push([r + dr, c + dc]);
        }
      }
    }
  }
  return components;
}

/** 左右对称：每一行左右翻转后有心的位置不变。 */
export const isMirrorSymmetric = (matrix) =>
  matrix.every((row, r) => row.every((_, c) => isHeart(matrix, r, c) === isHeart(matrix, r, row.length - 1 - c)));

/** 中心对称：绕中心旋转 180° 后有心的位置不变。 */
export const isPointSymmetric = (matrix) =>
  matrix.every((row, r) => row.every((_, c) => isHeart(matrix, r, c) === isHeart(matrix, matrix.length - 1 - r, row.length - 1 - c)));

/**
 * 量一量心阵的形状。
 * @returns {{ hearts: number, components: number, isolated: number, weak: number }}
 *   hearts 心数；components 上下左右连通块数；isolated 没有上下左右邻居的心；weak 只有 0～1 个上下左右邻居的心
 */
export function measureShape(matrix) {
  const cells = heartCells(matrix);
  const degrees = cells.map((cell) => orthogonalDegree(matrix, cell));
  return {
    hearts: cells.length,
    components: countComponents(matrix, cells),
    isolated: degrees.filter((d) => d === 0).length,
    weak: degrees.filter((d) => d <= 1).length,
  };
}

/** 形状是否合格：连成一片、没有孤立的心、细枝不超过三分之一。不合格时返回原因，合格返回 null。 */
export function shapeProblem(matrix) {
  const { hearts, components, isolated, weak } = measureShape(matrix);
  if (components !== 1) return `断成 ${components} 块`;
  if (isolated) return `有 ${isolated} 颗孤立的心`;
  if (weak * 3 > hearts) return `${weak} / ${hearts} 颗心只挨着一颗心`;
  return null;
}

/**
 * 一档心阵首次登场时的通关标准（测试与生成器共用）：
 *   - 后期（rank 2），或者手里只有两件武器的早期章节：4 回合内连出一次追击即可；
 *   - 其余：6 回合内用一条不断的连击整片拼完，而且要比短剑硬磨快。
 * @param {number} rank 心阵档位
 * @param {string[]} owned 当时拥有的武器
 */
export const matrixGoal = (rank, owned) =>
  rank >= 2 || owned.length <= 2 ? { until: "chase", maxTurns: 4, beatGrind: false } : { until: "won", maxTurns: 6, beatGrind: true };
