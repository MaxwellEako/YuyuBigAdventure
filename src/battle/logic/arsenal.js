import { WEAPONS } from "../data/weapons.js";
import { SKILLS } from "../data/skills.js";
import { transformShape, shapeKey } from "./shapes.js";

/** 强化种类的文字说明（界面与测试共用）。 */
export const UPGRADE_TEXT = {
  rotate: { name: "旋转", icon: "rotate", desc: "战斗中按 R，形状转过 90°。" },
  mirror: { name: "镜像", icon: "mirror", desc: "战斗中按 F，形状左右翻转。" },
  extend: { name: "延长", icon: "extend", desc: "形状多出一格。" },
  precise: { name: "精准", icon: "perfect", desc: "完美命中时连击多记一次，并恢复 1 颗红心。" },
};

/** 武器槽与技能槽。技能不占武器槽，但最多只能携带 SKILL_SLOTS 个。 */
export const MAX_WEAPON_SLOTS = 5;
export const SKILL_SLOTS = 2;

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

/** 武器强化格随机给出的候选项：变形（按武器而定）或延长一格，已拥有的不再出现。 */
export function upgradeOptions(hero, rng = Math.random, count = 3) {
  const pool = [];
  for (const id of hero.weapons) {
    const up = hero.upgrades?.[id] ?? {};
    for (const kind of WEAPONS[id].transforms) if (!up[kind]) pool.push({ weapon: id, kind });
    if (!up.extend) pool.push({ weapon: id, kind: "extend" });
    if (!up.precise) pool.push({ weapon: id, kind: "precise" });
  }
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
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
export function createForgeOptions(hero, rng = Math.random) {
  return upgradeOptions(hero, rng, 3).map((option) => ({ ...option, rerolled: false }));
}

export function rerollForgeOption(hero, options, index, rng = Math.random) {
  const current = options[index];
  if (!current || current.rerolled) return { ok: false, reason: "每项强化只能刷新一次" };
  const pool = upgradeOptions(hero, rng, 99).filter((o) => !options.some((x) => sameOption(x, o)));
  if (!pool.length) return { ok: false, reason: "没有其他可选的强化了" };
  options[index] = { ...pool[0], rerolled: true };
  return { ok: true };
}

/**
 * 进入章节时的武器配置：优先沿用上次的配置，空位按获得顺序补齐，超出槽位的放进背包。
 */
export function defaultEquip(owned, saved = [], slots = 2) {
  const equipped = saved.filter((id) => owned.includes(id));
  for (const id of owned) if (equipped.length < slots && !equipped.includes(id)) equipped.push(id);
  return equipped.slice(0, slots);
}

export function toggleEquip(hero, id) {
  if (!hero.weapons.includes(id)) return { ok: false, reason: "还没有这件武器" };
  if (hero.equipped.includes(id)) {
    if (hero.equipped.length <= 1) return { ok: false, reason: "至少带一件武器" };
    hero.equipped = hero.equipped.filter((w) => w !== id);
    return { ok: true };
  }
  if (hero.equipped.length >= hero.slots) return { ok: false, reason: "武器槽已满" };
  hero.equipped = [...hero.equipped, id];
  return { ok: true };
}

export function toggleSkill(hero, id) {
  if (!(id in hero.skills)) return { ok: false, reason: "还没有学会这个技能" };
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
