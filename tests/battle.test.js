import test from "node:test";
import assert from "node:assert/strict";
import {
  parseShape,
  parseMatrix,
  filledMatrix,
  resolveHits,
  applyChanges,
  isDead,
  rankPlacements,
  countHearts,
  VOID,
} from "../src/battle/logic/shapes.js";
import {
  createCombat,
  createRng,
  heroAttack,
  heroHeal,
  heroShield,
  heroRetreat,
  monsterTurn,
  heroTransform,
  previewAttack,
  heroWait,
  slotBlocked,
  ENERGY_START,
  ENERGY_MAX,
  ENERGY_COST,
  slotOf,
  comboLinks,
  previewCombo,
  reachesChase,
} from "../src/battle/logic/combat.js";
import {
  createBoard,
  heroMove,
  advanceMonsters,
  chaseStep,
  resolveBattle,
  monsterCanStand,
  heroCanEnter,
  pickupAt,
  pickableAt,
  useForge,
  lineOfSight,
  isVisible,
  isExplored,
  visibleMonsterAt,
  key,
  previewPlate,
  armorHero,
} from "../src/battle/logic/board.js";
import { solveChain, grindTurns } from "./helpers/chainSolver.js";
import { featuresAt } from "../src/battle/data/features.js";
import { WEAPONS, STARTING_WEAPONS } from "../src/battle/data/weapons.js";
import { MONSTERS, heartsAt } from "../src/battle/data/monsters.js";
import { LEVELS, weaponsForLevel, skillsForLevel } from "../src/battle/data/levels.js";
import { SKILLS } from "../src/battle/data/skills.js";
import {
  DEFAULT_HERO_NAME,
  NAME_MAX_WIDTH,
  nameWidth,
  validateName,
  getHeroName,
  setHeroName,
} from "../src/battle/data/heroName.js";
import {
  weaponShape,
  distinctRotations,
  upgradeOptions,
  applyUpgrade,
  createForgeOptions,
  rerollForgeOption,
  toggleEquip,
  toggleSkill,
  SKILL_SLOTS,
  sanitizeUpgrades,
} from "../src/battle/logic/arsenal.js";
import { transformShape, shapeKey } from "../src/battle/logic/shapes.js";

/** 按稳定的 key 找章节，插入新章节时测试不用跟着改序号。 */
const at = (key) => LEVELS.findIndex((l) => l.key === key);
const level = (key) => LEVELS[at(key)];

/** 把满心阵里的几格打空（值为 0），用来摆出伤口。 */
const withHoles = (m, cells) => {
  for (const [r, c] of cells) m[r][c] = 0;
  return m;
};

const hitSet = (hits) => hits.map((h) => `${h.r},${h.c}`).sort();

test("L 型武器在 4×4 心阵的 a00 处消除 a00 a01 a10", () => {
  const m = filledMatrix(4, 4);
  const hits = resolveHits(m, WEAPONS.hook.shape, 0, 0);
  assert.deepEqual(hitSet(hits), ["0,0", "0,1", "1,0"]);
  const next = applyChanges(m, hits);
  assert.equal(countHearts(next).hearts, 13);
});

test("形状不旋转不镜像，越界部分直接忽略", () => {
  const m = filledMatrix(4, 4);
  assert.deepEqual(hitSet(resolveHits(m, WEAPONS.hook.shape, 3, 3)), ["3,3"]);
  assert.deepEqual(hitSet(resolveHits(m, WEAPONS.hook.shape, -1, 1)), ["0,1"]);
  assert.deepEqual(hitSet(resolveHits(m, WEAPONS.hook.shape, 2, 3)), [
    "2,3",
    "3,3",
  ]);
  assert.equal(resolveHits(m, WEAPONS.hook.shape, 5, 5).length, 0);
});

test("无心槽与已空的格子不会被计入命中", () => {
  const m = parseMatrix([".#.", "###", ".#."]);
  assert.equal(m[0][0], VOID);
  const hits = resolveHits(m, parseShape(["@#", "##"]), 0, 0);
  assert.deepEqual(hitSet(hits), ["0,1", "1,0", "1,1"]);
  const after = applyChanges(m, hits);
  assert.equal(resolveHits(after, WEAPONS.dagger.shape, 0, 0).length, 0);
});

test("护甲心需要两次命中，破甲锥一次击碎", () => {
  const m = parseMatrix(["A", "A"]);
  const once = applyChanges(m, resolveHits(m, WEAPONS.spear.shape, 0, 0));
  assert.deepEqual(once, [[1], [1]]);
  const pierced = applyChanges(m, resolveHits(m, WEAPONS.awl.shape, 0, 0, WEAPONS.awl));
  assert.ok(isDead(pierced));
});

test("锚点默认取最靠近中心的命中格，也可用 @ 指定", () => {
  assert.deepEqual(parseShape(["#.#"]).pivot, [0, 0]);
  assert.deepEqual(parseShape([".#.", "###", ".#."]).pivot, [1, 1]);
  assert.deepEqual(WEAPONS.spear.shape.pivot, [1, 0], "长枪以中间一格为锚点");
  assert.deepEqual(WEAPONS.hook.shape.pivot, [0, 0], "钩镰以左上角为锚点");
});

test("怪物瞄准会优先选择伤害最高的落点", () => {
  const m = parseMatrix(["...", ".##", ".#."]);
  const best = rankPlacements(m, WEAPONS.hook.shape)[0];
  assert.equal(best.damage, 3);
  assert.deepEqual([best.r, best.c], [1, 1]);
});

test("战斗流程：主角出招 → 怪物行动 → 冷却递减 → 胜利", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["dagger", "hook"], potions: 1 },
    monster: { def: MONSTERS.ink, matrix: MONSTERS.ink.matrixValues },
    rng: createRng(7),
  });
  assert.equal(combat.phase, "hero");
  assert.equal(heroAttack(combat, "hook", 0, 1).ok, true);
  assert.equal(combat.phase, "monster");
  monsterTurn(combat);
  assert.equal(combat.phase, "hero");
  assert.equal(combat.weapons[1].cd, 1, "冷却 1：下一个己方回合不可用");
  assert.equal(heroAttack(combat, "hook", 1, 1).ok, false);
  assert.equal(countHearts(combat.heroMatrix).hearts, 14);
  assert.equal(heroAttack(combat, "dagger", 5, 5).ok, false);
  assert.equal(heroAttack(combat, "dagger", 2, 1).ok, true);
  monsterTurn(combat);
  assert.equal(combat.weapons[1].cd, 0, "再过一回合恢复");
  while (combat.phase !== "won") {
    const target = rankPlacements(combat.monsterMatrix, WEAPONS.dagger.shape)[0];
    heroAttack(combat, "dagger", target.r, target.c);
    if (combat.phase === "monster") monsterTurn(combat);
  }
  assert.ok(isDead(combat.monsterMatrix));
});

