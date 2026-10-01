/**
 * 武器面板里的拖动换装（只管手势与视觉反馈，换装规则见 logic/arsenal.js 的 moveLoadout）。
 *
 * 可拖的行带 data-drag-kind / data-drag-zone / data-drag-id，放置区（列表）带 data-drop-kind / data-drop-zone。
 *  - 鼠标：按下后移动超过几个像素就开始拖。
 *  - 触屏：长按 LONG_PRESS 毫秒拿起，期间手指一动就当作滚动，不打扰翻页；拿起之后阻止页面滚动。
 *  - 不方便拖的时候也可以点选：点一下拿起（高亮），再点目标行或放置区放下，再点一下自己取消。
 *  - 放下之后有一段落位动画：被拖的那一行从松手的位置滑进新位置并闪一下蓝色，其余行平滑让位，
 *    让玩家确认“换上了 / 换下了”。
 * 面板内容每次刷新都会整块重建，所以监听挂在外层容器上，用事件委托处理。
 */

const LONG_PRESS = 300;
const MOUSE_SLOP = 5;
const TOUCH_SLOP = 8;
/** 落位动画的时长（毫秒）。 */
const SETTLE_MS = 240;

/** 一行的唯一标识：种类 + id（武器和技能分开）。 */
const rowKey = (el) => `${el.dataset.dragKind}:${el.dataset.dragId}`;

/** 玩家在系统里选了“减少动态效果”时不播动画。 */
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * FLIP 落位动画（First-Last-Invert-Play）：
 *   First  换装前记下每一行在屏幕上的位置；
 *   Last   面板按新的出战配置重建后，再量一次新位置；
 *   Invert 先用 transform 把每一行“挪回”旧位置；
 *   Play   再让它们滑到新位置。
 * @param {HTMLElement} root 面板容器
 * @param {() => void} change 真正执行换装（会同步重建面板）
 * @param {{ key: string, from: DOMRect } | null} moved 被移动的那一行，以及它动画的起点（松手时浮起那一行的位置）
 */
function settle(root, change, moved) {
  if (reduceMotion()) {
    change();
    return;
  }
  const first = new Map([...root.querySelectorAll("[data-drag-id]")].map((el) => [rowKey(el), el.getBoundingClientRect()]));
  if (moved?.from) first.set(moved.key, moved.from);
  change();
  for (const el of root.querySelectorAll("[data-drag-id]")) {
    const from = first.get(rowKey(el));
    if (!from) continue;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const isMoved = moved && rowKey(el) === moved.key;
    if (!dx && !dy && !isMoved) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: SETTLE_MS,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
    // 被移动的那一行落位后闪一下蓝色底，确认换装成功。
    if (isMoved) el.animate([{ backgroundColor: "rgba(0, 47, 167, 0.16)" }, { backgroundColor: "transparent" }], { duration: 600, delay: SETTLE_MS * 0.6, easing: "ease-out" });
  }
}

/**
 * @param {HTMLElement} root 面板容器（内容可以随时重建）
 * @param {(move: { kind: string, id: string, toZone: string, targetId: string | null, before: boolean }) => void} onMove 放下时回调
 * @param {() => boolean} enabled 当前是否允许换装（战斗中、有弹窗时返回 false）
 */
