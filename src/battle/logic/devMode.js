import { getHeroName } from "../data/heroName.js";
import { WEAPONS } from "../data/weapons.js";
import { SKILLS } from "../data/skills.js";
import { UPGRADE_TEXT, upgradeAllowed, MAX_WEAPON_SLOTS, SKILL_SLOTS } from "./arsenal.js";

/**
 * 开发者模式：主角名正好是管理员名字时开启，方便测试关卡与构筑。
 *   - 所有章节都可以直接选择；
 *   - 拥有全部武器、全部技能，每件武器拿满它能拿到的全部强化，武器槽开到最多；
 *   - 不写入正式存档（星级、解锁进度、构筑、铁砧记录都不变），换回普通名字后一切照旧。
 *
 * 注意：这只是起名时的一个开关，网页游戏的代码对所有人可见，它不是安全措施。
 */

/** 管理员名字：起名时输入它即进入开发者模式（区分大小写）。 */
export const DEV_NAME = "xrephmos_admin";

/** 当前是不是开发者模式。 */
export const isDevMode = () => getHeroName() === DEV_NAME;

/**
 * 开发者的满配构筑：全部武器、全部技能，每件武器拿满所有允许的强化。
 * 强化的前置条件（例如巨化要先有延长）按 UPGRADE_TEXT 的顺序逐项检查，所以延长会先于巨化加上。
 * 返回值的字段与正式存档里的 profile 相同，可以直接交给 createBoard。
 */
export function devLoadout() {
  const weapons = Object.keys(WEAPONS);
  // 技能和正式存档一样只记 id，次数在每章开始时补满。
  const skills = Object.keys(SKILLS);
  const upgrades = {};
  for (const id of weapons)
    for (const kind of Object.keys(UPGRADE_TEXT))
      if (upgradeAllowed(id, kind, {}, upgrades)) upgrades[id] = { ...(upgrades[id] ?? {}), [kind]: true };
  return {
    weapons,
    skills,
    upgrades,
    equipped: weapons.slice(0, MAX_WEAPON_SLOTS),
    equippedSkills: skills.slice(0, SKILL_SLOTS),
    slots: MAX_WEAPON_SLOTS,
  };
}