test("暗王的「将军」让有冷却的武器延后几回合，短剑不受影响", () => {
  const step = MONSTERS.king.pattern.findIndex((p) => p.kind === "curse");
  const { amount } = MONSTERS.king.pattern[step];
  const combat = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "hook"], potions: 0 },
    monster: { def: MONSTERS.king, matrix: MONSTERS.king.matrixValues, step },
    rng: createRng(4),
  });
  assert.equal(combat.intent.kind, "curse");
  heroAttack(combat, "dagger", 2, 0);
  monsterTurn(combat);
  assert.equal(combat.weapons[0].cd, 0);
  assert.equal(combat.weapons[1].cd, amount);
});

test("防御不消耗回合并挡下一次攻击；药水恢复十字范围", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(3, 3), weapons: ["dagger"], potions: 1 },
    monster: { def: MONSTERS.pawn, matrix: MONSTERS.pawn.matrixValues },
    rng: createRng(3),
  });
  assert.equal(heroShield(combat).ok, true);
  assert.equal(combat.phase, "hero");
  heroAttack(combat, "dagger", 1, 0);
  monsterTurn(combat);
  assert.equal(countHearts(combat.heroMatrix).hearts, 9);
  assert.equal(heroShield(combat).ok, false);
  heroAttack(combat, "dagger", 2, 0);
  monsterTurn(combat);
  const lost = 9 - countHearts(combat.heroMatrix).hearts;
  assert.ok(lost > 0);
  const hole = combat.heroMatrix.flatMap((row, r) => row.map((v, c) => ({ v, r, c }))).find((x) => x.v === 0);
  assert.equal(heroHeal(combat, hole.r, hole.c).ok, true);
  assert.equal(combat.potions, 0);
});

test("撤退时怪物追击一次，暗王战无法撤退", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["dagger"], potions: 0 },
    monster: { def: MONSTERS.ink, matrix: MONSTERS.ink.matrixValues },
    rng: createRng(1),
  });
  assert.equal(heroRetreat(combat).ok, true);
  monsterTurn(combat);
  assert.equal(combat.phase, "fled");
  const boss = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["dagger"], potions: 0 },
    monster: { def: MONSTERS.king, matrix: MONSTERS.king.matrixValues },
  });
  assert.equal(heroRetreat(boss).ok, false);
});

function reachable(board, from) {
  const seen = new Set([key(from.r, from.c)]);
  const queue = [from];
  while (queue.length) {
    const { r, c } = queue.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= board.size || nc >= board.size) continue;
      const item = board.items.get(key(nr, nc));
      if (board.tiles[nr][nc].prop || seen.has(key(nr, nc))) continue;
      if (item && item.type === "forge") continue;
      seen.add(key(nr, nc));
      queue.push({ r: nr, c: nc });
    }
  }
  return seen;
}

test("每一关都是 8×8，出口、宝箱、钥匙、药水、铁砧都能走到", () => {
  LEVELS.forEach((level, index) => {
    const board = createBoard(level, { weapons: weaponsForLevel(index, STARTING_WEAPONS) });
    assert.equal(board.size, 8, level.name);
    level.map.forEach((row) => assert.equal(row.replace(/\s+/g, "").length, 8, level.name));
    const seen = reachable(board, board.hero);
    assert.ok(seen.has(key(board.exit.r, board.exit.c)), `${level.name} 出口不可达`);
    for (const item of board.items.values()) {
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => seen.has(key(item.r + dr, item.c + dc)));
      const ok = item.type === "key" ? seen.has(key(item.r, item.c)) : near;
      assert.ok(ok, `${level.name} 道具 ${item.type} 无法拾取`);
    }
    for (const m of board.monsters) {
      assert.ok(!board.tiles[m.r][m.c].prop, `${level.name} 怪物站在障碍上`);
      if (m.path) m.path.forEach(([r, c]) => assert.ok(!board.tiles[r][c].prop));
    }
  });
});

test("走进怪物格子会由主角先手开战，胜利后占据该格", () => {
  const board = createBoard(level("first-blot"), { weapons: STARTING_WEAPONS });
  for (const [r, c] of [[6, 3], [6, 4], [6, 5], [6, 6]]) assert.equal(heroMove(board, r, c).kind, "moved");
  const fight = heroMove(board, 5, 6);
  assert.equal(fight.kind, "battle");
  assert.equal(fight.heroFirst, true);
  const combat = createCombat({ hero: board.hero, monster: fight.monster, rng: createRng(2) });
  while (combat.phase !== "won") {
    const target = rankPlacements(combat.monsterMatrix, WEAPONS.dagger.shape)[0];
    heroAttack(combat, "dagger", target.r, target.c);
    if (combat.phase === "monster") monsterTurn(combat);
  }
  resolveBattle(board, fight.monster, combat, true);
  assert.deepEqual([board.hero.r, board.hero.c], [5, 6]);
  assert.equal(fight.monster.alive, false);
});

test("骑士按马步追击，扑到主角时触发突袭", () => {
  const board = createBoard(level("knight-watch"), { weapons: STARTING_WEAPONS });
  const knight = board.monsters.find((m) => m.def.id === "knight");
  board.hero.r = 5;
  board.hero.c = 5;
  const step = chaseStep(board, knight);
  assert.deepEqual(step, { r: 5, c: 5 });
  const outcome = advanceMonsters(board);
  assert.equal(outcome.ambush, knight);
});

test("怪物不会踏上道具、门和出口", () => {
  const board = createBoard(level("knight-watch"), { weapons: STARTING_WEAPONS });
  assert.equal(monsterCanStand(board, 0, 7), false);
  assert.equal(monsterCanStand(board, 1, 0), false);
  assert.equal(monsterCanStand(board, 0, 0), false);
});

test("钥匙打开铁栅门；暗王被击败后出口才开放", () => {
  const board = createBoard(level("knight-watch"), { weapons: STARTING_WEAPONS });
  board.hero.r = 2;
  board.hero.c = 1;
  board.monsters[0].alive = false;
  board.hero.r = 2;
  board.hero.c = 0;
  assert.equal(heroMove(board, 1, 0).kind, "blocked");
  board.hero.keys = 1;
  assert.equal(heroMove(board, 1, 0).kind, "moved");
  assert.equal(board.doors.size, 0);
  assert.equal(heroMove(board, 0, 0).events.at(-1).type, "exit");

  const final = createBoard(level("checkmate"), { weapons: STARTING_WEAPONS });
  assert.equal(final.exitOpen, false);
  const king = final.monsters.find((m) => m.def.boss);
  resolveBattle(final, king, { heroMatrix: final.hero.matrix, monsterMatrix: king.matrix, potions: 0, step: 0, phase: "won", stats: { taken: 0 } }, false);
  assert.equal(final.exitOpen, true);
});

