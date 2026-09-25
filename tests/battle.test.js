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
  useForge,
  lineOfSight,
  isVisible,
  isExplored,
  visibleMonsterAt,
  key,
} from "../src/battle/logic/board.js";
import { WEAPONS, STARTING_WEAPONS } from "../src/battle/data/weapons.js";
import { MONSTERS } from "../src/battle/data/monsters.js";
import { LEVELS, weaponsForLevel, skillsForLevel } from "../src/battle/data/levels.js";
import { SKILLS } from "../src/battle/data/skills.js";
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
} from "../src/battle/logic/arsenal.js";
import { transformShape, shapeKey } from "../src/battle/logic/shapes.js";

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
  const hits = resolveHits(m, WEAPONS.hammer.shape, 0, 0);
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
  assert.deepEqual(WEAPONS.hook.shape.pivot, [0, 0], "L 钩镰以左上角为锚点");
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
  heroAttack(combat, "dagger", 1, 0);
  monsterTurn(combat);
  assert.equal(combat.weapons[1].cd, 0, "再过一回合恢复");
  while (combat.phase !== "won") {
    const target = rankPlacements(combat.monsterMatrix, WEAPONS.dagger.shape)[0];
    heroAttack(combat, "dagger", target.r, target.c);
    if (combat.phase === "monster") monsterTurn(combat);
  }
  assert.ok(isDead(combat.monsterMatrix));
});

test("暗王的「将军」让有冷却的武器延后一回合，短剑不受影响", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(5, 5), weapons: ["dagger", "hook"], potions: 0 },
    monster: { def: MONSTERS.king, matrix: MONSTERS.king.matrixValues, step: 1 },
    rng: createRng(4),
  });
  assert.equal(combat.intent.kind, "curse");
  heroAttack(combat, "dagger", 2, 0);
  monsterTurn(combat);
  assert.equal(combat.weapons[0].cd, 0);
  assert.equal(combat.weapons[1].cd, 1);
});

test("木盾不消耗回合并挡下一次攻击；药水恢复十字范围", () => {
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
      if (item && item.type !== "key") continue;
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
  const board = createBoard(LEVELS[1], { weapons: STARTING_WEAPONS });
  const result = heroMove(board, 6, 3);
  assert.equal(result.kind, "moved");
  const fight = heroMove(board, 5, 3);
  assert.equal(fight.kind, "battle");
  assert.equal(fight.heroFirst, true);
  const combat = createCombat({ hero: board.hero, monster: fight.monster, rng: createRng(2) });
  while (combat.phase !== "won") {
    const target = rankPlacements(combat.monsterMatrix, WEAPONS.dagger.shape)[0];
    heroAttack(combat, "dagger", target.r, target.c);
    if (combat.phase === "monster") monsterTurn(combat);
  }
  resolveBattle(board, fight.monster, combat, true);
  assert.deepEqual([board.hero.r, board.hero.c], [5, 3]);
  assert.equal(fight.monster.alive, false);
});

test("骑士按马步追击，扑到主角时触发突袭", () => {
  const board = createBoard(LEVELS[2], { weapons: STARTING_WEAPONS });
  const knight = board.monsters.find((m) => m.def.id === "knight");
  board.hero.r = 5;
  board.hero.c = 5;
  const step = chaseStep(board, knight);
  assert.deepEqual(step, { r: 5, c: 5 });
  const outcome = advanceMonsters(board);
  assert.equal(outcome.ambush, knight);
});

test("怪物不会踏上道具、门和出口", () => {
  const board = createBoard(LEVELS[2], { weapons: STARTING_WEAPONS });
  assert.equal(monsterCanStand(board, 0, 7), false);
  assert.equal(monsterCanStand(board, 1, 0), false);
  assert.equal(monsterCanStand(board, 0, 0), false);
});

