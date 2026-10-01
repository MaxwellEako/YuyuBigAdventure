import { MONSTERS, MOVE_SETS } from "../data/monsters.js";
import { GLYPH, MOVE_TEXT } from "./battleView.js";

/**
 * 棋子走法图例：每种走法画一张 5×5 的小棋盘，棋子在正中，下一步能落脚的格子涂蓝，
 * 下面写走法名称和按这种走法移动的怪物。格子直接由 MOVE_SETS（怪物真正的移动规则）算出来，
 * 改了移动规则，图例自动跟着变。暗王等首领不列名字（首领的情报对玩家隐藏）。
 */

/** 图例里的展示顺序：先最常见的直行，再到这一章新出现的马步，最后斜行与八方。 */
const ORDER = ["orth", "knight", "diag", "king"];
/** 小棋盘的边长（格）：马步最远偏移 2 格，5×5 正好放得下。 */
const SIZE = 5;

/** 一张小棋盘：center 处放棋子图标，moves 里的每个偏移量对应的格子标为可落脚。 */
function miniBoard(moves, glyph) {
  const mid = Math.floor(SIZE / 2);
  const reach = new Set(moves.map(([dr, dc]) => `${mid + dr},${mid + dc}`));
  let cells = "";
  for (let r = 0; r < SIZE; r += 1)
    for (let c = 0; c < SIZE; c += 1) {
      const center = r === mid && c === mid;
      // 棋盘本身深浅相间，和 3D 棋盘的配色一致。
      const shade = (r + c) % 2 ? "dark" : "";
      const cls = center ? "piece" : reach.has(`${r},${c}`) ? "reach" : shade;
      cells += `<i class="${cls}">${center ? glyph : ""}</i>`;
    }
  return `<div class="move-board" style="grid-template-columns:repeat(${SIZE}, 1fr)">${cells}</div>`;
}

/** 整张图例：每种走法一格，名称 + 按这种走法移动的（非首领）怪物；小棋盘中间优先画棋子（墨渍怪不是棋子）。 */
export function moveLegendHtml() {
  const figures = ORDER.filter((kind) => MOVE_SETS[kind]).map((kind) => {
    const defs = Object.values(MONSTERS).filter((def) => def.moves === kind && !def.boss);
    if (!defs.length) return "";
    return `<figure class="move-figure">
      ${miniBoard(MOVE_SETS[kind], GLYPH[(defs.find((def) => def.model !== "ink") ?? defs[0]).model] ?? "")}
      <figcaption><b>${MOVE_TEXT[kind]}</b><span>${defs.map((def) => def.name).join("、")}</span></figcaption>
    </figure>`;
  });
  return `<div class="move-legend">${figures.join("")}</div>`;
}