test("宝箱和药水走上去就拿到，拿完格子空出来；铁砧要站在旁边点", () => {
  const board = createBoard(level("first-blot"), { weapons: [...STARTING_WEAPONS] });
  heroMove(board, 7, 2);
  heroMove(board, 7, 1);
  const moved = heroMove(board, 6, 1);
  assert.ok(moved.events.some((e) => e.type === "pickup" && e.item.type === "chest"), "走上宝箱就打开");
  assert.ok(board.hero.weapons.includes("slash"));
  assert.equal(board.items.has(key(6, 1)), false, "拿完宝箱格子空出来");
  const potions = board.hero.potions;
  board.hero.r = 6;
  board.hero.c = 6;
  assert.ok(heroMove(board, 6, 7).events.some((e) => e.type === "pickup" && e.item.type === "potion"));
  assert.equal(board.hero.potions, potions + 1);
  assert.equal(board.items.has(key(6, 7)), false);
  const again = createBoard(level("first-blot"), { weapons: [...STARTING_WEAPONS, "slash"] });
  assert.equal(again.items.has(key(6, 1)), false, "重玩时拿过的宝箱不再出现");
  const hall = createBoard(level("bishop-hall"), { weapons: [...STARTING_WEAPONS] });
  const forge = [...hall.items.values()].find((it) => it.type === "forge");
  assert.equal(heroCanEnter(hall, forge.r, forge.c).ok, false, "铁砧不能踩上");
});

test("视线会被障碍挡住", () => {
  const custom = {
    ...level("first-blot"),
    map: [
      "E . . . . . . .",
      ". . . . . . . .",
      ". . . . . . . .",
      ". . . . . . . .",
      "S b . . . . . .",
      ". . . . . . . .",
      ". . . . . . . .",
      ". . . . . . . .",
    ],
    monsters: [],
  };
  const board = createBoard(custom, { weapons: STARTING_WEAPONS });
  assert.equal(lineOfSight(board, { r: 4, c: 0 }, { r: 4, c: 2 }), false);
  assert.equal(lineOfSight(board, { r: 4, c: 0 }, { r: 4, c: 1 }), true, "障碍本身看得见");
  assert.equal(lineOfSight(board, { r: 4, c: 0 }, { r: 2, c: 0 }), true);
});

test("战争迷雾：只显示视野内的格子与怪物，走过的区域留下记忆，出口始终可见", () => {
  const board = createBoard(level("rook-wall"), { weapons: STARTING_WEAPONS });
  assert.ok(board.fog);
  assert.ok(isVisible(board, 7, 4), "自己脚下可见");
  assert.equal(isVisible(board, 0, 7), false);
  assert.ok(isExplored(board, board.exit.r, board.exit.c), "出口作为地标始终已探索");
  const knight = board.monsters.find((m) => m.def.id === "knight");
  assert.equal(visibleMonsterAt(board, knight.r, knight.c), null, "迷雾中的怪物看不见");
  assert.equal(knight.seen, false);
  heroMove(board, 7, 5);
  assert.ok(isExplored(board, 7, 3), "离开后仍记得来时的路");
  const noFog = createBoard(LEVELS[1], { weapons: STARTING_WEAPONS });
  assert.equal(noFog.fog, null);
  assert.ok(isVisible(noFog, 0, 0));
});

test("变形：绕锚点旋转与镜像；战锤和圣十字没有变形强化，其余可变形的武器变形后确实不同", () => {
  const hook = WEAPONS.hook.shape;
  assert.deepEqual(hitSet(resolveHits(filledMatrix(4, 4), transformShape(hook, { flip: true }), 0, 1)), ["0,0", "0,1", "1,1"]);
  // 顺时针转 90°：L 形从“右、下”变成“下、左”。
  assert.deepEqual(hitSet(resolveHits(filledMatrix(4, 4), transformShape(hook, { rot: 1 }), 1, 1)), ["1,0", "1,1", "2,1"]);
  for (const [id, weapon] of Object.entries(WEAPONS)) {
    if (id === "hammer" || id === "cross") assert.deepEqual(weapon.transforms, [], id);
    for (const kind of weapon.transforms) {
      const changed = kind === "rotate" ? { rot: 1 } : { flip: true };
      assert.notEqual(shapeKey(transformShape(weapon.shape, changed)), shapeKey(weapon.shape), `${id} ${kind}`);
    }
  }
  assert.deepEqual(distinctRotations("dagger", { dagger: { rotate: true } }), [0, 1], "短剑只有横竖两种");
  assert.equal(distinctRotations("hook", { hook: { rotate: true } }).length, 4);
});

test("强化：延长可切换为加长形状；候选项不会重复已有的强化；强化会带进战斗", () => {
  // 中型武器延长一格；重武器延长得更多（战锤 +2，圣十字 +4）；轻武器不能延长。
  for (const [id, weapon] of Object.entries(WEAPONS))
    if (weapon.weight === "medium") assert.equal(weapon.plusShape.size, weapon.shape.size + 1, id);
  assert.equal(WEAPONS.hammer.shape.size, 4, "战锤 2×2");
  assert.equal(WEAPONS.hammer.plusShape.size, 6, "延长后 2×3");
  assert.equal(WEAPONS.cross.shape.size, 5);
  assert.equal(WEAPONS.cross.plusShape.size, 9);
  const hero = { weapons: ["dagger", "hook", "hammer"], upgrades: {} };
  const all = upgradeOptions(hero, createRng(1), 20).map((o) => `${o.weapon}:${o.kind}`).sort();
  assert.deepEqual(
    all,
    [
      "dagger:chain",
      "dagger:nimble",
      "dagger:rotate",
      "hammer:extend",
      "hammer:pierce",
      "hammer:stagger",
      "hammer:steady",
      "hook:extend",
      "hook:mirror",
      "hook:pierce",
      "hook:precise",
      "hook:rotate",
    ],
    "轻武器走灵活路线（连锁、灵巧）；中型延长、精准、破甲；重武器稳击、延长、破甲、震慑",
  );
  applyUpgrade(hero, { weapon: "dagger", kind: "rotate" });
  assert.equal(upgradeOptions(hero, createRng(1), 10).some((o) => o.weapon === "dagger" && o.kind === "rotate"), false);
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["dagger"], potions: 0, upgrades: hero.upgrades },
    monster: { def: MONSTERS.ink, matrix: MONSTERS.ink.matrixValues },
    rng: createRng(2),
  });
  assert.equal(heroTransform(combat, "dagger", "mirror").ok, false, "没有镜像强化");
  assert.equal(heroTransform(combat, "dagger", "rotate").ok, true);
  assert.deepEqual(hitSet(previewAttack(combat, "dagger", 0, 1)), ["0,1", "1,1"], "旋转后变成竖向两格");
  // 延长是开关：默认仍是原形状，切换后才用加长形状。
  assert.equal(weaponShape("hook", { hook: { extend: true } }).size, 3, "默认原形状");
  assert.equal(weaponShape("hook", { hook: { extend: true } }, { ext: true }).size, 4, "切换后加长");
  assert.equal(weaponShape("hook", {}, { ext: true }).size, 3, "没有延长强化时切换无效");
});

