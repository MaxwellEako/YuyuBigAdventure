import { shapeSvg, matrixSvg } from "./icons.js";
import { INTENT_TEXT } from "../data/monsters.js";
import { countHearts } from "../logic/shapes.js";

/**
 * 怪物情报：招式循环 + 心阵缩略图。
 * 电脑上悬停怪物时的情报卡、手机“目标”抽屉里点开的那一行、战斗中点怪物名字弹出的小卡，
 * 三处都用这里的同一份 HTML，玩家在哪儿看到的情报都长一个样。
 * 首领（暗王）的情报一律隐藏。
 */

/**
 * 招式循环清单：一招一行，攻击画出形状，其余招式画一个小黑方块。
 * @param {object} def 怪物定义
 * @param {number} now 当前这一招在循环里的下标（-1 表示不标出）
 */
export function patternListHtml(def, now = -1) {
  return `<ul class="intel-moves">${def.pattern
    .map((p, i) => {
      const glyph = p.kind === "attack" ? shapeSvg(p.shape, { cell: 7, gap: 1.5, tone: "enemy", pivot: false }) : '<i class="dot"></i>';
      // 下一招前面加一个“NEXT”小标，让玩家知道循环走到了哪里。
      const tag = i === now ? '<em class="intel-next">NEXT</em>' : "";
      return `<li class="${i === now ? "now" : ""}">${glyph}<span><b>${p.name}</b> ${INTENT_TEXT[p.kind](p)}</span>${tag}</li>`;
    })
    .join("")}</ul>`;
}

/**
 * 情报正文：左边心阵缩略图，右边招式循环。
 * @param {{ def: object, matrix: number[][] }} monster
 * @param {{ now?: number, cell?: number }} opts now 当前招式下标；cell 缩略图格子大小
 */
export function intelBodyHtml(monster, { now = -1, cell = 13 } = {}) {
  if (monster.def.boss) return '<p class="intel-unknown t-meta">情报不明</p>';
  const { armor } = countHearts(monster.matrix);
  return `<div class="tip-body">
      <div class="tip-matrix">${matrixSvg(monster.matrix, { cell, gap: cell * 0.2 })}<span class="t-meta">${armor ? `ARMOR ${armor}` : "HP MATRIX"}</span></div>
      ${patternListHtml(monster.def, now)}
    </div>`;
}
