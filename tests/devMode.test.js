import test from "node:test";
import assert from "node:assert/strict";
import { DEV_NAME, isDevMode, devLoadout } from "../src/battle/logic/devMode.js";
import { setHeroName } from "../src/battle/data/heroName.js";
import { WEAPONS } from "../src/battle/data/weapons.js";
import { SKILLS } from "../src/battle/data/skills.js";
import { MAX_WEAPON_SLOTS, SKILL_SLOTS, sanitizeUpgrades, isAdvanced } from "../src/battle/logic/arsenal.js";
import { createBoard } from "../src/battle/logic/board.js";
import { LEVELS } from "../src/battle/data/levels.js";

test("开发者模式：只有管理员名字能开启，大小写不同或多一个字都不行", () => {
  try {
    assert.equal(setHeroName(DEV_NAME), DEV_NAME, "管理员名字是合法的名字");
    assert.equal(isDevMode(), true);
    for (const other of ["Xrephmos_admin", "xrephmos_admin2", "xrephmos", "阿福"]) {
      setHeroName(other);
      assert.equal(isDevMode(), false, other);
    }
  } finally {
    setHeroName("");
  }
});

test("开发者模式的满配构筑：全部武器与技能、武器槽开满、强化拿满且都合法", () => {
  const dev = devLoadout();
  assert.deepEqual(dev.weapons.sort(), Object.keys(WEAPONS).sort());
  assert.deepEqual([...dev.skills].sort(), Object.keys(SKILLS).sort());
  assert.equal(dev.slots, MAX_WEAPON_SLOTS);
  assert.equal(dev.equipped.length, MAX_WEAPON_SLOTS);
  assert.equal(dev.equippedSkills.length, SKILL_SLOTS);
  assert.deepEqual(sanitizeUpgrades(dev.upgrades), dev.upgrades, "没有不合规则的强化");
  assert.ok(dev.upgrades.hammer.extend && dev.upgrades.hammer.giant, "巨化的前置（延长）也拿到了");
  assert.ok(Object.values(dev.upgrades).some((up) => Object.keys(up).some(isAdvanced)), "进阶强化也开放");
  // 任何章节都能直接用这套构筑开局。
  for (const level of LEVELS) {
    const skills = Object.fromEntries(dev.skills.map((id) => [id, SKILLS[id].charges]));
    const board = createBoard(level, { ...dev, skills, knownSkills: dev.skills, minSlots: dev.slots });
    assert.equal(board.hero.weapons.length, Object.keys(WEAPONS).length, level.name);
  }
});
