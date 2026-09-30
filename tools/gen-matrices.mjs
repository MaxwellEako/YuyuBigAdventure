/**
 * 心阵变体生成器（开发工具，不进游戏包）。
 *
 * 做法：先给每种怪物定一个中心对称的“轮廓”（它的符号），再成对地挖掉少量格子，
 * 得到大体相似、细节不同的几套心阵；每一套都用单元测试里的同一套标准筛一遍：
 *   - 前期、中期（rank 0、1）：用这一档首次登场时拥有的武器，一条不断的连击就能整片拼完，且比短剑硬磨快；
 *   - 后期（rank 2）：4 个回合内至少能连出一次追击。
 * 通过的心阵打印出来，人工挑选后写进 src/battle/data/monsters.js 的 ranks。
 *
 * 用法：node tools/gen-matrices.mjs <怪物 id> <rank> <轮廓 JSON> <最少红心> <最多红心> <护甲对数> [数量] [秒数] [种子]
 * 例：node tools/gen-matrices.mjs bishop 1 '["##....","###...",".####.","...###","....##"]' 13 16 0 4 60 1
 */
import { MONSTERS } from "../src/battle/data/monsters.js";
import { LEVELS, weaponsForLevel } from "../src/battle/data/levels.js";
import { STARTING_WEAPONS } from "../src/battle/data/weapons.js";
import { parseMatrix } from "../src/battle/logic/shapes.js";
import { createRng } from "../src/battle/logic/combat.js";
import { solveChain, grindTurns } from "../tests/helpers/chainSolver.js";

const [id, rankArg, templateArg, minArg, maxArg, armorArg, wantArg = "4", secondsArg = "60", seedArg = "1"] = process.argv.slice(2);
const def = MONSTERS[id];
const rank = Number(rankArg);
const template = JSON.parse(templateArg);
const rows = template.length;
const cols = template[0].length;
const rng = createRng(Number(seedArg));

/** 中心对称的配对格：绕中心旋转 180°。 */
const mate = ([r, c]) => [rows - 1 - r, cols - 1 - c];
const isPointSymmetric = (art) => art.every((row, r) => [...row].every((ch, c) => art[rows - 1 - r][cols - 1 - c] === ch));
if (!isPointSymmetric(template)) throw new Error("轮廓必须中心对称");

// 这一档首次登场的章节：决定用哪些武器、几个槽位来验证。
const first = LEVELS.findIndex((level) => (level.rank ?? 0) === rank && level.monsters.some((m) => m.type === id));
if (first < 0) throw new Error(`${def.name}没有在 rank ${rank} 的章节出场`);
const owned = weaponsForLevel(first, STARTING_WEAPONS);
const slots = LEVELS[first].slots;
const late = rank >= 2;

/** 和单元测试同一套标准。 */
function passes(art) {
  const matrix = parseMatrix(art);
  const best = solveChain({ def, matrix, weapons: owned, slots, maxTurns: late ? 4 : 6, until: late ? "chase" : "won" });
  if (!best) return null;
  if (!late && best.turns >= grindTurns({ def, matrix, weapon: "dagger" })) return null;
  return best.turns;
}

const cells = [];
template.forEach((row, r) => [...row].forEach((ch, c) => ch !== "." && cells.push([r, c])));
const seen = new Set();
const found = [];
const deadline = Date.now() + Number(secondsArg) * 1000;
while (Date.now() < deadline && found.length < Number(wantArg)) {
  const grid = template.map((row) => [...row]);
  // 成对挖掉 5%～25% 的格子，保持轮廓大体不变。
  const rate = 0.05 + rng() * 0.2;
  for (const cell of cells) {
    if (rng() >= rate / 2) continue;
    const [r2, c2] = mate(cell);
    grid[cell[0]][cell[1]] = ".";
    grid[r2][c2] = ".";
  }
  // 护甲心也成对放置。
  const hearts = [];
  grid.forEach((row, r) => row.forEach((ch, c) => ch === "#" && hearts.push([r, c])));
  for (let k = 0; k < Number(armorArg) && hearts.length; k += 1) {
    const [r, c] = hearts.splice(Math.floor(rng() * hearts.length), 1)[0];
    const [r2, c2] = mate([r, c]);
    grid[r][c] = "A";
    grid[r2][c2] = "A";
  }
  const art = grid.map((row) => row.join(""));
  const key = art.join("/");
  const count = key.replace(/[^#A]/g, "").length;
  if (seen.has(key) || count < Number(minArg) || count > Number(maxArg)) continue;
  seen.add(key);
  const turns = passes(art);
  if (turns) found.push({ art, hearts: count, turns });
}
console.log(JSON.stringify({ id, rank, chapter: first, owned, slots, tried: seen.size, found }));
