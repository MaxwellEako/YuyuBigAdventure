import { parseShape, parseMatrix } from "../logic/shapes.js";

/**
 * 被墨迹侵蚀的棋子。每种怪物有独立形状的生命矩阵、循环出招表和棋盘移动方式。
 * pattern 中的招式按顺序循环；主角回合里会提前显示下一招（意图）与瞄准区域。
 * aim：怪物选择“最痛落点”的概率，其余时候随机选一个能命中的落点。
 */
const atk = (name, art, extra = {}) => ({
  kind: "attack",
  name,
  shape: parseShape(art),
  ...extra,
});

export const MOVE_SETS = {
  orth: [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
  diag: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  king: [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  knight: [
    [-2, -1],
    [-2, 1],
    [2, -1],
    [2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
  ],
};

export const MONSTERS = {
  ink: {
    id: "ink",
    name: "墨渍怪",
    title: "墨水凝成的怪物",
    model: "ink",
    // 两行四列：短剑、钩镰轮换能连到 ×2，序章里就能拿到第一点充能。
    ranks: { 0: ["####", "####"] },
    moves: "orth",
    aim: 0.35,
    pattern: [atk("溅射", ["##"])],
  },
  pawn: {
    id: "pawn",
    name: "暗影兵",
    title: "守在关口的步兵",
    model: "pawn",
    ranks: {
      0: [".##.", "####", "####"],
      1: [".##.", ".##.", "####", "####"],
      2: [".##.", "####", "####", "####"],
    },
    moves: "orth",
    aim: 0.6,
    pattern: [atk("斜刺", ["#.#"]), atk("突刺", ["#", "#"])],
  },
  knight: {
    id: "knight",
    name: "暗影骑士",
    title: "踏着马步巡夜",
    model: "knight",
    ranks: {
      0: [".##.", "####", "####", ".##."],
      1: [".###", "####", "####", ".##."],
      2: [".###.", "#####", "#####", ".###."],
    },
    moves: "knight",
    aim: 0.75,
    pattern: [
      atk("马踏", ["#.", "#.", "##"]),
      atk("冲锋", ["##"]),
      { kind: "charge", name: "扬蹄" },
      atk("践踏", ["##", "##", "##"]),
    ],
  },
  bishop: {
    id: "bishop",
    name: "暗影主教",
    title: "斜行祷告的主教",
    model: "bishop",
    // 祷告会把打出的缺口补回来，拖久了就连不上。
    ranks: {
      1: [".####.", "######", ".####.", "..##.."],
      2: [".####.", "######", "######", ".####."],
    },
    moves: "diag",
    aim: 0.8,
    pattern: [
      atk("斜斩", ["#..", ".#.", "..#"]),
      atk("反斜斩", ["..#", ".#.", "#.."]),
      { kind: "heal", name: "祷告", amount: 3 },
    ],
  },
  rook: {
    id: "rook",
    name: "暗影城堡",
    title: "披着护甲的城堡",
    model: "rook",
    ranks: {
      1: ["A###A", "#####", "#####", "A###A"],
      2: ["A####A", "######", "######", "A####A"],
    },
    moves: "orth",
    aim: 0.85,
    pattern: [
      atk("横扫", ["###"]),
      { kind: "armor", name: "筑墙", amount: 4 },
      atk("冲撞", ["#", "#", "#", "#"]),
    ],
  },
  queen: {
    id: "queen",
    name: "暗影王后",
    title: "暗王的护卫",
    model: "queen",
    ranks: { 2: [".####.", "#A##A#", "######", "#A##A#", ".####."] },
    moves: "king",
    aim: 0.9,
    pattern: [
      atk("星芒", ["#.#", ".#.", "#.#"]),
      atk("横扫", ["###"]),
      { kind: "charge", name: "凝聚" },
      atk("王后之怒", ["##", "##", "##"]),
    ],
  },
  king: {
    id: "king",
    name: "暗王",
    title: "墨迹的源头",
    model: "king",
    boss: true,
    ranks: { 2: ["A#####A", "#######", "##A#A##", "#######", "##A#A##", "#######", "A#####A"] },
    moves: "king",
    aim: 1,
    // 王座崩落和王之审判紧挨着：防御只能挡住一招，另一招得靠定身钉或者硬扛。
    pattern: [
      { kind: "charge", name: "王权蓄势" },
      atk("王座崩落", ["###", "###", "###"]),
      atk("王之审判", ["###", "#.#", "###"]),
      { kind: "curse", name: "将军！", amount: 2 },
      atk("十字刑", [".#.", "###", ".#."]),
      { kind: "heal", name: "吞墨", amount: 4 },
    ],
  },
};

/**
 * 怪物的心阵按章节分档成长：前期刚好够连上几下，越往后越厚，
 * 由更多的武器、技能和强化来应付。ranks 里没写的档位沿用最近的较低档。
 */
export function heartsAt(def, rank = 0) {
  const defined = Object.keys(def.ranks).map(Number).sort((a, b) => a - b);
  const pick = defined.filter((k) => k <= rank).at(-1) ?? defined[0];
  return def.rankValues[pick];
}

for (const monster of Object.values(MONSTERS)) {
  monster.rankValues = Object.fromEntries(Object.entries(monster.ranks).map(([k, art]) => [k, parseMatrix(art)]));
  monster.matrix = Object.values(monster.ranks)[0];
  monster.matrixValues = heartsAt(monster, 0);
  monster.armored = Object.values(monster.ranks).some((art) => art.some((row) => row.includes("A")));
}

/** 招式效果的短描述（不含招式名）。 */
export const INTENT_TEXT = {
  attack: (i) => `${i.shape.size} 格`,
  charge: () => "蓄力",
  heal: (i) => `回复 ${i.amount}`,
  armor: (i) => `护甲 +${i.amount}`,
  curse: (i) => `冷却 +${i.amount}`,
};