test("延长：战斗中不占回合地切换长短，可以随时切回原形状", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["spear"], potions: 0, upgrades: { spear: { extend: true } } },
    monster: { def: MONSTERS.pawn, matrix: parseMatrix(["####", "####", "####", "####"]) },
    rng: createRng(1),
  });
  assert.equal(previewAttack(combat, "spear", 1, 0).length, 3, "默认纵向三格");
  assert.equal(heroTransform(combat, "spear", "extend").ok, true);
  assert.equal(combat.phase, "hero", "切换不消耗回合");
  assert.equal(previewAttack(combat, "spear", 1, 0).length, 4, "加长后四格");
  heroTransform(combat, "spear", "extend");
  assert.equal(previewAttack(combat, "spear", 1, 0).length, 3, "切回原形状");
  const plain = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["spear"], potions: 0 },
    monster: { def: MONSTERS.pawn, matrix: MONSTERS.pawn.matrixValues },
    rng: createRng(1),
  });
  assert.equal(heroTransform(plain, "spear", "extend").ok, false, "没有延长强化");
});

test("稳击：一半以上的攻击格命中红心时，其余格子落空也能接上连击", () => {
  // 心阵中间有空位：战锤 2×2 盖上去只有 2 格是红心。
  const make = (upgrades) => {
    const c = createCombat({
      hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "hammer"], potions: 0, upgrades },
      monster: { def: MONSTERS.pawn, matrix: parseMatrix(["#####", "##...", "#####"]) },
      rng: createRng(1),
    });
    c.energy = ENERGY_MAX;
    return c;
  };
  const plain = make({});
  assert.equal(previewCombo(plain, "hammer", 1, 1), "break", "没有稳击：落在空位上就算落空");
  const steady = make({ hammer: { steady: true } });
  assert.equal(previewCombo(steady, "hammer", 1, 1), "start", "稳击：2/4 格命中即不算落空");
  heroAttack(steady, "dagger", 0, 0);
  steady.phase = "hero";
  assert.equal(previewCombo(steady, "hammer", 1, 1), "link", "紧挨上一击，接上连击");
  assert.equal(previewCombo(steady, "hammer", 0, 4), "break", "只有 1/4 格命中（其余在空位与界外）仍算落空");
});

test("技能：次数有限；疾风斩后可以立刻再用一次普通武器；定身让怪物跳过一次行动；汲血恢复红心", () => {
  const make = (skills, heroMatrix = filledMatrix(4, 4)) =>
    createCombat({
      hero: { matrix: heroMatrix, weapons: ["dagger"], potions: 0, skills },
      monster: { def: MONSTERS.pawn, matrix: MONSTERS.pawn.matrixValues },
      rng: createRng(5),
    });
  const swift = make({ swift: 1 });
  assert.equal(heroAttack(swift, "swift", 1, 0).ok, true);
  assert.equal(swift.phase, "hero", "疾风斩之后仍是主角回合");
  assert.equal(heroAttack(swift, "swift", 2, 0).ok, false, "次数用完");
  assert.equal(heroAttack(swift, "dagger", 2, 0).ok, true);
  assert.equal(swift.phase, "monster", "追加攻击之后轮到怪物");

  const stun = make({ stun: 1 });
  const stepBefore = stun.step;
  heroAttack(stun, "stun", 1, 1);
  const hearts = countHearts(stun.heroMatrix).hearts;
  monsterTurn(stun);
  assert.equal(countHearts(stun.heroMatrix).hearts, hearts, "被定身的怪物没有攻击");
  assert.equal(stun.step, stepBefore, "招式顺序不前进");

  const hurt = filledMatrix(4, 4);
  hurt[0][0] = 0;
  hurt[0][1] = 0;
  const drain = make({ drain: 1 }, hurt);
  heroAttack(drain, "drain", 1, 1);
  assert.equal(countHearts(drain.heroMatrix).hearts, 16, "消除 3 颗，恢复 2 个空位");
});

test("技能按章节解锁，每章开始时次数恢复；铁砧选定强化后才算用掉", () => {
  assert.deepEqual(skillsForLevel(at("pawn-line"), SKILLS), {});
  assert.deepEqual(skillsForLevel(at("knight-watch"), SKILLS), { swift: 2 });
  assert.deepEqual(skillsForLevel(at("checkmate"), SKILLS), { swift: 2, stun: 1, crush: 2, meteor: 1, drain: 1 });
  const board = createBoard(level("bishop-hall"), { weapons: weaponsForLevel(at("bishop-hall"), STARTING_WEAPONS) });
  const forge = [...board.items.values()].find((i) => i.type === "forge");
  board.hero.r = forge.r + 1;
  board.hero.c = forge.c;
  assert.equal(pickupAt(board, forge.r, forge.c).events[0].type, "forge");
  assert.equal(pickupAt(board, forge.r, forge.c).ok, true, "未选择前可以再次打开");
  useForge(board, forge.r, forge.c);
  assert.equal(pickupAt(board, forge.r, forge.c).ok, false, "铁砧只能用一次");
});

test("连击与充能：从第二次连击起，每连上一次得一颗；中型花一颗，重型花三颗，开局抡不动", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "slash", "hook", "hammer"], potions: 0 },
    monster: { def: MONSTERS.knight, matrix: parseMatrix(["#######", "#######", "#######", "#######", "#######"]) },
    rng: createRng(3),
  });
  assert.equal(combat.energy, ENERGY_START);
  assert.ok(ENERGY_COST.heavy > ENERGY_START, "重武器比开局的充能贵");
  assert.match(slotBlocked(combat, slotOf(combat, "hammer")), /充能/, "开局不能直接抡战锤");
  heroAttack(combat, "dagger", 0, 0);
  assert.equal(combat.combo, 1, "起手");
  monsterTurn(combat);
  heroAttack(combat, "slash", 1, 0);
  assert.equal(combat.combo, 2, "连击");
  assert.equal(combat.energy, ENERGY_START, "第一次连击不给充能");
  monsterTurn(combat);
  heroAttack(combat, "dagger", 2, 2);
  assert.equal(combat.combo, 3, "连击 ×2");
  assert.equal(combat.energy, ENERGY_START + 1, "第二次连击起每次一颗");
  assert.equal(combat.phase, "monster", "×2 还不追击");
  monsterTurn(combat);
  assert.equal(slotBlocked(combat, slotOf(combat, "hammer")), null, "攒够三颗，战锤可以出手");
  heroAttack(combat, "hammer", 1, 4);
  assert.equal(combat.energy, 1, "战锤连上：花三颗、得一颗");
  combat.energy = 0;
  combat.weapons[2].cd = 0;
  assert.match(slotBlocked(combat, combat.weapons[2]), /充能/, "钩镰充能不足时无法使用");
  assert.equal(slotBlocked(combat, combat.weapons[0]), null, "轻武器不消耗充能");
});

