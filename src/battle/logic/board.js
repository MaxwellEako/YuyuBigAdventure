import { MONSTERS, MOVE_SETS } from "../data/monsters.js";
import { cloneMatrix, filledMatrix, countHearts } from "./shapes.js";
import { skillCharges } from "./combat.js";
import { defaultEquip, SKILL_SLOTS } from "./arsenal.js";

/** 棋盘上的静物障碍（字符 → 道具种类），渲染层据此摆放不同高矮的灰色几何体。 */
export const PROPS = {
  b: "books",
  c: "candle",
  i: "inkwell",
  d: "dice",
  t: "teacup",
  w: "watch",
};

export const ORTHO = MOVE_SETS.orth;
export const key = (r, c) => `${r},${c}`;

/** 把关卡定义实例化成可变的棋盘状态。 */
export function createBoard(level, { weapons, upgrades = {}, skills = {}, equipped = [], equippedSkills = [] }) {
  const slots = level.slots ?? weapons.length;
  // 技能槽：本章新学会的技能优先，其次沿用上次的选择，再按学会顺序补齐。
  const learned = Object.keys(skills);
  const skillPick = [];
  for (const id of [level.skill, ...equippedSkills, ...[...learned].reverse()])
    if (id && learned.includes(id) && !skillPick.includes(id) && skillPick.length < SKILL_SLOTS) skillPick.push(id);
  const size = level.map.length;
  const tiles = [];
  const items = new Map();
  const doors = new Set();
  let start = null;
  let exit = null;
  level.map.forEach((line, r) => {
    const row = [];
    [...line.replace(/\s+/g, "")].forEach((ch, c) => {
      row.push(PROPS[ch] ? { prop: PROPS[ch] } : { prop: null });
      if (ch === "S") start = { r, c };
      if (ch === "E") exit = { r, c };
      if (ch === "P") items.set(key(r, c), { type: "potion", r, c });
      if (ch === "K") items.set(key(r, c), { type: "key", r, c });
      if (ch === "H")
        items.set(key(r, c), { type: "chest", r, c, weapon: level.chest });
      if (ch === "L") doors.add(key(r, c));
      if (ch === "U") items.set(key(r, c), { type: "forge", r, c });
    });
    tiles.push(row);
  });
  if (!start || !exit) throw new Error(`关卡 ${level.id} 缺少起点或出口`);
  const monsters = level.monsters.map((spec, index) => {
    const def = MONSTERS[spec.type];
    return {
      uid: `${spec.type}-${index}`,
      def,
      r: spec.at[0],
      c: spec.at[1],
      matrix: cloneMatrix(def.matrixValues),
      step: 0,
      ai: spec.ai ?? "static",
      sight: spec.sight ?? 0,
      path: spec.path ?? null,
      pathIndex: 0,
      pathDir: 1,
      every: spec.every ?? 1,
      drop: spec.drop ?? null,
      aggro: false,
      stun: 0,
      alive: true,
      seen: !level.fog,
    };
  });
  const state = {
    level,
    size,
    tiles,
    items,
    doors,
    exit,
    exitOpen: level.goal !== "boss",
    hero: {
      r: start.r,
      c: start.c,
      matrix: filledMatrix(level.hero.rows, level.hero.cols),
      weapons: [...weapons],
      slots,
      equipped: defaultEquip(weapons, equipped, slots),
      upgrades: JSON.parse(JSON.stringify(upgrades)),
      skills: { ...skills },
      equippedSkills: skillPick,
      potions: level.potions ?? 0,
      keys: 0,
    },
    monsters,
    turn: 0,
    stats: { battles: 0, retreats: 0, damage: 0 },
    over: null,
    fog: level.fog ? { radius: level.fog.radius, visible: new Set(), explored: new Set() } : null,
  };
  updateVisibility(state);
  return state;
}

// ——— 战争迷雾 ———

/**
 * 从主角到目标格的视线：沿 Bresenham 直线走过的中间格里只要有障碍，视线就被挡住。
 * 起点和终点本身不算遮挡（障碍格自己是看得见的）。
 */
