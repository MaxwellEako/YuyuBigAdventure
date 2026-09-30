import { WEAPONS } from "../data/weapons.js";
import { SKILLS } from "../data/skills.js";
import { transformShape, shapeKey } from "./shapes.js";

/** 强化种类的文字说明（界面与测试共用）。 */
export const UPGRADE_TEXT = {
  rotate: { name: "旋转", icon: "rotate", desc: "战斗中可将攻击形状旋转 90°。" },
  mirror: { name: "镜像", icon: "mirror", desc: "战斗中可将攻击形状左右翻转。" },
  extend: { name: "延长", icon: "extend", desc: "攻击范围扩大。" },
  precise: { name: "精准", icon: "energy", desc: "该武器构成连击时，额外获得 1 点充能。" },
  chain: { name: "连锁", icon: "combo", desc: "该武器构成连击时，连击数额外 +1。" },
  nimble: { name: "灵巧", icon: "run", desc: "该武器无须紧邻上一击：攻击未落空且更换了武器，即构成连击。" },
  pierce: { name: "破甲", icon: "pierce", desc: "一击消除护甲心。" },
  stagger: { name: "震慑", icon: "stagger", desc: "单次消除不少于 2 颗红心即可打断重击。" },
};

/** 武器槽与技能槽。技能不占武器槽，但最多只能携带 SKILL_SLOTS 个。 */
export const MAX_WEAPON_SLOTS = 5;
export const SKILL_SLOTS = 3;

/** 武器当前的攻击形状：先看是否延长，再按战斗中的朝向变形。 */
export function weaponShape(id, upgrades = {}, orient = {}) {
  const weapon = WEAPONS[id];
  const up = upgrades[id] ?? {};
  const base = up.extend ? weapon.plusShape : weapon.shape;
  return transformShape(base, {
    rot: up.rotate ? orient.rot ?? 0 : 0,
    flip: up.mirror ? Boolean(orient.flip) : false,
  });
}

export function skillShape(id) {
  return SKILLS[id].shape;
}

/** 该武器所有“看起来不同”的旋转角度（与平移无关），例如短剑只有横、竖两种。 */
export function distinctRotations(id, upgrades = {}, orient = {}) {
  const rots = [];
  const keys = new Set();
  for (let rot = 0; rot < 4; rot += 1) {
    const key = shapeKey(weaponShape(id, upgrades, { ...orient, rot }));
    if (keys.has(key)) continue;
    keys.add(key);
    rots.push(rot);
  }
  return rots;
}

/** 旋转到下一个不同的朝向，循环往复。 */
export function nextRotation(id, upgrades = {}, orient = {}) {
  const rots = distinctRotations(id, upgrades, orient);
  const index = rots.indexOf(orient.rot ?? 0);
  return rots[(index + 1) % rots.length];
}

/**
 * 每种定位能拿到的强化（旋转、镜像另看武器自己的 transforms）：
 *  - 轻武器“灵活”：连锁（连击涨得更快）、灵巧（不必紧挨上一击）。不延长、不破甲，保持两格的小巧。
 *  - 中型“接招”：延长、精准（连上时多得充能）、破甲。
 *  - 重武器“范围大”：延长、破甲、震慑（降低打断重击的门槛）。不给精准：它是花充能的终结技，不是攒充能的。
 */
const ROLE_UPGRADES = {
  light: ["chain", "nimble"],
  medium: ["extend", "precise", "pierce"],
  heavy: ["extend", "pierce", "stagger"],
};

/**
 * 某件武器能不能拿到某项强化。
 * 破甲要等护甲怪出现以后才会在铁砧上刷出来（opts.pierce 为 false 时不出）；天生破甲的破甲锥不再出破甲。
 */
export function upgradeAllowed(id, kind, opts = {}) {
  const w = WEAPONS[id];
  if (!w) return false;
  if (kind === "rotate" || kind === "mirror") return w.transforms.includes(kind);
  if (!ROLE_UPGRADES[w.weight]?.includes(kind)) return false;
  if (kind === "pierce") return !w.pierce && opts.pierce !== false;
  return true;
}

/** 去掉规则调整后不再允许的强化（旧存档里可能有）。 */
export function sanitizeUpgrades(upgrades = {}) {
  const clean = {};
  for (const [id, up] of Object.entries(upgrades)) {
    const kept = Object.fromEntries(Object.entries(up).filter(([kind, on]) => on && upgradeAllowed(id, kind)));
    if (Object.keys(kept).length) clean[id] = kept;
  }
  return clean;
}

/** 各类强化出现的相对概率。精准、连锁对连击的收益大，出得少一些；延长直接加伤害，也压低一些。 */
const UPGRADE_WEIGHT = { rotate: 1, mirror: 1, extend: 0.6, precise: 0.5, chain: 0.5, nimble: 1, pierce: 1, stagger: 1 };

/**
 * 武器强化格随机给出的候选项：只从已经拿到的武器里出，已拥有的强化不再出现。
 * 按权重不放回地抽取。opts.pierce 为 false 时不出破甲。
 */