test("钥匙打开铁栅门；暗王被击败后出口才开放", () => {
  const board = createBoard(LEVELS[2], { weapons: STARTING_WEAPONS });
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

  const final = createBoard(LEVELS[8], { weapons: STARTING_WEAPONS });
  assert.equal(final.exitOpen, false);
  const king = final.monsters.find((m) => m.def.boss);
  resolveBattle(final, king, { heroMatrix: final.hero.matrix, monsterMatrix: king.matrix, potions: 0, step: 0, phase: "won", stats: { taken: 0 } }, false);
  assert.equal(final.exitOpen, true);
});

test("宝箱和药水需要站在相邻格主动拾取，路过不会拾取；宝箱打开后仍然挡路", () => {
  const board = createBoard(LEVELS[1], { weapons: [...STARTING_WEAPONS] });
  assert.equal(heroCanEnter(board, 6, 2).ok, false, "宝箱格不能踩上");
  assert.equal(pickupAt(board, 6, 2).ok, false, "不相邻时不能拾取");
  const moved = heroMove(board, 6, 3);
  assert.equal(moved.events.some((e) => e.type === "pickup"), false, "路过不拾取");
  assert.equal(board.hero.weapons.includes("spear"), false);
  assert.equal(pickupAt(board, 6, 2).ok, true);
  assert.ok(board.hero.weapons.includes("spear"));
  assert.equal(pickupAt(board, 6, 2).ok, false, "同一个宝箱只能打开一次");
  assert.equal(heroCanEnter(board, 6, 2).ok, false, "打开的宝箱留在原地");
  const potions = board.hero.potions;
  board.hero.r = 7;
  board.hero.c = 6;
  assert.equal(pickupAt(board, 6, 6).ok, true);
  assert.equal(board.hero.potions, potions + 1);
  assert.equal(board.items.has(key(6, 6)), false, "药水被拿走后格子空出来");
});

test("视线会被障碍挡住", () => {
  const level = {
    ...LEVELS[1],
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
  const board = createBoard(level, { weapons: STARTING_WEAPONS });
  assert.equal(lineOfSight(board, { r: 4, c: 0 }, { r: 4, c: 2 }), false);
  assert.equal(lineOfSight(board, { r: 4, c: 0 }, { r: 4, c: 1 }), true, "障碍本身看得见");
  assert.equal(lineOfSight(board, { r: 4, c: 0 }, { r: 2, c: 0 }), true);
});

test("战争迷雾：只显示视野内的格子与怪物，走过的区域留下记忆，出口始终可见", () => {
  const board = createBoard(LEVELS[5], { weapons: STARTING_WEAPONS });
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

test("强化：延长一格让形状多一格；候选项不会重复已有的强化；强化会带进战斗", () => {
  for (const [id, weapon] of Object.entries(WEAPONS)) assert.equal(weapon.plusShape.size, weapon.shape.size + 1, id);
  const hero = { weapons: ["dagger", "hammer"], upgrades: {} };
  const all = upgradeOptions(hero, createRng(1), 10).map((o) => `${o.weapon}:${o.kind}`).sort();
  assert.deepEqual(all, ["dagger:extend", "dagger:precise", "dagger:rotate", "hammer:extend", "hammer:precise"]);
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
  assert.equal(weaponShape("dagger", { dagger: { extend: true } }).size, 3);
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
  assert.deepEqual(skillsForLevel(1, SKILLS), {});
  assert.deepEqual(skillsForLevel(2, SKILLS), { swift: 2 });
  assert.deepEqual(skillsForLevel(8, SKILLS), { swift: 2, stun: 1, meteor: 1, drain: 1 });
  const board = createBoard(LEVELS[3], { weapons: weaponsForLevel(3, STARTING_WEAPONS) });
  const forge = [...board.items.values()].find((i) => i.type === "forge");
  board.hero.r = forge.r + 1;
  board.hero.c = forge.c;
  assert.equal(pickupAt(board, forge.r, forge.c).events[0].type, "forge");
  assert.equal(pickupAt(board, forge.r, forge.c).ok, true, "未选择前可以再次打开");
  useForge(board, forge.r, forge.c);
  assert.equal(pickupAt(board, forge.r, forge.c).ok, false, "铁砧只能用一次");
});

test("连击：完美命中累积连击，不完美的攻击清零；连击 2 起返还冷却，连击 3 获得追击", () => {
  const monster = { def: MONSTERS.knight, matrix: parseMatrix(["####", "####", "####"]) };
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["dagger", "hook", "spear"], potions: 0 },
    monster,
    rng: createRng(3),
  });
  heroAttack(combat, "hook", 0, 0);
  assert.equal(combat.combo, 1, "L 钩镰三格都落在红心上");
  assert.equal(combat.phase, "monster");
  monsterTurn(combat);
  assert.equal(combat.weapons[1].cd, 1);
  heroAttack(combat, "dagger", 0, 2);
  assert.equal(combat.combo, 2);
  assert.equal(combat.weapons[1].cd, 0, "连击 2：其他武器冷却减 1");
  monsterTurn(combat);
  const result = heroAttack(combat, "hook", 1, 2);
  assert.equal(combat.combo, 3);
  assert.equal(combat.phase, "hero", "连击 3：追击，怪物暂不行动");
  assert.ok(result.events.some((e) => e.type === "bonus"));
  assert.equal(heroAttack(combat, "dagger", 1, 0).ok, true, "一半落在空位、一半落在红心");
  assert.equal(combat.combo, 0, "打到空位，连击中断");
});

