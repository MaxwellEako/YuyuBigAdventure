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
    matrix: [".#.", "###", ".#."],
    moves: "orth",
    aim: 0.35,
    pattern: [atk("溅射", ["##"])],
  },
  pawn: {
    id: "pawn",
    name: "暗影兵",
    title: "守在关口的步兵",
    model: "pawn",
    matrix: [".#.", "###", "###"],
    moves: "orth",
    aim: 0.6,
    pattern: [atk("斜刺", ["#.#"]), atk("突刺", ["#", "#"])],
  },
  knight: {
    id: "knight",
    name: "暗影骑士",
    title: "踏着马步巡夜",
    model: "knight",
    matrix: ["##.", "###", ".##", ".##"],
    moves: "knight",
    aim: 0.75,
    pattern: [
      atk("马踏", ["#.", "#.", "##"]),
      atk("冲锋", ["##"]),
      { kind: "charge", name: "扬蹄" },
    ],
  },
  bishop: {
    id: "bishop",
    name: "暗影主教",
    title: "斜行祷告的主教",
    model: "bishop",
    matrix: [".#.", "###", "###", ".#."],
    moves: "diag",
    aim: 0.8,
    pattern: [
      atk("斜斩", ["#..", ".#.", "..#"]),
      atk("反斜斩", ["..#", ".#.", "#.."]),
      { kind: "heal", name: "祷告", amount: 2 },
    ],
  },
  rook: {
    id: "rook",
    name: "暗影城堡",
    title: "披着护甲的城堡",
    model: "rook",
    matrix: ["A#A", "###", "A#A"],
    moves: "orth",
    aim: 0.85,
    pattern: [
      atk("横扫", ["###"]),
      { kind: "armor", name: "筑墙", amount: 2 },
      atk("冲撞", ["#", "#", "#"]),
    ],
  },
  queen: {
    id: "queen",
    name: "暗影王后",
    title: "暗王的护卫",
    model: "queen",
    matrix: [".##.", "#AA#", "####", ".##."],
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
    matrix: ["A###A", "##A##", "#A#A#", "##A##", "A###A"],
    moves: "king",
    aim: 1,
    pattern: [
      atk("王之审判", ["###", "#.#", "###"]),
      { kind: "curse", name: "将军！", amount: 1 },
      atk("十字刑", [".#.", "###", ".#."]),
      { kind: "heal", name: "吞墨", amount: 3 },
      { kind: "charge", name: "王权蓄势" },
      atk("王座崩落", ["###", "###", "###"]),
    ],
  },
};

for (const monster of Object.values(MONSTERS))
  monster.matrixValues = parseMatrix(monster.matrix);

/** 招式效果的短描述（不含招式名）。 */
export const INTENT_TEXT = {
  attack: (i) => `${i.shape.size} 格`,
  charge: () => "蓄力",
  heal: (i) => `回复 ${i.amount}`,
  armor: (i) => `护甲 +${i.amount}`,
  curse: (i) => `冷却 +${i.amount}`,
};
