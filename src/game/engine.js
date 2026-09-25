import { DIRECTIONS, samePosition, distance } from "./levels.js";

/**
 * 纯逻辑状态机：只处理坐标和规则，不操作 DOM、音频或 WebGL。
 * 每次有效操作都保存快照，因此推错箱子、奏错音符也可以完整撤销。
 */
export class PuzzleEngine {
  constructor(level) {
    this.level = level;
    this.history = [];
    this.state = {
      player: [...level.start],
      crates: structuredClone(level.crates ?? []),
      mirrors: (level.mirrors ?? []).map((mirror) => mirror.turn),
      collected: [],
      sequence: [],
      phase: 0,
      phasesVisited: [0],
      steps: 0,
      won: false,
    };
  }

  tile(position) {
    return this.level.map[position[1]]?.[position[0]] ?? " ";
  }

  /** 木箱和人物都能压住机关；桥的状态每次从真实坐标计算。 */
  get pressed() {
    return (this.level.plates ?? []).every(
      (plate) =>
        samePosition(this.state.player, plate) ||
        this.state.crates.some((crate) => samePosition(crate, plate)),
    );
  }

  /** 镜子反射的是离散网格方向；记录访问状态，避免闭环光路无限循环。 */
  get beam() {
    if (this.level.type !== "laser") return { points: [], lit: false };
    let position = [...this.level.emitter];
    let direction = [1, 0];
    const points = [[...position]];
    const visited = new Set();
    while (true) {
      const next = [position[0] + direction[0], position[1] + direction[1]];
      const tile = this.tile(next);
      if (tile === " " || tile === "~" || tile === "#") break;
      points.push(next);
      if (samePosition(next, this.level.receiver)) return { points, lit: true };
      const mirrorIndex = this.level.mirrors.findIndex((mirror) =>
        samePosition(mirror.pos, next),
      );
      if (mirrorIndex >= 0) {
        direction =
          this.state.mirrors[mirrorIndex] === 0
            ? [-direction[1], -direction[0]]
            : [direction[1], direction[0]];
      }
      const key = `${next}:${direction}`;
      if (visited.has(key)) break;
      visited.add(key);
      position = next;
    }
    return { points, lit: false };
  }

  get solved() {
    switch (this.level.type) {
      case "pressure":
        return this.pressed;
      case "laser":
        return this.beam.lit;
      case "sequence":
        return this.state.sequence.length === this.level.sequence.length;
      case "ice":
        return this.state.collected.length === this.level.crystals.length;
      case "phase":
        return this.state.phasesVisited.length === 2 && this.state.phase === 0;
      default:
        return false;
    }
  }

  /** 固定机关占据格子，需要站在它旁边交互，不能穿过模型。 */
  walkable(position, { ignoreCrates = false } = {}) {
    const tile = this.tile(position);
    if ([" ", "~", "#"].includes(tile)) return false;
    if (tile === "=" && !this.pressed) return false;
    if (tile === "a" && this.state.phase !== 0) return false;
    if (tile === "b" && this.state.phase !== 1) return false;
    const fixtures = [
      ...(this.level.mirrors ?? []).map((mirror) => mirror.pos),
      ...(this.level.runes ?? []).map((rune) => rune.pos),
      ...[this.level.emitter, this.level.receiver].filter(Boolean),
    ];
    if (fixtures.some((fixture) => samePosition(fixture, position)))
      return false;
    return (
      ignoreCrates ||
      !this.state.crates.some((crate) => samePosition(crate, position))
    );
  }

  save() {
    this.history.push(structuredClone(this.state));
    // 最多保留 300 步，避免长时间游玩积累无界内存。
    if (this.history.length > 300) this.history.shift();
  }

  collect() {
    const found = [];
    this.level.crystals.forEach((crystal, index) => {
      if (
        samePosition(this.state.player, crystal) &&
        !this.state.collected.includes(index) &&
        (crystal[2] === undefined || crystal[2] === this.state.phase)
      ) {
        this.state.collected.push(index);
        found.push(index);
      }
    });
    return found;
  }

  checkWin() {
    this.state.won =
      samePosition(this.state.player, this.level.exit) &&
      this.solved &&
      this.state.collected.length === this.level.crystals.length;
    return this.state.won;
  }