test("追击：连击 ×3、×6 时怪物行动前再出一招；追击中不会再触发追击", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "slash"], potions: 0 },
    monster: { def: MONSTERS.pawn, matrix: parseMatrix(["########", "########", "########", "########"]) },
    rng: createRng(5),
  });
  // 短剑、斜刃轮换，顺着心阵往右下方拼：每一击都紧挨上一击。
  const route = [["dagger", 0, 0], ["slash", 1, 0], ["dagger", 2, 2], ["slash", 1, 3]];
  for (const [id, r, c] of route.slice(0, 3)) {
    heroAttack(combat, id, r, c);
    monsterTurn(combat);
  }
  assert.equal(comboLinks(combat.combo), 2);
  const res = heroAttack(combat, ...route[3]);
  assert.equal(comboLinks(combat.combo), 3);
  assert.ok(res.events.some((e) => e.type === "combo" && e.chase), "连击 ×3 触发追击");
  assert.equal(combat.phase, "hero", "怪物还没行动");
  assert.equal(combat.bonusReason, "chase");
  heroAttack(combat, "dagger", 2, 5);
  assert.equal(comboLinks(combat.combo), 4, "追击也能接着连");
  assert.equal(combat.phase, "monster", "追击之后轮到怪物");

  // 追击中即使连到 ×6 也不会再追击。
  combat.phase = "hero";
  combat.combo = 6;
  combat.bonus = true;
  combat.bonusReason = "chase";
  const again = heroAttack(combat, "slash", 1, 6);
  assert.equal(comboLinks(combat.combo), 6);
  assert.equal(again.events.find((e) => e.type === "combo").chase, false);
  assert.equal(combat.phase, "monster");
  assert.ok(reachesChase(5, 6) && reachesChase(2, 4) && !reachesChase(3, 5));
});

test("轻武器强化：连锁让连击多涨一次，灵巧不必紧挨上一击", () => {
  const make = (upgrades) =>
    createCombat({
      hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "slash"], potions: 0, upgrades },
      monster: { def: MONSTERS.pawn, matrix: parseMatrix(["######", "######", "######", "######"]) },
      rng: createRng(5),
    });
  const chained = make({ slash: { chain: true } });
  heroAttack(chained, "dagger", 0, 0);
  chained.phase = "hero";
  heroAttack(chained, "slash", 1, 0);
  assert.equal(comboLinks(chained.combo), 2, "连锁：一次连上算两次");

  const plain = make({});
  heroAttack(plain, "dagger", 0, 0);
  plain.phase = "hero";
  assert.equal(previewCombo(plain, "slash", 2, 4), "start", "离得远：重新起手");
  const nimble = make({ slash: { nimble: true } });
  heroAttack(nimble, "dagger", 0, 0);
  nimble.phase = "hero";
  assert.equal(previewCombo(nimble, "slash", 2, 4), "link", "灵巧：不挨着也能连上");
  assert.equal(previewCombo(nimble, "slash", 3, 5), "break", "但不能落空");
});

test("连击：换武器且紧挨上一击才连上；连用同一件或离得远都从头起手；护甲不算落空", () => {
  const monster = { def: MONSTERS.knight, matrix: parseMatrix(["####A", "#####", "#####", "#####"]) };
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["dagger", "slash"], potions: 0 },
    monster,
    rng: createRng(3),
  });
  heroAttack(combat, "dagger", 0, 0);
  combat.phase = "hero";
  heroAttack(combat, "dagger", 1, 0);
  assert.equal(combat.combo, 1, "连用短剑：紧挨着也没落空，但只能从这一击重新起手");
  combat.phase = "hero";
  heroAttack(combat, "slash", 2, 0);
  assert.equal(combat.combo, 2, "换成斜刃，紧挨上一击");
  combat.phase = "hero";
  const armored = heroAttack(combat, "dagger", 0, 3);
  assert.ok(armored.events[0].hits.some((h) => h.before === 2), "打到了护甲心");
  assert.equal(combat.combo, 1, "离上一击太远：重新起手，但没有因为护甲而清零");
  combat.phase = "hero";
  heroAttack(combat, "slash", 1, 3);
  assert.equal(combat.combo, 2);
});

test("序章的墨渍怪：短剑 → 钩镰 → 短剑三下连成一串，拿到第一点充能", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "hook"], potions: 0 },
    monster: { def: MONSTERS.ink, matrix: MONSTERS.ink.matrixValues },
    rng: createRng(1),
  });
  heroAttack(combat, "dagger", 0, 0);
  monsterTurn(combat);
  heroAttack(combat, "hook", 1, 1);
  assert.equal(combat.combo, 2, "第二下就能看到「连击」");
  assert.equal(combat.energy, ENERGY_START - 1);
  monsterTurn(combat);
  heroAttack(combat, "dagger", 2, 2);
  assert.equal(combat.combo, 3, "连击 ×2");
  assert.equal(combat.energy, ENERGY_START, "连击 ×2 得到一点充能");
  assert.equal(combat.phase, "won", "三下拼完");
});

