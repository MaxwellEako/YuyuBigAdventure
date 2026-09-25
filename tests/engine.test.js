import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, DIRECTIONS } from "../src/game/levels.js";
import { PuzzleEngine } from "../src/game/engine.js";
import { solveLevel } from "./solver.js";

/** 地图数据的约束先校验，避免“模型看起来有路，逻辑却没有格子”。 */
test("五座岛使用不同机制，初始坐标和碎片都在有效地块上", () => {
  assert.equal(new Set(LEVELS.map((level) => level.type)).size, 5);
  for (const level of LEVELS) {
    assert.equal(
      new Set(level.map.map((row) => row.length)).size,
      1,
      `${level.name} 地图宽度一致`,
    );
    const engine = new PuzzleEngine(level);
    assert.equal(engine.walkable(level.start), true);
    assert.equal(engine.walkable(level.exit), true);
    assert.equal(level.crystals.length, 3);
    for (const crystal of level.crystals)
      assert.ok(![" ", "~", "#"].includes(engine.tile(crystal)));
    assert.equal(engine.state.won, false);
  }
});

for (const level of LEVELS) {
  test(`${level.name}：搜索真实规则得到通关路线，逐步回放全部有效`, () => {
    const solution = solveLevel(level);
    const engine = new PuzzleEngine(level);
    for (const action of solution.actions) {
      const result =
        action === "interact" ? engine.interact() : engine.move(action);
      assert.equal(result.changed, true);
    }
    assert.equal(engine.state.won, true);
    assert.equal(engine.solved, true);
    assert.equal(engine.state.collected.length, 3);
    assert.deepEqual(engine.state.player, level.exit);
    assert.equal(engine.state.steps, solution.actions.length);
    assert.equal(engine.move("left").changed, false, "通关后不再移动");
    engine.undo();
    assert.equal(engine.state.won, false, "撤销恢复通关前状态");
    console.log(
      `${level.name}：${solution.actions.length} 步，搜索 ${solution.visited} 个状态`,
    );
  });
}

test("推箱：压板开启桥，撤销同时还原箱子、人物和步数", () => {
  const engine = new PuzzleEngine(LEVELS[0]);
  assert.equal(engine.walkable([6, 4]), false);
  engine.move("down");
  engine.move("right");
  const previous = structuredClone(engine.state);
  assert.equal(engine.move("right").pushed, true);
  assert.equal(engine.pressed, true);
  assert.equal(engine.walkable([6, 4]), true);
  engine.undo();
  assert.deepEqual(engine.state, previous);
  assert.equal(engine.pressed, false);
});

test("边界、树木与不可推动的木箱不会增加步数或产生快照", () => {
  const engine = new PuzzleEngine(LEVELS[0]);
  engine.state.player = [0, 4];
  assert.equal(engine.move("left").changed, false);
  assert.equal(engine.state.steps, 0);
  assert.equal(engine.history.length, 0);
  engine.state.player = [2, 1];
  assert.equal(engine.move("up").changed, false);
  engine.state.player = [3, 5];
  engine.state.crates = [
    [4, 5],
    [5, 5],
  ];
  assert.equal(engine.move("right").changed, false, "不能把箱子推入另一只箱子");
});

test("镜面：两次正确反射才能击中接收器，远处交互无效", () => {
  const engine = new PuzzleEngine(LEVELS[1]);
  assert.equal(engine.solved, false);
  assert.equal(engine.interact().changed, false);
  engine.state.player = [3, 5];
  engine.interact();
  assert.equal(engine.solved, false);
  engine.state.player = [3, 2];
  engine.interact();
  assert.equal(engine.solved, true);
  assert.deepEqual(engine.beam.points.at(-1), LEVELS[1].receiver);
});

test("旋律：错误顺序归零，撤销恢复原旋律", () => {
  const engine = new PuzzleEngine(LEVELS[2]);
  engine.state.player = [2, 3];
  engine.interact();
  assert.deepEqual(engine.state.sequence, [0]);
  engine.state.player = [6, 3];
  const previous = structuredClone(engine.state);
  const result = engine.interact();
  assert.equal(result.wrong, true);
  assert.deepEqual(engine.state.sequence, []);
  engine.undo();
  assert.deepEqual(engine.state, previous);
});

test("冰面：逐格滑行，不会穿墙；沿途经过的碎片也会被收集", () => {
  const engine = new PuzzleEngine(LEVELS[3]);
  const result = engine.move("right");
  assert.equal(result.path.length, 2);
  assert.deepEqual(engine.state.player, [3, 7]);
  assert.equal(engine.move("down").changed, false, "冰面遇到岛边就停止");
  const custom = structuredClone(LEVELS[3]);
  custom.crystals = [[2, 7]];
  const through = new PuzzleEngine(custom);
  through.move("right");
  assert.deepEqual(through.state.collected, [0]);
});

test("昼夜：桥上不允许消失脚下的路，碎片仅在对应时相可收集", () => {
  const engine = new PuzzleEngine(LEVELS[4]);
  engine.state.player = [3, 4];
  assert.equal(engine.interact().changed, false);
  assert.equal(engine.state.phase, 0);
  engine.state.player = [9, 5];
  assert.deepEqual(engine.collect(), []);
  engine.interact();
  assert.deepEqual(engine.state.collected, [2]);
  assert.equal(engine.walkable([7, 4]), true);
  assert.equal(engine.walkable([3, 4]), false);
});

test("不满足机关和碎片条件时，不能直接进入出口通关", () => {
  for (const level of LEVELS) {
    const engine = new PuzzleEngine(level);
    engine.state.player = [...level.exit];
    assert.equal(engine.checkWin(), false);
  }
});

test("关卡数据不可被游玩修改；完整撤销回到初始快照", () => {
  const before = JSON.stringify(LEVELS);
  for (const level of LEVELS) {
    const engine = new PuzzleEngine(level);
    const initial = structuredClone(engine.state);
    for (let turn = 0; turn < 20; turn++)
      for (const direction of Object.keys(DIRECTIONS)) engine.move(direction);
    while (engine.history.length) engine.undo();
    assert.deepEqual(engine.state, initial);
  }
  assert.equal(JSON.stringify(LEVELS), before);
});