export function lineOfSight(state, from, to) {
  let r = from.r;
  let c = from.c;
  const dr = Math.abs(to.r - r);
  const dc = Math.abs(to.c - c);
  const sr = Math.sign(to.r - r);
  const sc = Math.sign(to.c - c);
  let err = dc - dr;
  while (r !== to.r || c !== to.c) {
    const e2 = err * 2;
    if (e2 > -dr) {
      err -= dr;
      c += sc;
    }
    if (e2 < dc) {
      err += dc;
      r += sr;
    }
    if ((r !== to.r || c !== to.c) && state.tiles[r][c].prop) return false;
  }
  return true;
}

/** 重新计算当前可见格与已探索格；出口始终算作已探索，作为方向地标。 */
export function updateVisibility(state) {
  if (!state.fog) return;
  const { radius } = state.fog;
  const visible = new Set();
  for (let r = 0; r < state.size; r += 1)
    for (let c = 0; c < state.size; c += 1) {
      const dr = r - state.hero.r;
      const dc = c - state.hero.c;
      if (dr * dr + dc * dc > radius * radius) continue;
      if (lineOfSight(state, state.hero, { r, c })) visible.add(key(r, c));
    }
  state.fog.visible = visible;
  for (const k of visible) state.fog.explored.add(k);
  state.fog.explored.add(key(state.exit.r, state.exit.c));
  for (const m of state.monsters) if (m.alive && visible.has(key(m.r, m.c))) m.seen = true;
}

export const isVisible = (state, r, c) => !state.fog || state.fog.visible.has(key(r, c));
export const isExplored = (state, r, c) => !state.fog || state.fog.explored.has(key(r, c));

/** 玩家眼中的怪物：迷雾里看不见的怪物不算。 */
export function visibleMonsterAt(state, r, c) {
  const m = monsterAt(state, r, c);
  return m && isVisible(state, r, c) ? m : null;
}

export const inside = (s, r, c) => r >= 0 && c >= 0 && r < s.size && c < s.size;

export function monsterAt(state, r, c) {
  return state.monsters.find((m) => m.alive && m.r === r && m.c === c) ?? null;
}

/** 怪物不会踏上障碍、门、出口、道具或其他怪物所在格。 */
export function monsterCanStand(state, r, c) {
  if (!inside(state, r, c)) return false;
  if (state.tiles[r][c].prop) return false;
  const k = key(r, c);
  if (state.doors.has(k) || state.items.has(k)) return false;
  if (state.exit.r === r && state.exit.c === c) return false;
  return !monsterAt(state, r, c);
}

/** 主角能否踏上某格：障碍永远不行；锁门需要钥匙；未开启的出口不可进入。 */
export function heroCanEnter(state, r, c) {
  if (!inside(state, r, c)) return { ok: false, reason: "无法到达" };
  if (state.tiles[r][c].prop) return { ok: false, reason: "无法到达" };
  const item = state.items.get(key(r, c));
  if (item && NEARBY_PICKUP.has(item.type)) return { ok: false, reason: "无法到达" };
  if (state.doors.has(key(r, c)) && state.hero.keys <= 0)
    return { ok: false, reason: "需要钥匙才能打开" };
  if (state.exit.r === r && state.exit.c === c && !state.exitOpen)
    return { ok: false, reason: "出口已被封印" };
  return { ok: true };
}

export function isAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/**
 * 主角尝试走到相邻格。返回：
 *  - blocked：无法前进
 *  - battle：目标格有怪物，主角先手开战（主角暂不移动）
 *  - moved：已移动，events 中是拾取/开门/抵达出口
 */