test("破甲强化：普通武器也能一击击碎护甲心", () => {
  const monster = { def: MONSTERS.rook, matrix: parseMatrix(["AA"]) };
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["hook"], potions: 0, upgrades: { hook: { pierce: true } } },
    monster,
    rng: createRng(1),
  });
  const result = heroAttack(combat, "hook", 0, 0);
  assert.ok(result.events[0].hits.every((h) => h.after === 0));
  assert.equal(combat.phase, "won");
  assert.ok(upgradeOptions({ weapons: ["hook", "awl"], upgrades: {} }, createRng(2), 99).some((o) => o.kind === "pierce" && o.weapon === "hook"));
  assert.ok(!upgradeOptions({ weapons: ["hook"], upgrades: {} }, createRng(2), 99, { pierce: false }).some((o) => o.kind === "pierce"), "护甲怪出场前不刷破甲");
  assert.ok(!upgradeOptions({ weapons: ["dagger", "slash"], upgrades: {} }, createRng(2), 99).some((o) => o.kind === "pierce" || o.kind === "extend"), "轻武器不能破甲、不能延长");
  assert.deepEqual(sanitizeUpgrades({ dagger: { pierce: true, rotate: true }, slash: { extend: true } }), { dagger: { rotate: true } }, "旧存档里不再允许的强化会被去掉");
  assert.ok(!upgradeOptions({ weapons: ["awl"], upgrades: {} }, createRng(2), 99).some((o) => o.kind === "pierce"), "破甲锥本来就破甲");
  assert.ok(!upgradeOptions({ weapons: ["hammer"], upgrades: {} }, createRng(2), 99, { stagger: false }).some((o) => o.kind === "stagger"), "蓄力怪出场前不刷震慑");
  assert.deepEqual(sanitizeUpgrades({ hammer: { steady: true }, hook: { steady: true } }), { hammer: { steady: true } }, "稳击只给重武器");
});

test("打断重击：怪物蓄力后，重武器一下打碎 3 颗心就能打断；震慑降到 2 颗", () => {
  const step = MONSTERS.knight.pattern.findIndex((p) => p.kind === "charge") + 1;
  const make = (upgrades = {}) => {
    const c = createCombat({
      hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "hammer"], potions: 0, upgrades },
      monster: { def: MONSTERS.knight, matrix: parseMatrix(["####", "####", "####"]), step },
      rng: createRng(1),
    });
    c.energy = ENERGY_MAX;
    return c;
  };
  const combat = make();
  assert.equal(combat.intent.name, "践踏");
  assert.equal(heroAttack(combat, "dagger", 0, 0).events.some((e) => e.type === "interrupt"), false, "短剑打不断");
  combat.phase = "hero";
  combat.combo = 0;
  assert.ok(heroAttack(combat, "hammer", 0, 1).events.some((e) => e.type === "interrupt"), "战锤一下打碎一大片");
  const before = countHearts(combat.heroMatrix).hearts;
  const turn = monsterTurn(combat);
  assert.ok(turn.events.some((e) => e.type === "interrupted"));
  assert.equal(countHearts(combat.heroMatrix).hearts, before, "践踏被打断，没有伤害");

  const weak = make();
  weak.monsterMatrix = parseMatrix(["##..", "....", "...."]);
  assert.equal(heroAttack(weak, "hammer", 0, 0).events.some((e) => e.type === "interrupt"), false, "只打碎 2 颗");
  const staggered = make({ hammer: { stagger: true } });
  staggered.monsterMatrix = parseMatrix(["##..", "....", "...."]);
  assert.ok(heroAttack(staggered, "hammer", 0, 0).events.some((e) => e.type === "interrupt"), "震慑：2 颗就够");
});
test("碎甲技能一下敲碎护甲心；连击不再附带破甲", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "slash"], potions: 0 },
    monster: { def: MONSTERS.rook, matrix: parseMatrix(["####", "####", "##AA"]) },
    rng: createRng(1),
  });
  heroAttack(combat, "dagger", 0, 0);
  combat.phase = "hero";
  heroAttack(combat, "slash", 1, 0);
  combat.phase = "hero";
  heroAttack(combat, "dagger", 1, 2);
  combat.phase = "hero";
  const res = heroAttack(combat, "slash", 1, 2);
  assert.ok(res.events[0].hits.some((h) => h.before === 2 && h.after === 1), "连击中的斜刃只敲掉一层护甲");
  const fresh = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger"], potions: 0, skills: { crush: 2 } },
    monster: { def: MONSTERS.rook, matrix: parseMatrix(["AA"]) },
    rng: createRng(1),
  });
  heroAttack(fresh, "crush", 0, 0);
  assert.equal(fresh.phase, "won", "碎甲一下敲碎两颗护甲心");
});
test("怪物回血：补回的格子连成一片、挨着现有的心；伤口旁的心先被打碎，回血就落空", () => {
  const healStep = MONSTERS.bishop.pattern.findIndex((p) => p.kind === "heal");
  const combat = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "slash"], potions: 0 },
    monster: { def: MONSTERS.bishop, matrix: withHoles(filledMatrix(3, 4), [[1, 1], [1, 2]]), step: healStep },
    rng: createRng(2),
  });
  assert.equal(combat.intent.kind, "heal");
  const plan = combat.healPlan;
  assert.ok(plan.length > 0);
  const keys = new Set(plan.map(([r, c]) => `${r},${c}`));
  assert.ok(plan.every(([r, c]) => combat.monsterMatrix[r][c] === 0), "补的都是空格");
  const linked = plan.every(([r, c]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => keys.has(`${r + dr},${c + dc}`) || combat.monsterMatrix[r + dr]?.[c + dc] > 0));
  assert.ok(linked, "连成一片并挨着心");
  heroWait(combat);
  monsterTurn(combat);
  assert.equal(countHearts(combat.monsterMatrix).hearts, 10 + Math.min(2, MONSTERS.bishop.pattern[healStep].amount));

  const island = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "slash", "hook"], potions: 0 },
    monster: { def: MONSTERS.bishop, matrix: withHoles(filledMatrix(3, 3), [[1, 1]]), step: healStep },
    rng: createRng(2),
  });
  assert.deepEqual(island.healPlan, [[1, 1]]);
  island.monsterMatrix = withHoles(filledMatrix(3, 3), [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]]);
  heroWait(island);
  monsterTurn(island);
  assert.equal(island.monsterMatrix[1][1], 0, "伤口四周的心都碎了，回血落空");
});
test("精准强化：这件武器连上时多得一点充能；轻武器拿不到", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["dagger", "hook"], potions: 0, upgrades: { hook: { precise: true } } },
    monster: { def: MONSTERS.knight, matrix: parseMatrix(["####", "####"]) },
    rng: createRng(3),
  });
  heroAttack(combat, "dagger", 0, 0);
  combat.phase = "hero";
  heroAttack(combat, "hook", 0, 2);
  assert.equal(combat.combo, 2);
  assert.equal(combat.energy, ENERGY_START, "开局的充能 − 钩镰 1 + 精准 1");
  assert.deepEqual(sanitizeUpgrades({ dagger: { precise: true }, hook: { precise: true } }), { hook: { precise: true } });
});
test("铁砧：三项强化固定不变，每项只能刷新一次", () => {
  const hero = { weapons: ["dagger", "hook", "spear"], upgrades: {} };
  const options = createForgeOptions(hero, createRng(4));
  assert.equal(options.length, 3);
  const before = JSON.stringify(options[0]);
  assert.equal(rerollForgeOption(hero, options, 0, createRng(5)).ok, true);
  assert.notEqual(JSON.stringify(options[0]), before);
  assert.equal(rerollForgeOption(hero, options, 0, createRng(6)).ok, false, "同一项不能刷新第二次");
  const keys = options.map((o) => `${o.weapon}:${o.kind}`);
  assert.equal(new Set(keys).size, 3, "刷新后三项仍互不相同");
});

