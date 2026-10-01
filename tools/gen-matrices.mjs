/**
 * 心阵变体生成器（开发工具，不进游戏包）。
 *
 * 做法：先给每种怪物手画一个“符号模板”（兵像棋子、城堡有城垛、王后戴王冠……），
 * 模板里每一格写一个字符：
 *   #  必有的心        A  必有的护甲心
 *   ?  可有可无的心    .  空
 * 生成器按模板自身的对称（左右、上下、中心）把 '?' 分组，每组要么整组留下、要么整组挖掉，
 * 这样挖出来的每一套都和模板一样对称。然后穷举所有组合，逐套筛选：
 *   1. 形状：上下左右连成一片、没有孤立的心、只挨着一颗心的细枝不超过三分之一（见 tests/helpers/matrixShape.js）；
 *   2. 打法：用这一档首次登场时拥有的武器和槽位，达到单元测试的同一套标准（见 matrixGoal）。
 * 通过的心阵打印出来，人工挑选后写进 src/battle/data/monsters.js 的 ranks。
 *
 * 用法：node tools/gen-matrices.mjs <怪物 id> <rank> <模板 JSON> [最少红心] [最多红心]
 * 例：node tools/gen-matrices.mjs pawn 2 '["?###?","##?##","#?#?#","##?##","?###?"]' 18 22
 */
import { MONSTERS } from "../src/battle/data/monsters.js";
import { LEVELS, weaponsForLevel } from "../src/battle/data/levels.js";
import { STARTING_WEAPONS } from "../src/battle/data/weapons.js";
import { parseMatrix } from "../src/battle/logic/shapes.js";
import { solveChain, grindTurns } from "../tests/helpers/chainSolver.js";
import { measureShape, shapeProblem, matrixGoal } from "../tests/helpers/matrixShape.js";

const [id, rankArg, templateArg, minArg = "1", maxArg = "99"] = process.argv.slice(2);
const def = MONSTERS[id];
if (!def) throw new Error(`没有叫 ${id} 的怪物`);
const rank = Number(rankArg);
const template = JSON.parse(templateArg);
const rows = template.length;
const cols = template[0].length;

/** 三种可能的对称变换：左右翻转、上下翻转、旋转 180°。 */
const TRANSFORMS = [
  (r, c) => [r, cols - 1 - c],
  (r, c) => [rows - 1 - r, c],
  (r, c) => [rows - 1 - r, cols - 1 - c],
];

/** 模板在某个变换下是否不变（只看“有没有格子”，不区分 # ? A）。 */
const keeps = (f) =>
  template.every((line, r) =>
    [...line].every((ch, c) => {
      const [r2, c2] = f(r, c);
      return (template[r2][c2] === ".") === (ch === ".");
    }),
  );
const symmetries = TRANSFORMS.filter(keeps);
if (!symmetries.length) throw new Error("模板既不左右对称、也不上下对称或中心对称");

/**
 * 把 '?' 按对称分组：同一组的格子在任一对称变换下互相映射，必须一起留下或一起挖掉。
 * 做法是从一个 '?' 出发，反复套用所有对称变换，直到组不再变大。
 */
function optionalGroups() {
  const groups = [];
  const assigned = new Set();
  template.forEach((line, r) =>
    [...line].forEach((ch, c) => {
      if (ch !== "?" || assigned.has(`${r},${c}`)) return;
      const group = new Map([[`${r},${c}`, [r, c]]]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const [a, b] of [...group.values()]) {
          for (const f of symmetries) {
            const [x, y] = f(a, b);
            if (!group.has(`${x},${y}`)) {
              group.set(`${x},${y}`, [x, y]);
              grew = true;
            }
          }
        }
      }
      for (const key of group.keys()) assigned.add(key);
      groups.push([...group.values()]);
    }),
  );
  return groups;
}

// 这一档首次登场的章节：决定用哪些武器、几个槽位来验证。
const first = LEVELS.findIndex((level) => (level.rank ?? 0) === rank && level.monsters.some((m) => m.type === id));
if (first < 0) throw new Error(`${def.name}没有在 rank ${rank} 的章节出场`);
const owned = weaponsForLevel(first, STARTING_WEAPONS);
const slots = LEVELS[first].slots;
const goal = matrixGoal(rank, owned);

/** 用和单元测试同一套标准检查打法；通过时返回用掉的回合数，否则返回 null。 */
function playable(matrix) {
  const best = solveChain({ def, matrix, weapons: owned, slots, maxTurns: goal.maxTurns, until: goal.until });
  if (!best) return null;
  if (goal.beatGrind && best.turns >= grindTurns({ def, matrix, weapon: "dagger" })) return null;
  return best.turns;
}

const groups = optionalGroups();
const found = [];
// 每个二进制位代表一组 '?'：1 表示挖掉这一组。
for (let mask = 0; mask < 1 << groups.length; mask += 1) {
  const grid = template.map((line) => [...line].map((ch) => (ch === "?" ? "#" : ch)));
  groups.forEach((group, i) => {
    if (mask & (1 << i)) for (const [r, c] of group) grid[r][c] = ".";
  });
  const art = grid.map((line) => line.join(""));
  const matrix = parseMatrix(art);
  const { hearts } = measureShape(matrix);
  if (hearts < Number(minArg) || hearts > Number(maxArg) || shapeProblem(matrix)) continue;
  const turns = playable(matrix);
  if (turns) found.push({ art, hearts, turns });
}
console.log(JSON.stringify({ id, rank, chapter: first, owned, slots, goal: goal.until, groups: groups.length, found }, null, 1));