export function upgradeOptions(hero, rng = Math.random, count = 3, opts = {}) {
  const pool = [];
  for (const id of hero.weapons) {
    const up = hero.upgrades?.[id] ?? {};
    for (const kind of Object.keys(UPGRADE_TEXT))
      if (!up[kind] && upgradeAllowed(id, kind, opts)) pool.push({ weapon: id, kind, w: UPGRADE_WEIGHT[kind] ?? 1 });
  }
  const picked = [];
  while (picked.length < count && pool.length) {
    let roll = rng() * pool.reduce((sum, o) => sum + o.w, 0);
    let i = 0;
    while (i < pool.length - 1 && roll >= pool[i].w) roll -= pool[i++].w;
    const [{ weapon, kind }] = pool.splice(i, 1);
    picked.push({ weapon, kind });
  }
  return picked;
}

export function applyUpgrade(hero, option) {
  hero.upgrades ??= {};
  hero.upgrades[option.weapon] = { ...(hero.upgrades[option.weapon] ?? {}), [option.kind]: true };
}

/** 强化前后的形状，用于强化选择界面的对比图。 */
export function upgradePreview(option, upgrades = {}) {
  const before = weaponShape(option.weapon, upgrades);
  const next = { ...upgrades, [option.weapon]: { ...(upgrades[option.weapon] ?? {}), [option.kind]: true } };
  const orient = option.kind === "rotate" ? { rot: 1 } : option.kind === "mirror" ? { flip: true } : {};
  return { before, after: weaponShape(option.weapon, next, orient) };
}

const sameOption = (a, b) => a.weapon === b.weapon && a.kind === b.kind;

/**
 * 铁砧的三项强化在第一次打开时生成并保存，之后反复打开看到的都是同一组；
 * 每一项可以单独刷新一次，所以一座铁砧最多只会出现 6 个不同的选项。
 */
export function createForgeOptions(hero, rng = Math.random, opts = {}) {
  return upgradeOptions(hero, rng, 3, opts).map((option) => ({ ...option, rerolled: false }));
}

export function rerollForgeOption(hero, options, index, rng = Math.random, opts = {}) {
  const current = options[index];
  if (!current || current.rerolled) return { ok: false, reason: "每项强化仅可重抽一次" };
  const pool = upgradeOptions(hero, rng, 99, opts).filter((o) => !options.some((x) => sameOption(x, o)));
  if (!pool.length) return { ok: false, reason: "没有其他可选的强化" };
  options[index] = { ...pool[0], rerolled: true };
  return { ok: true };
}

/**
 * 进入章节时的武器配置：优先沿用上次的配置，空位按获得顺序补齐，超出槽位的放进背包。
 */
export function defaultEquip(owned, saved = null, slots = 2) {
  const kept = (saved ?? []).filter((id) => owned.includes(id)).slice(0, slots);
  // 有存档就原样沿用；空出来的槽位留给玩家自己决定装什么。
  if (saved && kept.length) return kept;
  return owned.slice(0, slots);
}

export function toggleEquip(hero, id) {
  if (!hero.weapons.includes(id)) return { ok: false, reason: "尚未获得该武器" };
  if (hero.equipped.includes(id)) {
    if (hero.equipped.length <= 1) return { ok: false, reason: "至少需要装备一件武器" };
    hero.equipped = hero.equipped.filter((w) => w !== id);
    return { ok: true };
  }
  if (hero.equipped.length >= hero.slots) return { ok: false, reason: "武器槽已满" };
  hero.equipped = [...hero.equipped, id];
  return { ok: true };
}

export function toggleSkill(hero, id) {
  if (!(id in hero.skills)) return { ok: false, reason: "尚未习得该技能" };
  if (hero.equippedSkills.includes(id)) {
    hero.equippedSkills = hero.equippedSkills.filter((s) => s !== id);
    return { ok: true };
  }
  if (hero.equippedSkills.length >= SKILL_SLOTS) return { ok: false, reason: "技能槽已满" };
  hero.equippedSkills = [...hero.equippedSkills, id];
  return { ok: true };
}

/** 背包里的武器换下出战中的一件，保持槽位顺序。 */
export function swapEquip(hero, outId, inId) {
  const i = hero.equipped.indexOf(outId);
  if (i < 0 || !hero.weapons.includes(inId) || hero.equipped.includes(inId)) return { ok: false, reason: "无法替换" };
  hero.equipped = hero.equipped.map((id, k) => (k === i ? inId : id));
  return { ok: true };
}

export function swapSkill(hero, outId, inId) {
  const i = hero.equippedSkills.indexOf(outId);
  if (i < 0 || !(inId in hero.skills) || hero.equippedSkills.includes(inId)) return { ok: false, reason: "无法替换" };
  hero.equippedSkills = hero.equippedSkills.map((id, k) => (k === i ? inId : id));
  return { ok: true };
}

/** 武器实际的冷却。 */
export function weaponCooldown(id) {
  return WEAPONS[id].cooldown;
}