  move(directionName) {
    if (this.state.won || !DIRECTIONS[directionName]) return { changed: false };
    const direction = DIRECTIONS[directionName];
    let next = this.state.player.map(
      (coordinate, index) => coordinate + direction[index],
    );
    if (!this.walkable(next, { ignoreCrates: true }))
      return { changed: false, message: "这边暂时走不通，换条路试试。" };
    const crateIndex = this.state.crates.findIndex((crate) =>
      samePosition(crate, next),
    );
    const crateNext = next.map(
      (coordinate, index) => coordinate + direction[index],
    );
    if (crateIndex >= 0 && !this.walkable(crateNext))
      return { changed: false, message: "木箱后面没有空位了。按 Z 可以撤销。" };
    this.save();
    if (crateIndex >= 0) this.state.crates[crateIndex] = crateNext;
    this.state.steps += 1;
    const path = [];
    const collected = [];
    // 冰面逐格模拟，保证途中经过的碎片也会被拾取，而非仅检查终点。
    while (true) {
      this.state.player = next;
      path.push([...next]);
      collected.push(...this.collect());
      if (this.tile(next) !== "i") break;
      const following = next.map(
        (coordinate, index) => coordinate + direction[index],
      );
      if (!this.walkable(following)) break;
      next = following;
    }
    this.checkWin();
    const message =
      samePosition(this.state.player, this.level.exit) && !this.state.won
        ? "石门还在等待：解开机关，并找齐三枚记忆碎片。"
        : undefined;
    return {
      changed: true,
      path,
      collected,
      pushed: crateIndex >= 0,
      won: this.state.won,
      message,
    };
  }

  /** 可传入点击的机关坐标；键盘操作则自动选最近的相邻机关。 */
  interact(target) {
    if (this.state.won) return { changed: false };
    if (this.level.type === "phase") {
      if (["a", "b"].includes(this.tile(this.state.player))) {
        return {
          changed: false,
          message: "先走到实心小岛上，再切换昼夜，桥上不安全。",
        };
      }
      this.save();
      this.state.phase = 1 - this.state.phase;
      if (!this.state.phasesVisited.includes(this.state.phase))
        this.state.phasesVisited.push(this.state.phase);
      const collected = this.collect();
      this.state.steps += 1;
      this.checkWin();
      return {
        changed: true,
        collected,
        won: this.state.won,
        message: this.state.phase
          ? "月光来了，紫色的桥醒了。"
          : "天亮了，橙色的桥回来了。",
      };
    }
    const fixtures =
      this.level.type === "laser" ? this.level.mirrors : this.level.runes;
    if (!fixtures)
      return {
        changed: false,
        message: "走向木箱即可推动；碎片会在经过时自动收集。",
      };
    const index = fixtures.findIndex(
      (fixture) =>
        distance(fixture.pos, this.state.player) <= 1 &&
        (!target || samePosition(target, fixture.pos)),
    );
    if (index < 0)
      return { changed: false, message: "再靠近一点，站到机关旁边后按 E。" };
    if (this.level.type === "sequence" && this.solved)
      return { changed: false, message: "旋律已经完整，去寻找剩下的碎片吧。" };
    this.save();
    this.state.steps += 1;
    let message;
    let wrong = false;
    if (this.level.type === "laser") {
      this.state.mirrors[index] = 1 - this.state.mirrors[index];
      message = this.beam.lit
        ? "光找到了终点，遗迹苏醒了！"
        : "镜面转动了，看看光去了哪里。";
    } else {
      if (this.level.sequence[this.state.sequence.length] === index)
        this.state.sequence.push(index);
      else {
        this.state.sequence = [];
        wrong = true;
      }
      message = wrong
        ? "音符的顺序不太对，旋律重新开始了。"
        : this.solved
          ? "森林听懂了这首歌。"
          : `「${fixtures[index].label}」的回声，还差 ${this.level.sequence.length - this.state.sequence.length} 个音符。`;
    }
    this.checkWin();
    return { changed: true, note: index, wrong, message, won: this.state.won };
  }

  undo() {
    if (!this.history.length)
      return { changed: false, message: "还没有需要撤销的脚步。" };
    this.state = this.history.pop();
    return { changed: true, undo: true, message: "退一步，也是一种前进。" };
  }
}
