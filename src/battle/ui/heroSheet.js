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
 *   闲置    同样的一行，颜色淡一些；在“出战”“闲置”之间拖动即可换装（拖放逻辑见 dragLoadout.js）
 *   技能    出战 / 闲置两段，同样可以拖动；右侧是剩余次数方块
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
export function heroSheetHtml({ hero, features, kicker, sheetHead, carries = { plates: false } }) {
  return `
    ${sheetHead("武器与构筑")}
    ${kicker("01", "主角", "HERO")}
    ${heroBlock(hero, features, carries)}
    ${kicker("02", "出战", "ARSENAL", `<em class="slot-count">${hero.equipped.length} / ${hero.slots}</em><button class="build-chip" data-cmd="armory" title="构筑">${icon("bag")}构筑</button>`)}
    ${dropList("weapon", "on", hero.equipped.map((id, i) => weaponRow(id, i, hero.upgrades, "on")))}
    ${idleWeapons(hero)}
    ${skillBlock(hero, kicker)}
    ${legend(hero)}
    <button class="primary sheet-build" data-cmd="armory">${icon("bag")}<span>构筑 · 更换出战武器与技能</span><span aria-hidden="true">→</span></button>`;
}

/**
 * 主角：名字与红心数在同一行；下面是缩略心阵和一张小表（道具与防御）。
 * 护甲片这一行按本章地图是否有护甲片决定（carries.plates），整章固定占位，拾取时面板不会被撑高。
 */
function heroBlock(hero, features, carries) {
  const { hearts, slots } = countHearts(hero.matrix);
  const low = hearts / slots < 0.35;
  const stats = [
    features.has("potion")
      ? `<button class="hud-stat" data-cmd="potion" ${hero.potions && hearts < slots ? "" : "disabled"} title="喝药水（P）">${icon("potion")}<span>药水</span><b>${hero.potions}</b></button>`
      : "",
    `<span class="hud-stat ${hero.keys ? "" : "off"}" title="钥匙">${icon("key")}<span>钥匙</span><b>${hero.keys}</b></span>`,
    carries.plates || hero.plates
      ? `<button class="hud-stat" data-cmd="armor" ${hero.plates ? "" : "disabled"} title="使用护甲片（G）">${icon("armor")}<span>护甲片</span><b>${hero.plates}</b></button>`
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

/**
 * 一段可以拖放的列表。kind：weapon / skill；zone：on 出战 / off 闲置。
 * 空列表也保留一块放置区，拖进来就能换上或换下。
 */
function dropList(kind, zone, rows, extraClass = "") {
  const empty = zone === "on" ? "拖到这里出战" : "拖到这里换下";
  return `<ul class="sheet-list ${extraClass} zone-${zone}" data-drop-kind="${kind}" data-drop-zone="${zone}">${rows.join("") || `<li class="drop-empty">${empty}</li>`}</ul>`;
}

/** 拖动时抓住的那一行：带上种类、所在段和 id。 */
const dragAttrs = (kind, zone, id) => `data-drag-kind="${kind}" data-drag-zone="${zone}" data-drag-id="${id}"`;

/** 武器的一行：快捷键（闲置的不显示）· 形状 · 名字 · 充能消耗 ……… 强化标记。 */
function weaponRow(id, i, upgrades, zone) {
  const w = WEAPONS[id];
  return `<li title="${w.desc}" ${dragAttrs("weapon", zone, id)}>
    ${zone === "on" ? `<kbd class="wi key-hint">${i + 1}</kbd>` : '<span class="wi"></span>'}
    <span class="ws">${shapeSvg(weaponShape(id, upgrades), { cell: 7, gap: 1.5 })}</span>
    <span class="wn">${w.name}</span>
    ${costMarks(weaponCost(id))}
    <span class="ups">${upLogos(upgradeKeys(id, upgrades))}</span>
  </li>`;
}

/** 背包里还没带上的武器：同样一行一件，放在“闲置”小标题下面。只有一件武器时不显示这一段。 */
function idleWeapons(hero) {
  const idle = hero.weapons.filter((id) => !hero.equipped.includes(id));
  if (hero.weapons.length < 2) return "";
  return `<div class="idle-label">${icon("bag")}<span>闲置</span><em>拖动换装</em></div>${dropList("weapon", "off", idle.map((id, i) => weaponRow(id, i, hero.upgrades, "off")), "idle")}`;
}

/** 技能：出战 / 闲置两段，右侧是剩余次数方块。还没学会技能时整段不显示。 */
function skillBlock(hero, kicker) {
  const owned = Object.keys(hero.skills);
  if (!owned.length) return "";
  const row = (id, zone) => {
    const sk = SKILLS[id];
    const left = hero.skills[id];
    return `<li class="${left ? "" : "spent"}" title="${sk.desc}" ${dragAttrs("skill", zone, id)}>
        <span class="wi">${icon("skill")}</span>
        <span class="ws">${shapeSvg(sk.shape, { cell: 7, gap: 1.5, tone: "skill" })}</span>
        <span class="wn">${sk.name}</span>
        <span class="ups">${chargePips(left, sk.charges)}</span>
      </li>`;
  };
  const idle = owned.filter((id) => !hero.equippedSkills.includes(id));
  return `${kicker("03", "技能", "SKILLS", `<em class="slot-count">${hero.equippedSkills.length} / ${SKILL_SLOTS}</em>`)}
    ${dropList("skill", "on", hero.equippedSkills.map((id) => row(id, "on")), "skills")}
    ${owned.length > hero.equippedSkills.length || hero.equippedSkills.length ? `<div class="idle-label">${icon("bag")}<span>闲置</span></div>${dropList("skill", "off", idle.map((id) => row(id, "off")), "skills idle")}` : ""}`;
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
