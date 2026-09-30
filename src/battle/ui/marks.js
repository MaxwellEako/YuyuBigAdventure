import { icon } from "./icons.js";
import { WEAPONS } from "../data/weapons.js";
import { UPGRADE_TEXT, isAdvanced } from "../logic/arsenal.js";
import { ENERGY_COST } from "../logic/combat.js";

/**
 * 战斗、武器面板、构筑页共用的小标记。
 * 同一种信息在所有界面上画成同一个样子，玩家认一次就够了：
 *  - 强化：黑底白色图标的小方块（基础强化）；蓝底白色图标加一圈描边（进阶强化）
 *  - 充能消耗：蓝色小菱形，几个菱形就消耗几点
 *  - 冷却：灰色遮罩 + 沙漏 + 剩余回合数
 *  - 技能次数：一排小方块，实心是还能用的次数，空心是已经用掉的
 */

/**
 * 一件武器身上的强化标记（含破甲锥这种天生破甲），返回强化的 key 列表；进阶强化排在前面。
 * @param {string} id 武器 id
 * @param {object} upgrades 主角的强化表：{ 武器id: { rotate: true, ... } }
 * @param {{ passive?: boolean }} opts passive 为 true 时去掉旋转、镜像、延长、巨化这类战斗中用按钮切换的强化
 *   （招式卡上不画它们：选中武器后就会出现对应的按钮）
 */
export function upgradeKeys(id, upgrades, { passive = false } = {}) {
  const own = Object.keys(UPGRADE_TEXT).filter((k) => upgrades?.[id]?.[k] && !(passive && UPGRADE_TEXT[k].toggle));
  // 天生破甲的武器也画一枚破甲标记，但不要和强化出来的破甲重复。
  if (WEAPONS[id]?.pierce && !own.includes("pierce")) own.push("pierce");
  return [...own.filter(isAdvanced), ...own.filter((k) => !isAdvanced(k))];
}

/** 单枚强化标记：基础强化黑底白色图标，进阶强化蓝底白色图标加描边；鼠标悬停显示名称。 */
export const upLogo = (key) =>
  `<i class="up-icon ${isAdvanced(key) ? "adv" : ""}" title="${UPGRADE_TEXT[key].name}${isAdvanced(key) ? "（进阶）" : ""}">${icon(UPGRADE_TEXT[key].icon)}</i>`;

/** 一组强化标记。 */
export const upLogos = (keys) => keys.map(upLogo).join("");

/** 武器每次出手消耗的充能点数（轻武器为 0）。 */
export const weaponCost = (id) => ENERGY_COST[WEAPONS[id]?.weight] ?? 0;

/** 充能消耗：n 个蓝色小菱形；不消耗时返回空串。 */
export const costMarks = (n) =>
  n ? `<span class="cost" title="每次消耗 ${n} 点充能">${Array.from({ length: n }, () => icon("energy")).join("")}</span>` : "";

/** 冷却遮罩：盖在按钮上的灰色半透明层，中间是沙漏和剩余回合数。按钮需要 position: relative。 */
export const cdMask = (n) =>
  n > 0 ? `<span class="cd-mask" title="冷却中，还需 ${n} 回合">${icon("cd")}<b>${n}</b></span>` : "";

/** 冷却标记（不遮挡内容的版本，用在清单里）：沙漏 + 回合数。 */
export const cdMark = (n) => (n > 0 ? `<span class="cd-mark" title="冷却 ${n} 回合">${icon("cd")}<b>${n}</b></span>` : "");

/**
 * 技能剩余次数：total 个小方块，前 left 个是实心。
 * @param {number} left 剩余次数
 * @param {number} total 每章的总次数
 */
export const chargePips = (left, total) =>
  `<span class="pips" title="剩余 ${left} / ${total} 次">${Array.from({ length: Math.max(left, total) }, (_, i) => `<i class="${i < left ? "on" : ""}"></i>`).join("")}</span>`;