export function bindLoadoutDrag(root, onMove, enabled = () => true) {
  let press = null; // 按下但还没开始拖：{ row, x, y, pointerId, type, timer }
  let drag = null; // 正在拖：{ row, ghost, kind, id, dx, dy, target }
  let picked = null; // 点选模式下拿起的那一行：{ kind, id }
  let suppressClick = false;

  const rowAt = (x, y) => document.elementFromPoint(x, y)?.closest?.("[data-drag-id], [data-drop-kind]");

  /** 清掉所有放置提示。 */
  const clearMarks = () => root.querySelectorAll(".drop-before, .drop-after, .drop-into").forEach((el) => el.classList.remove("drop-before", "drop-after", "drop-into"));

  /** 根据指针位置算出放到哪里，并画出蓝色的放置提示。 */
  function locate(x, y) {
    clearMarks();
    const hit = rowAt(x, y);
    if (!hit || !root.contains(hit)) return null;
    const list = hit.closest("[data-drop-kind]");
    if (!list || list.dataset.dropKind !== drag.kind) return null;
    const row = hit.matches("[data-drag-id]") ? hit : null;
    if (row && row !== drag.row) {
      const box = row.getBoundingClientRect();
      const before = y < box.top + box.height / 2;
      row.classList.add(before ? "drop-before" : "drop-after");
      return { toZone: list.dataset.dropZone, targetId: row.dataset.dragId, before };
    }
    list.classList.add("drop-into");
    return { toZone: list.dataset.dropZone, targetId: null, before: false };
  }

  function start(e) {
    const { row } = press;
    const box = row.getBoundingClientRect();
    // 浮起的那一行包在一个同样样式的列表里，外观和原来一致。
    const ghost = document.createElement("ul");
    ghost.className = `${row.parentElement.className} drag-ghost`;
    ghost.appendChild(row.cloneNode(true));
    ghost.style.width = `${box.width}px`;
    ghost.style.left = `${box.left}px`;
    ghost.style.top = `${box.top}px`;
    // 放在面板里（沿用面板的行样式），用 fixed 定位跟着指针走。
    root.appendChild(ghost);
    row.classList.add("dragging");
    root.classList.add("drag-active");
    drag = { row, ghost, kind: row.dataset.dragKind, id: row.dataset.dragId, dx: e.clientX - box.left, dy: e.clientY - box.top, target: null };
    picked = null;
    press = null;
    navigator.vibrate?.(10);
  }

  function finish(commit) {
    if (!drag) return;
    const { ghost, row, kind, id, target } = drag;
    // 落位动画从松手时浮起那一行的位置出发。
    const from = ghost.getBoundingClientRect();
    ghost.remove();
    row.classList.remove("dragging");
    root.classList.remove("drag-active");
    clearMarks();
    drag = null;
    suppressClick = true;
    if (commit && target) settle(root, () => onMove({ kind, id, ...target }), { key: `${kind}:${id}`, from });
  }

  root.addEventListener("pointerdown", (e) => {
    if (!enabled() || e.button > 0) return;
    const row = e.target.closest("[data-drag-id]");
    if (!row || e.target.closest("button")) return;
    press = { row, x: e.clientX, y: e.clientY, type: e.pointerType };
    if (e.pointerType !== "mouse") press.timer = setTimeout(() => press && start(e), LONG_PRESS);
  });

  window.addEventListener("pointermove", (e) => {
    if (press) {
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (press.type === "mouse" && moved > MOUSE_SLOP) start(e);
      else if (press.type !== "mouse" && moved > TOUCH_SLOP) {
        // 长按之前手指就动了：这是在滚动面板，不是拖动。
        clearTimeout(press.timer);
        press = null;
      }
    }
    if (!drag) return;
    drag.ghost.style.left = `${e.clientX - drag.dx}px`;
    drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    drag.target = locate(e.clientX, e.clientY);
  });

  const release = (commit) => {
    if (press) clearTimeout(press.timer);
    press = null;
    finish(commit);
  };
  window.addEventListener("pointerup", () => release(true));
  window.addEventListener("pointercancel", () => release(false));

  // 拿起之后阻止页面跟着手指滚动（必须是非被动监听才能 preventDefault）。
  root.addEventListener("touchmove", (e) => drag && e.preventDefault(), { passive: false });

  // 点选：点一下拿起，再点目标放下。
  root.addEventListener("click", (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (!enabled() || e.target.closest("button")) return;
    const row = e.target.closest("[data-drag-id]");
    const list = e.target.closest("[data-drop-kind]");
    if (!picked) {
      if (!row) return;
      picked = { kind: row.dataset.dragKind, id: row.dataset.dragId };
      row.classList.add("picked");
      return;
    }
    const move = { ...picked };
    picked = null;
    root.querySelectorAll(".picked").forEach((el) => el.classList.remove("picked"));
    if (!list || list.dataset.dropKind !== move.kind || row?.dataset.dragId === move.id) return;
    // 点选模式没有浮起的那一行：从它原来的位置滑过去。
    settle(root, () => onMove({ ...move, toZone: list.dataset.dropZone, targetId: row?.dataset.dragId ?? null, before: true }), { key: `${move.kind}:${move.id}`, from: null });
  });
}
