import { heartSvg } from "./icons.js";
import { VOID, EMPTY, ARMOR, footprint } from "../logic/shapes.js";

/**
 * 可交互的红心矩阵。四周有一圈看不见的“界外格”，
 * 让形状的锚点也能放到矩阵外面——形状只需覆盖到对应区域即可，不设边界。
 */
export class MatrixView {
  constructor(el, { margin = 2, maxSize = 360, side = "enemy", box = null } = {}) {
    this.el = el;
    // box：给定外框时进入“铺满”模式，矩阵在框内居中，四周的界外格一直铺到填满外框。
    this.box = box;
    // margin 可以是一个数，也可以分别指定四边：{ top, bottom, left, right }。
    this.margin =
      typeof margin === "number" ? { top: margin, bottom: margin, left: margin, right: margin } : margin;
    this.maxSize = maxSize;
    this.side = side;
    this.matrix = null;
    this.cells = new Map();
    this.el.classList.add("matrix", `matrix-${side}`);
    this.onHover = null;
    this.onPick = null;
    this.onLeave = null;
    this.lastTouchKey = null;

    this.el.addEventListener("pointermove", (e) => {
      const cell = e.target.closest?.(".cell");
      if (!cell || !this.onHover) return;
      this.onHover(Number(cell.dataset.r), Number(cell.dataset.c));
    });
    this.el.addEventListener("pointerleave", () => this.onLeave?.());
    this.el.addEventListener("pointerup", (e) => {
      const cell = e.target.closest?.(".cell");
      if (!cell || !this.onPick) return;
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      // 触屏没有悬停：第一次点击只预览，再点同一格才确认。
      if (e.pointerType === "touch") {
        const k = `${r},${c}`;
        if (this.lastTouchKey !== k) {
          this.lastTouchKey = k;
          this.onHover?.(r, c);
          return;
        }
        this.lastTouchKey = null;
      }
      this.onPick(r, c);
    });
  }

  /** 外框尺寸变了之后按新尺寸重建网格。 */
  relayout() {
    const matrix = this.matrix;
    this.matrix = null;
    this.set(matrix);
  }

