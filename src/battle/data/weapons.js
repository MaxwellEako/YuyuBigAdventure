import { parseShape } from "../logic/shapes.js";

/**
 * 主角武器。cooldown 表示使用后需要等待的己方回合数。
 * 形状锚点（@）就是鼠标悬停的那一格，形状默认保持字符画里的朝向。
 * plus：“增加一格攻击范围”强化后的形状；transforms：该武器可以获得的变形强化
 * （2×2 的战锤和对称的圣十字变形后形状不变，所以没有变形强化）。
 */
export const WEAPONS = {
  dagger: {
    id: "dagger",
    name: "短剑",
    art: ["@#"],
    plus: ["@##"],
    transforms: ["rotate"],
    cooldown: 0,
    desc: "横劈两格，不需要冷却。",
  },
  hook: {
    id: "hook",
    name: "L 钩镰",
    art: ["@#", "#."],
    plus: ["@##", "#.."],
    transforms: ["rotate", "mirror"],
    cooldown: 1,
    desc: "钩住一角，L 形三格。",
  },
  spear: {
    id: "spear",
    name: "长枪",
    art: ["#", "@", "#"],
    plus: ["#", "@", "#", "#"],
    transforms: ["rotate"],
    cooldown: 1,
    desc: "直刺竖向三格。",
  },
  hammer: {
    id: "hammer",
    name: "战锤",
    art: ["@#", "##"],
    plus: ["@##", "##."],
    transforms: [],
    cooldown: 2,
    desc: "砸下 2×2 的一块。",
  },
  scythe: {
    id: "scythe",
    name: "月镰",
    art: ["#..", ".@.", "..#"],
    plus: ["#...", ".@..", "..#.", "...#"],
    transforms: ["mirror"],
    cooldown: 1,
    desc: "斜斩三格。",
  },
  awl: {
    id: "awl",
    name: "破甲锥",
    art: ["@", "#"],
    plus: ["@", "#", "#"],
    transforms: ["rotate"],
    cooldown: 1,
    pierce: true,
    desc: "竖刺两格，护甲一击即碎。",
  },
  cross: {
    id: "cross",
    name: "圣十字",
    art: [".#.", "#@#", ".#."],
    plus: [".#.", "#@#", ".#.", ".#."],
    transforms: [],
    cooldown: 3,
    desc: "十字五格。",
  },
};

for (const weapon of Object.values(WEAPONS)) {
  weapon.shape = parseShape(weapon.art);
  weapon.plusShape = parseShape(weapon.plus);
}

/** 木盾与药水不是武器，但同样有形状/冷却，放在一起便于界面统一渲染。 */
export const SHIELD = {
  name: "木盾",
  cooldown: 3,
  desc: "挡下一次攻击，举盾不占回合。",
};

export const POTION = {
  name: "红心药水",
  shape: parseShape([".#.", "#@#", ".#."]),
  desc: "补回十字范围的红心。",
};

export const STARTING_WEAPONS = ["dagger", "hook"];