test("精准强化：完美命中时连击额外加 1 并恢复 1 颗红心", () => {
  const hurt = filledMatrix(4, 4);
  hurt[3][3] = 0;
  const combat = createCombat({
    hero: { matrix: hurt, weapons: ["dagger"], potions: 0, upgrades: { dagger: { precise: true } } },
    monster: { def: MONSTERS.knight, matrix: parseMatrix(["####", "####"]) },
    rng: createRng(3),
  });
  heroAttack(combat, "dagger", 0, 0);
  assert.equal(combat.combo, 2);
  assert.equal(countHearts(combat.heroMatrix).hearts, 16);
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

test("武器槽与技能槽：装备数量不超过槽位，技能最多携带两个", () => {
  const board = createBoard(LEVELS[2], { weapons: weaponsForLevel(2, STARTING_WEAPONS), skills: skillsForLevel(8, SKILLS) });
  assert.equal(board.hero.slots, 2);
  assert.equal(board.hero.equipped.length, 2);
  assert.ok(board.hero.weapons.length > board.hero.slots, "武器种类多于武器槽");
  assert.equal(toggleEquip(board.hero, "spear").ok, false, "槽位已满");
  toggleEquip(board.hero, board.hero.equipped[0]);
  assert.equal(toggleEquip(board.hero, "spear").ok, true);
  assert.equal(board.hero.equippedSkills.length, SKILL_SLOTS);
  const extra = Object.keys(board.hero.skills).find((id) => !board.hero.equippedSkills.includes(id));
  assert.equal(toggleSkill(board.hero, extra).ok, false, "技能槽已满");
  for (const [index, level] of LEVELS.entries())
    if (index > 1) assert.ok(weaponsForLevel(index, STARTING_WEAPONS).length > level.slots, `${level.name} 武器种类应多于槽位`);
  const combat = createCombat({ hero: board.hero, monster: { def: MONSTERS.ink, matrix: MONSTERS.ink.matrixValues } });
  assert.equal(combat.weapons.filter((w) => w.kind === "weapon").length, 2, "战斗只带装备中的武器");
  assert.equal(combat.weapons.filter((w) => w.kind === "skill").length, SKILL_SLOTS);
});

test("等待：武器全部冷却、没有药水时也能结束回合，不会卡死", () => {
  const combat = createCombat({
    hero: { matrix: filledMatrix(4, 4), weapons: ["hook"], potions: 0 },
    monster: { def: MONSTERS.pawn, matrix: MONSTERS.pawn.matrixValues },
    rng: createRng(1),
  });
  heroAttack(combat, "hook", 1, 1);
  monsterTurn(combat);
  assert.ok(slotBlocked(combat, combat.weapons[0]), "L 钩镰在冷却");
  assert.equal(heroWait(combat).ok, true);
  assert.equal(combat.phase, "monster");
});