test("武器槽与技能槽：装备数量不超过槽位，技能最多携带三个", () => {
  const board = createBoard(level("pawn-line"), { weapons: weaponsForLevel(at("pawn-line"), STARTING_WEAPONS), skills: skillsForLevel(at("checkmate"), SKILLS) });
  assert.equal(board.hero.slots, 2);
  assert.equal(board.hero.equipped.length, 2);
  assert.ok(board.hero.weapons.length > board.hero.slots, "武器种类多于武器槽");
  assert.equal(toggleEquip(board.hero, "slash").ok, false, "槽位已满");
  toggleEquip(board.hero, board.hero.equipped[0]);
  assert.equal(toggleEquip(board.hero, "slash").ok, true);
  assert.equal(board.hero.equippedSkills.length, SKILL_SLOTS);
  const extra = Object.keys(board.hero.skills).find((id) => !board.hero.equippedSkills.includes(id));
  assert.equal(toggleSkill(board.hero, extra).ok, false, "技能槽已满");
  for (const [index, level] of LEVELS.entries())
    if (index > 1) assert.ok(weaponsForLevel(index, STARTING_WEAPONS).length > level.slots, `${level.name} 武器种类应多于槽位`);
  const combat = createCombat({ hero: board.hero, monster: { def: MONSTERS.ink, matrix: MONSTERS.ink.matrixValues } });
  assert.equal(combat.weapons.filter((w) => w.kind === "weapon").length, 2, "战斗只带装备中的武器");
  assert.equal(combat.weapons.filter((w) => w.kind === "skill").length, SKILL_SLOTS);
});

test("构筑沿用存档：武器槽变多不会从背包自动补上，新技能不会顶掉已带的技能", () => {
  const weapons = weaponsForLevel(at("bishop-hall"), STARTING_WEAPONS);
  const board = createBoard(level("bishop-hall"), { weapons, equipped: ["dagger", "hook"], skills: skillsForLevel(at("bishop-hall"), SKILLS) });
  assert.equal(board.hero.slots, 3);
  assert.deepEqual(board.hero.equipped, ["dagger", "hook"], "空出来的第三个槽留给玩家自己决定");
  const fresh = createBoard(level("bishop-hall"), { weapons });
  assert.equal(fresh.hero.equipped.length, 3, "没有存档时按获得顺序装满");

  const known = ["swift", "stun", "crush", "meteor"];
  const full = createBoard(level("queen-gallery"), {
    weapons: weaponsForLevel(at("queen-gallery"), STARTING_WEAPONS),
    skills: skillsForLevel(at("queen-gallery"), SKILLS),
    equippedSkills: ["swift", "stun", "meteor"],
    knownSkills: known,
  });
  assert.deepEqual(full.hero.equippedSkills, ["swift", "stun", "meteor"], "技能槽已满：新学会的汲血进背包");
  assert.ok("drain" in full.hero.skills);
  const roomy = createBoard(level("queen-gallery"), {
    weapons: weaponsForLevel(at("queen-gallery"), STARTING_WEAPONS),
    skills: skillsForLevel(at("queen-gallery"), SKILLS),
    equippedSkills: ["swift"],
    knownSkills: known,
  });
  assert.deepEqual(roomy.hero.equippedSkills, ["swift", "drain"], "有空槽才放进新技能，卸下的旧技能不会被自动装回");
});

test("重玩旧章节：保留已解锁的武器槽，拿过的宝箱不再出现，用过的铁砧不能再用", () => {
  const weapons = weaponsForLevel(at("checkmate"), STARTING_WEAPONS);
  const hall = level("bishop-hall");
  const forgeKey = hall.map.flatMap((line, r) => [...line.replace(/\s+/g, "")].map((ch, c) => (ch === "U" ? `${r},${c}` : null))).find(Boolean);
  const board = createBoard(hall, { weapons, equipped: weapons.slice(0, 5), minSlots: 5, usedForges: [forgeKey] });
  assert.equal(board.hero.slots, 5);
  assert.equal(board.hero.equipped.length, 5);
  const items = [...board.items.values()];
  assert.equal(items.find((i) => i.type === "chest"), undefined, "月镰已经拿过，宝箱不再出现");
  assert.ok(items.find((i) => i.type === "forge").opened);
});

test("等待：武器全部冷却、没有药水时也能结束回合，不会卡死", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["hook"], potions: 0 },
    monster: { def: MONSTERS.pawn, matrix: MONSTERS.pawn.matrixValues },
    rng: createRng(1),
  });
  heroAttack(combat, "hook", 1, 1);
  monsterTurn(combat);
  assert.ok(slotBlocked(combat, combat.weapons[0]), "钩镰在冷却");
  assert.equal(heroWait(combat).ok, true);
  assert.equal(combat.phase, "monster");
});

test("怪物心阵按章节分档成长：前期够连上几下，后期越来越厚", () => {
  const hearts = (id, rank) => countHearts(heartsAt(MONSTERS[id], rank)).hearts;
  assert.equal(hearts("ink", 0), 7, "序章的墨渍怪三下能拼完");
  assert.ok(hearts("pawn", 0) < hearts("pawn", 1) && hearts("pawn", 1) < hearts("pawn", 2));
  assert.ok(hearts("knight", 1) - hearts("knight", 0) < hearts("knight", 2) - hearts("knight", 1) + 2, "越往后涨得越多");
  assert.equal(heartsAt(MONSTERS.bishop, 0), heartsAt(MONSTERS.bishop, 1), "没写的档位沿用最近的一档");
  const late = createBoard(LEVELS[9], { weapons: STARTING_WEAPONS });
  const rook = late.monsters.find((m) => m.def.id === "rook");
  assert.equal(countHearts(rook.matrix).slots, countHearts(heartsAt(MONSTERS.rook, 2)).slots, "棋盘按本章的档位生成怪物");
});

test("名字长度按显示宽度计：中文最多 9 个字，英文最多 18 个字母", () => {
  assert.equal(nameWidth("屿屿"), 4);
  assert.equal(nameWidth("Yuyu"), 4);
  assert.equal(NAME_MAX_WIDTH, 18);

  // 中文：9 个字刚好，10 个字超限
  assert.equal(validateName("一二三四五六七八九").ok, true);
  assert.equal(validateName("一二三四五六七八九十").ok, false);
  // 英文：18 个字母刚好，19 个超限
  assert.equal(validateName("a".repeat(18)).ok, true);
  assert.equal(validateName("a".repeat(19)).ok, false);
  // 中英混写按宽度折算：4 个汉字（8）+ 10 个字母（10）= 18 刚好，再多一个字母就超限
  assert.equal(validateName("四个汉字" + "a".repeat(10)).ok, true);
  assert.equal(validateName("四个汉字" + "a".repeat(11)).ok, false);
});

