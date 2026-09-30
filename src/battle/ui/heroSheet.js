import { icon, shapeSvg, matrixSvg } from "./icons.js";
import { upgradeKeys, upLogo, upLogos, costMarks, weaponCost, cdMark, chargePips } from "./marks.js";
import { WEAPONS, SHIELD } from "../data/weapons.js";
import { SKILLS } from "../data/skills.js";
import { getHeroName } from "../data/heroName.js";
import { countHearts } from "../logic/shapes.js";
import { weaponShape, UPGRADE_TEXT, SKILL_SLOTS } from "../logic/arsenal.js";

/**
 * “武器与构筑”面板：电脑上是左侧常驻面板，手机上是从底部拉出的窄卡。
 * 两处用同一份 HTML，样式见 sheet.css。自上而下：
 *   主角    名字 · 红心 / 总数（同一行）
 *           缩略心阵 │ 药水 · 钥匙 · 护甲片 · 防御冷却
 *   出战    一行一件：形状 · 名字 · 充能菱形 ……… 强化标记（黑底白色图标）
 *   技能    一行一个：形状 · 名字 ……… 剩余次数方块
 *   图例    只列出上面出现过的强化标记，写明各自的作用
 *   构筑    底部主按钮
 */

/**
 * @param {object} p
 * @param {object} p.hero 棋盘上的主角（矩阵、武器、技能、强化、道具）
 * @param {Set<string>} p.features 已解锁的机制
 * @param {(nb: string, zh: string, en: string, extra?: string) => string} p.kicker 统一风格的小标题
 * @param {(title: string) => string} p.sheetHead 手机抽屉顶部的标题栏
 */
export function heroSheetHtml({ hero, features, kicker, sheetHead }) {
  return `
    ${sheetHead("武器与构筑")}
    ${kicker("01", "主角", "HERO")}
    ${heroBlock(hero, features)}
    ${kicker("02", "出战", "ARSENAL", `<em class="slot-count">${hero.equipped.length} / ${hero.slots}</em><button class="build-chip" data-cmd="armory" title="构筑">${icon("bag")}构筑</button>`)}
    <ul class="sheet-list">${hero.equipped.map((id, i) => weaponRow(id, i, hero.upgrades)).join("")}</ul>
    ${bagLine(hero)}
    ${skillBlock(hero, kicker)}
    ${legend(hero)}
    <button class="primary sheet-build" data-cmd="armory">${icon("bag")}<span>构筑 · 更换出战武器与技能</span><span aria-hidden="true">→</span></button>`;
}

/** 主角：名字与红心数在同一行；下面是缩略心阵和一张小表（道具与防御）。 */
function heroBlock(hero, features) {
  const { hearts, slots } = countHearts(hero.matrix);
  const low = hearts / slots < 0.35;
  const stats = [
    features.has("potion")
      ? `<button class="hud-stat" data-cmd="potion" ${hero.potions && hearts < slots ? "" : "disabled"} title="喝药水（P）">${icon("potion")}<span>药水</span><b>${hero.potions}</b></button>`
      : "",
    `<span class="hud-stat ${hero.keys ? "" : "off"}" title="钥匙">${icon("key")}<span>钥匙</span><b>${hero.keys}</b></span>`,
    hero.plates
      ? `<button class="hud-stat" data-cmd="armor" title="使用护甲片（G）">${icon("armor")}<span>护甲片</span><b>${hero.plates}</b></button>`
      : "",
    features.has("shield")
      ? `<span class="hud-stat" title="${SHIELD.desc}每次使用后冷却 ${SHIELD.cooldown} 回合。">${icon("shield")}<span>${SHIELD.name}</span><b>${cdMark(SHIELD.cooldown)}</b></span>`
      : "",
  ].join("");
  return `
    <div class="hud-id">
      <b class="hud-id-name">${getHeroName()}</b>
      <span class="hud-id-hp ${low ? "low" : ""}"><span class="num">${hearts}</span><span class="of">/ ${slots}</span></span>
    </div>
    <div class="hud-body">
      <div class="hud-matrix" title="${getHeroName()}的红心矩阵 · ${hero.matrix.length}×${hero.matrix[0].length}">${matrixSvg(hero.matrix, { cell: 8, gap: 2 })}</div>
      <div class="hud-stats">${stats}</div>
    </div>`;
}

/** 出战武器的一行：快捷键 · 形状 · 名字 · 充能消耗 ……… 强化标记。 */
function weaponRow(id, i, upgrades) {
  const w = WEAPONS[id];
  return `<li title="${w.desc}">
    <kbd class="wi key-hint">${i + 1}</kbd>
    <span class="ws">${shapeSvg(weaponShape(id, upgrades), { cell: 7, gap: 1.5 })}</span>
    <span class="wn">${w.name}</span>
    ${costMarks(weaponCost(id))}
    <span class="ups">${upLogos(upgradeKeys(id, upgrades))}</span>
  </li>`;
}

/** 背包里还没带上的武器：一排小形状。 */
function bagLine(hero) {
  const idle = hero.weapons.filter((id) => !hero.equipped.includes(id));
  if (!idle.length) return "";
  const shapes = idle
    .map((id) => `<span title="${WEAPONS[id].name}">${shapeSvg(weaponShape(id, hero.upgrades), { cell: 6, gap: 1.5 })}</span>`)
    .join("");
  return `<p class="bag-line" title="背包">${icon("bag")}${shapes}</p>`;
}

/** 技能：一行一个，右侧是剩余次数方块。还没学会技能时整段不显示。 */
function skillBlock(hero, kicker) {
  if (!Object.keys(hero.skills).length) return "";
  const rows = hero.equippedSkills
    .map((id) => {
      const sk = SKILLS[id];
      const left = hero.skills[id];
      return `<li class="${left ? "" : "spent"}" title="${sk.desc}">
        <span class="wi">${icon("skill")}</span>
        <span class="ws">${shapeSvg(sk.shape, { cell: 7, gap: 1.5, tone: "skill" })}</span>
        <span class="wn">${sk.name}</span>
        <span class="ups">${chargePips(left, sk.charges)}</span>
      </li>`;
    })
    .join("");
  return `${kicker("03", "技能", "SKILLS", `<em class="slot-count">${hero.equippedSkills.length} / ${SKILL_SLOTS}</em>`)}<ul class="sheet-list skills">${rows}</ul>`;
}

/** 图例：只列出出战武器身上出现过的强化，说明书式“标记 · 名称 · 作用”。 */
function legend(hero) {
  const keys = new Set(hero.equipped.flatMap((id) => upgradeKeys(id, hero.upgrades)));
  if (!keys.size) return "";
  // 按 UPGRADE_TEXT 的固定顺序排列，不随装备顺序跳动。
  const items = Object.keys(UPGRADE_TEXT)
    .filter((k) => keys.has(k))
    .map((k) => `<li>${upLogo(k)}<b>${UPGRADE_TEXT[k].name}</b><span>${UPGRADE_TEXT[k].desc}</span></li>`)
    .join("");
  return `<ul class="up-legend" aria-label="强化标记说明">${items}</ul>`;
}
