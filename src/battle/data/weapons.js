import { parseShape } from "../logic/shapes.js";

/**
 * 主角武器。cooldown 表示使用后需要等待的己方回合数。
 * weight：light 轻武器（两格、无冷却，刷连击的主力，不能延长、不能破甲）；
 *         medium 中型（接招）；heavy 重武器（一下打得多，花两点充能，打碎 3 颗心能打断怪物蓄力后的重击）。
 * 形状锚点（@）就是鼠标悬停的那一格，形状默认保持字符画里的朝向。
 * plus：“增加一格攻击范围”强化后的形状；transforms：该武器可以获得的变形强化
 * （2×2 的战锤和对称的圣十字变形后形状不变，所以没有变形强化）。
 */
export const WEAPONS = {
  dagger: {
    id: "dagger",
    weight: "light",
    name: "短剑",
    art: ["@#"],
    plus: ["@##"],
    transforms: ["rotate"],
    cooldown: 0,
    desc: "横向攻击两格。",
  },
  slash: {
    id: "slash",
    weight: "light",
    name: "斜刃",
    art: ["@.", ".#"],
    plus: ["@..", ".#.", "..#"],
    transforms: ["mirror"],
    cooldown: 0,
    desc: "斜向攻击两格。",
  },
  hook: {
    id: "hook",
    weight: "medium",
    name: "L 钩镰",
    art: ["@#", "#."],
    plus: ["@##", "#.."],
    transforms: ["rotate", "mirror"],
    cooldown: 1,
    desc: "L 形攻击三格。",
  },
  spear: {
    id: "spear",
    weight: "medium",
    name: "长枪",
    art: ["#", "@", "#"],
    plus: ["#", "@", "#", "#"],
    transforms: ["rotate"],
    cooldown: 1,
    desc: "纵向攻击三格。",
  },
  hammer: {
    id: "hammer",
    weight: "heavy",
    name: "战锤",
    art: ["@##", "###", "###"],
    // 重武器一下砸一大片：战锤 3×3，延长后 4×3。
    plus: ["@###", "####", "####"],
    transforms: [],
    cooldown: 1,
    desc: "攻击 3×3 范围，可打断重击。",
  },
  scythe: {
    id: "scythe",
    weight: "medium",
    name: "月镰",
    art: ["#..", ".@.", "..#"],
    plus: ["#...", ".@..", "..#.", "...#"],
    transforms: ["mirror"],
    cooldown: 1,
    desc: "斜向攻击三格。",
  },
  awl: {
    id: "awl",
    weight: "medium",
    name: "破甲锥",
    art: ["@", "#"],
    plus: ["@", "#", "#"],
    transforms: ["rotate"],
    cooldown: 1,
    pierce: true,
    desc: "纵向攻击两格，一击消除护甲心。",
  },
  cross: {
    id: "cross",
    weight: "heavy",
    name: "圣十字",
    art: ["..#..", "..#..", "##@##", "..#..", "..#.."],
    // 圣十字四条臂各两格，延长后各三格。
    plus: ["...#...", "...#...", "...#...", "###@###", "...#...", "...#...", "...#..."],
    transforms: [],
    cooldown: 1,
    desc: "十字形攻击九格，可打断重击。",
  },
};

for (const weapon of Object.values(WEAPONS)) {
  weapon.shape = parseShape(weapon.art);
  weapon.plusShape = parseShape(weapon.plus);
}

/** 防御与药水不是武器，但同样有形状/冷却，放在一起便于界面统一渲染。 */
export const SHIELD = {
  name: "防御",
  cooldown: 3,
  desc: "抵挡下一次攻击，不消耗回合。",
};

export const POTION = {
  name: "红心药水",
  shape: parseShape([".#.", "#@#", ".#."]),
  desc: "恢复十字范围内的红心。",
};

export const STARTING_WEAPONS = ["dagger", "hook"];