test("名字校验：去掉首尾空格、拒绝空名与危险字符", () => {
  assert.deepEqual(validateName("  小 明  ").name, "小 明");
  assert.equal(validateName("").ok, false);
  assert.equal(validateName("   ").ok, false);
  assert.equal(validateName(undefined).ok, false);
  // 名字会被拼进页面，HTML 特殊字符一律拒绝
  for (const bad of ["<b>", "a&b", 'a"b', "a'b", "<script>", "a/b", "😀"]) {
    assert.equal(validateName(bad).ok, false, `${bad} 应被拒绝`);
  }
  // 其他语言的文字、数字和常见符号可以
  for (const good of ["Yuyu", "Léa", "Никита", "さくら", "Tom_2", "A.B-C", "小明·大王"]) {
    assert.equal(validateName(good).ok, true, `${good} 应被接受`);
  }
});

test("主角名会出现在战斗日志与技能、章节文案里；不合格的名字退回默认名", () => {
  try {
    assert.equal(getHeroName(), DEFAULT_HERO_NAME);
    assert.equal(setHeroName("阿福"), "阿福");
    assert.equal(getHeroName(), "阿福");

    const board = createBoard(LEVELS[0], { weapons: STARTING_WEAPONS });
    const combat = createCombat({ hero: board.hero, monster: board.monsters[0], heroFirst: true, rng: createRng(1) });
    assert.ok(combat.log.some((line) => line.includes("阿福")), "战斗日志应使用玩家的名字");
    assert.ok(!combat.log.some((line) => line.includes(DEFAULT_HERO_NAME)), "不应再出现默认名");

    assert.ok(SKILLS.drain.desc.includes("阿福"));
    assert.ok(LEVELS[0].story.includes("阿福"));
    assert.ok(LEVELS[1].story.includes("阿福"));

    assert.equal(setHeroName("<b>"), DEFAULT_HERO_NAME);
    assert.equal(setHeroName(""), DEFAULT_HERO_NAME);
  } finally {
    setHeroName("");
  }
});

/**
 * 前期、中期（rank 0、1）的怪物要求能用一条不断的连击整片拼完；
 * 后期（rank 2）心阵大、招式多，整片搜索太慢也太吃内存，只要求能连出一次追击。
 */
test("怪物心阵是给武器拼的：首次登场时，用当时的武器能一条连击拼完（后期至少能打出追击），且比短剑硬磨快", () => {
  const checked = new Set();
  LEVELS.forEach((level, index) => {
    const owned = weaponsForLevel(index, STARTING_WEAPONS);
    for (const spec of level.monsters) {
      const def = MONSTERS[spec.type];
      const matrix = heartsAt(def, level.rank);
      const id = `${def.id}:${JSON.stringify(matrix)}`;
      // 序章只有短剑、还没学连击：这一档留到有两件武器的章节再验证。
      if (checked.has(id) || owned.length < 2) continue;
      checked.add(id);
      const late = level.rank >= 2;
      const best = solveChain({ def, matrix, weapons: owned, slots: level.slots, maxTurns: late ? 4 : 6, until: late ? "chase" : "won" });
      assert.ok(best, `${level.name}的${def.name}找不到连击路线`);
      if (!late) {
        const grind = grindTurns({ def, matrix, weapon: "dagger" });
        assert.ok(best.turns < grind, `${level.name}的${def.name}：连击 ${best.turns} 回合，短剑硬磨 ${grind} 回合`);
      }
    }
  });
});

test("护甲片：走上去拾取；给田字范围内的红心加护甲，空位不受影响；护甲心要挨两下", () => {
  const board = createBoard(LEVELS[2], { weapons: weaponsForLevel(2, STARTING_WEAPONS) });
  const plate = [...board.items.values()].find((i) => i.type === "plate");
  assert.ok(plate, "第 2 章有护甲片");
  board.items.delete(key(plate.r, plate.c));
  board.hero.plates = 1;
  board.hero.matrix[0][1] = 0;
  assert.deepEqual(hitSet(previewPlate(board, 0, 0)), ["0,0", "1,0", "1,1"], "空掉的格子不会长出护甲");
  assert.equal(armorHero(board, -5, -5).ok, false, "完全落在界外");
  assert.equal(armorHero(board, 0, 0).ok, true);
  assert.equal(board.hero.plates, 0);
  assert.equal(countHearts(board.hero.matrix).armor, 3);
  assert.equal(armorHero(board, 2, 2).ok, false, "护甲片用完了");
  const hits = resolveHits(board.hero.matrix, WEAPONS.dagger.shape, 1, 0);
  assert.deepEqual(hits.map((h) => h.after), [1, 1], "先掉护甲，红心还在");
});

test("机制按章节解锁：序章只有短剑和攻击；钩镰是序章奖励；没解锁的动作用不了、也不计连击", () => {
  assert.deepEqual([...featuresAt(0)], [], "序章什么都没解锁");
  assert.deepEqual([...featuresAt(1)].sort(), ["combo", "energy", "potion"]);
  assert.ok(featuresAt(2).has("shield") && featuresAt(2).has("wait") && !featuresAt(2).has("retreat"));
  assert.ok(featuresAt(3).has("retreat"));
  assert.deepEqual(STARTING_WEAPONS, ["dagger"]);
  assert.deepEqual(weaponsForLevel(0, STARTING_WEAPONS), ["dagger"]);
  assert.deepEqual(weaponsForLevel(1, STARTING_WEAPONS), ["dagger", "hook"], "通关序章拿到钩镰");
  assert.equal(WEAPONS.hook.name, "钩镰");

  const combat = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "hook"], potions: 1 },
    monster: { def: MONSTERS.ink, matrix: MONSTERS.ink.matrixValues },
    rng: createRng(1),
    features: featuresAt(0),
  });
  assert.equal(heroShield(combat).ok, false);
  assert.equal(heroWait(combat).ok, false);
  assert.equal(heroRetreat(combat).ok, false);
  assert.equal(heroHeal(combat, 2, 2).ok, false);
  heroAttack(combat, "dagger", 0, 0);
  monsterTurn(combat);
  heroAttack(combat, "hook", 1, 1);
  assert.equal(combat.combo, 0, "没学连击时不计连击");
  assert.equal(combat.energy, ENERGY_START - 1, "也不会因为连击得充能");
});
