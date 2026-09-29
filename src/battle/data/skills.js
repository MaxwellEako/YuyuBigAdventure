import { parseShape } from "../logic/shapes.js";
import { getHeroName } from "./heroName.js";

/**
 * 技能：每章可用次数有限的特殊攻击，每章开始时次数恢复。
 * effect：big 大范围；extra 用完后可以立刻再用一次普通武器；stun 怪物跳过下一次行动；drain 按消除的红心数恢复自己的红心。
 */
export const SKILLS = {
  swift: {
    id: "swift",
    name: "疾风斩",
    art: ["@#"],
    charges: 2,
    effect: "extra",
    desc: "横向攻击两格，之后可追加一次攻击。",
  },
  stun: {
    id: "stun",
    name: "定身钉",
    art: ["@"],
    charges: 1,
    effect: "stun",
    desc: "攻击一格，使怪物停止行动一回合。",
  },
  crush: {
    id: "crush",
    name: "碎甲",
    art: ["@#"],
    charges: 2,
    effect: "pierce",
    pierce: true,
    desc: "攻击两格，一击消除护甲心。",
  },
  meteor: {
    id: "meteor",
    name: "陨星",
    art: ["###", "#@#", "###"],
    charges: 1,
    effect: "big",
    desc: "攻击 3×3 范围。",
  },
  drain: {
    id: "drain",
    name: "汲血",
    art: ["#", "@", "#"],
    charges: 1,
    effect: "drain",
    get desc() {
      return `纵向攻击三格，每消除 1 颗红心，${getHeroName()}恢复 1 颗。`;
    },
  },
};

for (const skill of Object.values(SKILLS)) skill.shape = parseShape(skill.art);
