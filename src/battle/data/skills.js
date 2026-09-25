import { parseShape } from "../logic/shapes.js";

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
    desc: "横斩两格，随后再攻击一次。",
  },
  stun: {
    id: "stun",
    name: "定身钉",
    art: ["@"],
    charges: 1,
    effect: "stun",
    desc: "钉住一格，怪物停下一回合。",
  },
  meteor: {
    id: "meteor",
    name: "陨星",
    art: ["###", "#@#", "###"],
    charges: 1,
    effect: "big",
    desc: "砸下 3×3 的一片。",
  },
  drain: {
    id: "drain",
    name: "汲血",
    art: ["#", "@", "#"],
    charges: 1,
    effect: "drain",
    desc: "竖刺三格，打碎几颗红心就补回几颗。",
  },
};

for (const skill of Object.values(SKILLS)) skill.shape = parseShape(skill.art);