export function heroMove(state, r, c) {
  if (state.over) return { kind: "blocked", reason: "关卡已结束" };
  if (!isAdjacent(state.hero, { r, c }))
    return { kind: "blocked", reason: "无法到达" };
  const monster = monsterAt(state, r, c);
  if (monster) return { kind: "battle", monster, heroFirst: true };
  const check = heroCanEnter(state, r, c);
  if (!check.ok) return { kind: "blocked", reason: check.reason };

  const from = { r: state.hero.r, c: state.hero.c };
  state.hero.r = r;
  state.hero.c = c;
  state.turn += 1;
  const events = [{ type: "move", from, to: { r, c } }];
  events.push(...collectAt(state, r, c));
  updateVisibility(state);
  if (state.exit.r === r && state.exit.c === c && state.exitOpen) {
    state.over = "won";
    events.push({ type: "exit" });
  }
  return { kind: "moved", events };
}

/**
 * 宝箱和药水不能踩上去，也不会路过自动拾取：玩家站在它上下左右相邻的格子时，主动点击才会拾取。
 * 打开过的宝箱留在原地，仍然挡路。
 */
export const NEARBY_PICKUP = new Set(["chest", "potion", "forge"]);

export function pickableAt(state, r, c) {
  const item = state.items.get(key(r, c));
  return item && NEARBY_PICKUP.has(item.type) && !item.opened ? item : null;
}

export function pickupAt(state, r, c) {
  const item = pickableAt(state, r, c);
  if (!item) return { ok: false, reason: "这里没有可以拾取的东西" };
  if (!isAdjacent(state.hero, { r, c })) return { ok: false, reason: "需要先走到旁边" };
  // 武器强化格：先让玩家从三项强化里选，选定后才算用掉（见 useForge）。
  if (item.type === "forge") return { ok: true, events: [{ type: "forge", item }] };
  if (item.type === "potion") {
    state.items.delete(key(r, c));
    state.hero.potions += 1;
  } else {
    item.opened = true;
    if (item.weapon && !state.hero.weapons.includes(item.weapon)) {
      state.hero.weapons.push(item.weapon);
      // 有空的武器槽就直接装上，否则先放进背包。
      if (state.hero.equipped.length < state.hero.slots) state.hero.equipped.push(item.weapon);
    }
  }
  return { ok: true, events: [{ type: "pickup", item, equipped: state.hero.equipped.includes(item.weapon) }] };
}

/** 强化格只能用一次：玩家选定强化后标记为已使用，模型留在原地挡路。 */
export function useForge(state, r, c) {
  const item = state.items.get(key(r, c));
  if (item?.type === "forge") item.opened = true;
}

function collectAt(state, r, c) {
  const events = [];
  const k = key(r, c);
  if (state.doors.has(k)) {
    state.doors.delete(k);
    state.hero.keys -= 1;
    events.push({ type: "door", r, c });
  }
  const item = state.items.get(k);
  if (!item) return events;
  state.items.delete(k);
  if (item.type === "potion") state.hero.potions += 1;
  if (item.type === "key") state.hero.keys += 1;
  if (item.type === "chest" && item.weapon && !state.hero.weapons.includes(item.weapon))
    state.hero.weapons.push(item.weapon);
  events.push({ type: "pickup", item });
  return events;
}

/** 在怪物自身的移动规则下做广度优先搜索，返回走向主角的第一步。 */
export function chaseStep(state, monster) {
  const moves = MOVE_SETS[monster.def.moves];
  const target = key(state.hero.r, state.hero.c);
  const startKey = key(monster.r, monster.c);
  const prev = new Map([[startKey, null]]);
  const queue = [[monster.r, monster.c]];
  while (queue.length) {
    const [r, c] = queue.shift();
    const k = key(r, c);
    if (k === target) {
      let step = k;
      while (prev.get(step) !== startKey) step = prev.get(step);
      const [sr, sc] = step.split(",").map(Number);
      return { r: sr, c: sc };
    }
    for (const [dr, dc] of moves) {
      const nr = r + dr;
      const nc = c + dc;
      const nk = key(nr, nc);
      if (prev.has(nk)) continue;
      if (nk !== target && !monsterCanStand(state, nr, nc)) continue;
      prev.set(nk, k);
      queue.push([nr, nc]);
    }
  }
  return null;
}

