import { PuzzleEngine } from "../src/game/engine.js";
import { DIRECTIONS } from "../src/game/levels.js";

/**
 * 广度优先搜索真实状态空间，不预写通关答案。
 * visited 键故意忽略步数，防止人物原地绕圈生成无限状态；保留所有影响机关的字段。
 */
export function solveLevel(level, limit = 150000) {
  const initial = new PuzzleEngine(level);
  const stateKey = (state) =>
    JSON.stringify([
      state.player,
      state.crates,
      state.mirrors,
      [...state.collected].sort(),
      state.sequence,
      state.phase,
      [...state.phasesVisited].sort(),
    ]);
  const queue = [{ state: initial.state, parent: -1, action: null }];
  const seen = new Set([stateKey(initial.state)]);
  const actions = [...Object.keys(DIRECTIONS), "interact"];
  for (let cursor = 0; cursor < queue.length && cursor < limit; cursor++) {
    const node = queue[cursor];
    for (const action of actions) {
      const engine = new PuzzleEngine(level);
      engine.state = structuredClone(node.state);
      const result =
        action === "interact" ? engine.interact() : engine.move(action);
      if (!result.changed) continue;
      const key = stateKey(engine.state);
      if (seen.has(key)) continue;
      const child = { state: engine.state, parent: cursor, action };
      if (engine.state.won) {
        const solution = [action];
        let ancestor = node;
        while (ancestor.parent >= 0) {
          solution.push(ancestor.action);
          ancestor = queue[ancestor.parent];
        }
        return { actions: solution.reverse(), visited: seen.size };
      }
      seen.add(key);
      queue.push(child);
    }
  }
  throw new Error(
    `${level.name} 无法在 ${limit} 个搜索节点内求解，实际探索 ${seen.size} 个状态`,
  );
}