  set(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const sameShape = this.matrix && this.matrix.length === rows && this.matrix[0].length === cols;
    this.matrix = matrix;
    if (!sameShape) this.build(rows, cols);
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) this.paint(r, c, matrix[r][c]);
  }

  /** 铺满模式下，红心加上武器够得到的圈数能完整放下时的最大格子边长。 */
  fitSize(rows, cols) {
    const GAP = 3;
    const { top, bottom, left, right } = this.margin;
    const needV = Math.max(top, bottom);
    const needH = Math.max(left, right);
    const fit = (avail, n) => Math.floor((avail + GAP) / n - GAP);
    return Math.max(22, Math.min(92, fit(this.box.clientHeight, rows + needV * 2), fit(this.box.clientWidth, cols + needH * 2)));
  }

  build(rows, cols) {
    const GAP = 3;
    let { top, bottom, left, right } = this.margin;
    let size;
    if (this.box) {
      // 先保证红心加上武器够得到的圈数能完整放下（上下、左右按较大的一侧对称留），再用界外格铺满外框。
      // fixedSize：战斗窗口让两块心阵共用同一个格子边长，左右看起来对齐。
      const w = this.box.clientWidth;
      const h = this.box.clientHeight;
      const needV = Math.max(top, bottom);
      const needH = Math.max(left, right);
      size = Math.min(this.fixedSize ?? Infinity, this.fitSize(rows, cols));
      const ringV = Math.max(needV, Math.ceil((h / (size + GAP) - rows) / 2) + 1);
      const ringH = Math.max(needH, Math.ceil((w / (size + GAP) - cols) / 2) + 1);
      top = bottom = ringV;
      left = right = ringH;
    } else {
      const n = Math.max(rows + top + bottom, cols + left + right, 5);
      size = Math.max(24, Math.min(92, Math.floor((this.maxSize - (n - 1) * 4) / n)));
    }
    const totalR = rows + top + bottom;
    const totalC = cols + left + right;
    this.el.style.setProperty("--cell", `${size}px`);
    this.el.style.gap = `${this.box ? GAP : 4}px`;
    this.el.style.gridTemplateColumns = `repeat(${totalC}, ${size}px)`;
    this.el.style.gridTemplateRows = `repeat(${totalR}, ${size}px)`;
    this.el.innerHTML = "";
    this.cells.clear();
    for (let r = -top; r < rows + bottom; r += 1)
      for (let c = -left; c < cols + right; c += 1) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.r = r;
        cell.dataset.c = c;
        const inside = r >= 0 && c >= 0 && r < rows && c < cols;
        if (!inside) cell.classList.add("outside");
        else cell.style.setProperty("--i", r * cols + c);
        this.el.appendChild(cell);
        this.cells.set(`${r},${c}`, cell);
      }
  }

  paint(r, c, value) {
    const cell = this.cells.get(`${r},${c}`);
    if (!cell) return;
    const state = value === VOID ? "void" : value === EMPTY ? "empty" : value >= ARMOR ? "armor" : "heart";
    if (cell.dataset.state === state) return;
    cell.dataset.state = state;
    cell.classList.remove("void", "empty", "heart", "armor");
    cell.classList.add("slot", state);
    cell.innerHTML =
      state === "void"
        ? ""
        : state === "empty"
          ? heartSvg("heart-empty")
          : state === "armor"
            ? heartSvg("armor")
            : heartSvg("heart");
  }

  clearPreview() {
    for (const cell of this.cells.values())
      cell.classList.remove("pv", "pv-hit", "pv-crack", "pv-heal", "pv-anchor", "pv-miss", "pv-off");
  }

  /** 预览形状：整块足迹 + 会被命中/治疗的格子。 */
  preview(shape, r, c, changes, { tone = "hit", valid = true } = {}) {
    this.clearPreview();
    this.el.classList.toggle("pv-invalid", !valid);
    const changed = new Map(changes.map((h) => [`${h.r},${h.c}`, h]));
    for (const [fr, fc] of footprint(shape, r, c)) {
      const cell = this.cells.get(`${fr},${fc}`);
      if (!cell) continue;
      cell.classList.add("pv");
      if (cell.classList.contains("outside")) cell.classList.add("pv-off");
      const change = changed.get(`${fr},${fc}`);
      if (!change) {
        if (!cell.classList.contains("outside")) cell.classList.add("pv-miss");
        continue;
      }
      if (tone === "heal") cell.classList.add("pv-heal");
      else cell.classList.add(change.after > 0 ? "pv-crack" : "pv-hit");
    }
    this.cells.get(`${r},${c}`)?.classList.add("pv-anchor");
  }

  /** 怪物瞄准区域（持续显示在主角矩阵上）。 */
  /** 标出上一击覆盖的格子，提示下一击要挨着它打。 */
  markLast(cells) {
    for (const cell of this.el.querySelectorAll(".cell.last-hit")) cell.classList.remove("last-hit");
    for (const [r, c] of cells ?? []) this.cells.get(`${r},${c}`)?.classList.add("last-hit");
  }

  markAim(shape, aim) {
    for (const cell of this.cells.values()) cell.classList.remove("aim", "aim-off");
    if (!shape || !aim) return;
    for (const [r, c] of footprint(shape, aim.r, aim.c)) {
      const cell = this.cells.get(`${r},${c}`);
      if (!cell) continue;
      cell.classList.add(cell.classList.contains("outside") ? "aim-off" : "aim");
    }
  }

  /** 播放格子变化动画，然后写入新矩阵。 */
  async animate(changes, kind, nextMatrix) {
    const cls = { hit: "breaking", crack: "cracking", heal: "healing", armor: "armoring" };
    for (const [i, ch] of changes.entries()) {
      const cell = this.cells.get(`${ch.r},${ch.c}`);
      if (!cell) continue;
      const k = kind === "hit" && ch.after > 0 ? "crack" : kind;
      cell.style.setProperty("--d", `${i * 45}ms`);
      cell.classList.add(cls[k]);
      if (kind === "hit") this.spawnShards(cell);
    }
    await new Promise((r) => setTimeout(r, 420 + changes.length * 45));
    for (const ch of changes) {
      const cell = this.cells.get(`${ch.r},${ch.c}`);
      cell?.classList.remove("breaking", "cracking", "healing", "armoring");
      cell?.style.removeProperty("--d");
    }
    this.set(nextMatrix);
  }

  spawnShards(cell) {
    for (let i = 0; i < 5; i += 1) {
      const shard = document.createElement("i");
      shard.className = "shard";
      const a = (Math.PI * 2 * i) / 5 + Math.random();
      shard.style.setProperty("--x", `${Math.cos(a) * (18 + Math.random() * 16)}px`);
      shard.style.setProperty("--y", `${Math.sin(a) * (18 + Math.random() * 16) - 10}px`);
      cell.appendChild(shard);
      setTimeout(() => shard.remove(), 700);
    }
  }

  shake() {
    this.el.classList.remove("shaking");
    void this.el.offsetWidth;
    this.el.classList.add("shaking");
  }
}