const manhattan = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);

/**
 * 主角行动后怪物依次行动。一旦有怪物扑向主角所在格，
 * 立即返回 ambush，剩余怪物本回合不再行动。
 */
export function advanceMonsters(state) {
  const moves = [];
  const alerts = [];
  for (const m of state.monsters) {
    if (!m.alive) continue;
    if (m.stun > 0) {
      m.stun -= 1;
      continue;
    }
    if (m.ai === "static") continue;
    if (!m.aggro && m.sight > 0 && manhattan(m, state.hero) <= m.sight) {
      m.aggro = true;
      alerts.push(m);
    }
    if (state.turn % m.every !== 0) continue;

    let next = null;
    if (m.aggro) next = chaseStep(state, m);
    else if (m.ai === "patrol" && m.path) next = patrolStep(m);
    if (!next) continue;
    if (next.r === state.hero.r && next.c === state.hero.c) {
      updateVisibility(state);
      return { moves, alerts, ambush: m };
    }
    if (!monsterCanStand(state, next.r, next.c)) continue;
    const from = { r: m.r, c: m.c };
    m.r = next.r;
    m.c = next.c;
    if (m.ai === "patrol" && !m.aggro) advancePatrol(m);
    moves.push({ monster: m, from, to: { r: m.r, c: m.c } });
  }
  updateVisibility(state);
  return { moves, alerts, ambush: null };
}

function patrolStep(m) {
  const { path } = m;
  if (path.length < 2) return null;
  let index = m.pathIndex + m.pathDir;
  if (index < 0 || index >= path.length) index = m.pathIndex - m.pathDir;
  const [r, c] = path[index];
  return { r, c };
}

function advancePatrol(m) {
  let index = m.pathIndex + m.pathDir;
  if (index < 0 || index >= m.path.length) {
    m.pathDir *= -1;
    index = m.pathIndex + m.pathDir;
  }
  m.pathIndex = index;
}

/** 怪物下一回合可能落脚的格子，用于在棋盘上提示威胁范围。 */
export function threatTiles(state, monster) {
  if (monster.ai === "static") return [];
  return MOVE_SETS[monster.def.moves]
    .map(([dr, dc]) => ({ r: monster.r + dr, c: monster.c + dc }))
    .filter(
      ({ r, c }) =>
        (r === state.hero.r && c === state.hero.c) || monsterCanStand(state, r, c),
    );
}

/** 战斗结束后把结果写回棋盘。 */
export function resolveBattle(state, monster, combat, heroFirst) {
  state.hero.matrix = cloneMatrix(combat.heroMatrix);
  state.hero.potions = combat.potions;
  state.hero.skills = { ...state.hero.skills, ...skillCharges(combat) };
  state.stats.battles += 1;
  state.stats.damage += combat.stats.taken;
  monster.matrix = cloneMatrix(combat.monsterMatrix);
  monster.step = combat.step;
  const events = [];
  if (combat.phase === "won") {
    monster.alive = false;
    events.push({ type: "defeat", monster });
    if (monster.drop === "potion") {
      state.hero.potions += 1;
      events.push({ type: "drop", item: "potion", monster });
    }
    if (monster.def.boss) {
      state.exitOpen = true;
      events.push({ type: "exit-open" });
    }
    if (heroFirst) {
      const from = { r: state.hero.r, c: state.hero.c };
      state.hero.r = monster.r;
      state.hero.c = monster.c;
      state.turn += 1;
      events.push({ type: "move", from, to: { r: monster.r, c: monster.c } });
    }
    updateVisibility(state);
  } else if (combat.phase === "fled") {
    state.stats.retreats += 1;
    monster.stun = 2;
    monster.aggro = monster.ai !== "static" && monster.aggro;
  } else if (combat.phase === "lost") {
    state.over = "lost";
  }
  return events;
}

export function heroHearts(state) {
  return countHearts(state.hero.matrix);
}
