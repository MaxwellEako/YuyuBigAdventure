import { createCombat, createRng, heroAttack, monsterTurn, slotOf, slotShape, slotBlocked, comboOutcome } from "../../src/battle/logic/combat.js";
import { allAnchors, cloneMatrix, filledMatrix } from "../../src/battle/logic/shapes.js";

/**
 * 连击路线求解器（只给测试和平衡用，不进游戏包）。
 *
 * 用真正的战斗规则（heroAttack / monsterTurn）去搜：从第一击起，每一击都必须“不落空、换武器、紧挨上一击”，
 * 也就是一条不断的连击。按回合数做迭代加深搜索，找到用最少回合把怪物打倒的那条路线。
 * 这样能验证怪物心阵是不是真的能用手头的武器“拼”出来，而不是靠写死的答案。
 */

/** 复制一份战斗状态，供搜索时分叉。rng 共用同一个种子序列，保证结果可复现。 */
function cloneCombat(state) {
  return {
    ...state,
    heroMatrix: cloneMatrix(state.heroMatrix),
    monsterMatrix: cloneMatrix(state.monsterMatrix),
    weapons: state.weapons.map((w) => ({ ...w, orient: { ...(w.orient ?? {}) } })),
    lastFootprint: state.lastFootprint?.map(([r, c]) => [r, c]) ?? null,
    healPlan: state.healPlan?.map(([r, c]) => [r, c]) ?? null,
    stats: { ...state.stats },
    log: [],
  };
}

/**
 * 当前这一步所有能接上连击的出招：[{ id, r, c }]。第一击只要不落空即可。
 * used 为这条路线已经用过的武器；已经用满 slots 件时只能从中挑（相当于只带了这几件出战）。
 */
function linkingMoves(state, used, slots) {
  const moves = [];
  for (const slot of state.weapons) {
    if (slot.kind !== "weapon" || slotBlocked(state, slot)) continue;
    if (used.size >= slots && !used.has(slot.id)) continue;
    const shape = slotShape(state, slot);
    for (const [r, c] of allAnchors(state.monsterMatrix, shape)) {
      const outcome = comboOutcome(state, shape, r, c, slot.id);
      if (outcome === "link" || (outcome === "start" && state.combo === 0)) moves.push({ id: slot.id, r, c });
    }
  }
  return moves;
}

/**
 * 在不超过 maxTurns 个主角回合内，找一条不断的连击。
 * weapons 为拥有的全部武器，slots 为武器槽数：路线里最多用到 slots 件不同的武器。
 * 这样一次搜索就覆盖了所有出战搭配，不必把每种搭配各搜一遍。
 * until 为 "won" 时要一路把怪物打倒；为 "chase" 时打出第一次追击就算成功（用于精英和首领）。
 * 找到时返回 { turns, moves, weapons }（用掉的主角回合数、每一击的武器与落点、用到的武器），找不到返回 null。
 */
export function solveChain({ def, matrix, weapons, slots = weapons.length, upgrades = {}, minTurns = 1, maxTurns = 6, seed = 7, until = "won" }) {
  const root = createCombat({
    hero: { matrix: filledMatrix(7, 7), weapons, upgrades, skills: {}, potions: 0 },
    monster: { def, matrix: cloneMatrix(matrix) },
    heroFirst: true,
    rng: createRng(seed),
  });

  // 置换表：同一个局面（心阵、上一击、充能、冷却……）在剩余回合不多于上次时已经搜过且失败，就不再重复搜。
  const failed = new Map();
  const stateKey = (state, used) =>
    [
      [...used].sort().join(","),
      state.monsterMatrix.map((row) => row.join("")).join("/"),
      state.lastWeaponId,
      state.lastFootprint?.join(";"),
      state.energy,
      state.combo,
      state.bonus,
      state.step,
      state.weapons.map((w) => w.cd).join(""),
    ].join("|");

  /** 深度优先：turnsLeft 为还能用的主角回合数（包括当前回合）。 */
  const search = (state, turnsLeft, path) => {
    const used = new Set(path.map((m) => m.id));
    const k = stateKey(state, used);
    if ((failed.get(k) ?? 0) >= turnsLeft) return null;
    const found = explore(state, turnsLeft, path, used);
    if (!found) failed.set(k, turnsLeft);
    return found;
  };

  const explore = (state, turnsLeft, path, used) => {
    for (const move of linkingMoves(state, used, slots)) {
      const next = cloneCombat(state);
      const result = heroAttack(next, move.id, move.r, move.c);
      if (!result.ok) continue;
      const nextPath = [...path, move];
      if (next.phase === "won") return nextPath;
      if (until === "chase" && result.events.some((e) => e.type === "combo" && e.chase)) return nextPath;
      if (next.phase === "hero") {
        // 追击或突刺：同一回合里再出一招。
        const found = search(next, turnsLeft, nextPath);
        if (found) return found;
        continue;
      }
      if (turnsLeft <= 1) continue;
      monsterTurn(next);
      if (next.phase !== "hero") continue;
      const found = search(next, turnsLeft - 1, nextPath);
      if (found) return found;
    }
    return null;
  };

  for (let turns = minTurns; turns <= maxTurns; turns += 1) {
    const moves = search(root, turns, []);
    if (moves) return { turns, moves, weapons: [...new Set(moves.map((m) => m.id))] };
  }
  return null;
}

/** 对照组：只用一件武器一下一下磨，要几个回合（不考虑连击）。 */
export function grindTurns({ def, matrix, weapon, seed = 7 }) {
  const state = createCombat({
    hero: { matrix: filledMatrix(7, 7), weapons: [weapon], upgrades: {}, skills: {}, potions: 0 },
    monster: { def, matrix: cloneMatrix(matrix) },
    heroFirst: true,
    rng: createRng(seed),
  });
  let turns = 0;
  while (state.phase === "hero" && turns < 40) {
    turns += 1;
    const slot = slotOf(state, weapon);
    const shape = slotShape(state, slot);
    // 贪心：每次挑消除最多的落点。
    let best = null;
    for (const [r, c] of allAnchors(state.monsterMatrix, shape)) {
      const probe = cloneCombat(state);
      const res = heroAttack(probe, weapon, r, c);
      if (!res.ok) continue;
      const gain = probe.stats.dealt - state.stats.dealt;
      if (!best || gain > best.gain) best = { r, c, gain };
    }
    heroAttack(state, weapon, best.r, best.c);
    if (state.phase === "monster") monsterTurn(state);
  }
  return turns;
}
