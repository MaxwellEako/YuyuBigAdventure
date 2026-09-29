import { shapeSvg, heartSvg, icon } from "./icons.js";
import { rich } from "./keywords.js";
import { WEAPONS } from "../data/weapons.js";
import { SKILLS } from "../data/skills.js";

/** 4×4 示意矩阵：hit 中的格子标为被消除，anchor 为锚点。 */
function demoGrid(hitCells = [], anchor = null, rows = 4, cols = 4, prevCells = []) {
  const hit = new Set(hitCells.map(([r, c]) => `${r},${c}`));
  const prev = new Set(prevCells.map(([r, c]) => `${r},${c}`));
  let html = "";
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const on = hit.has(`${r},${c}`);
      const isAnchor = anchor && r === anchor[0] && c === anchor[1];
      const gone = prev.has(`${r},${c}`);
      html += `<span class="demo-cell ${on ? "hit" : ""} ${gone ? "prev" : ""} ${isAnchor ? "anchor" : ""}">${gone ? "" : heartSvg("heart")}<small>a${r}${c}</small></span>`;
    }
  return `<div class="demo-grid" style="grid-template-columns:repeat(${cols}, 1fr)">${html}</div>`;
}

/** 图示条：一排带图标的小格子，用箭头连起来。 */
const steps = (items) =>
  `<div class="coach-steps">${items
    .map((item) => `<div class="coach-step ${item.tone ?? ""}"><span class="step-icon">${item.glyph}</span><b>${item.title}</b>${item.note ? `<small>${item.note}</small>` : ""}</div>`)
    .join('<i class="step-arrow" aria-hidden="true">→</i>')}</div>`;

/** 图例：图标 + 一句话。 */
const legend = (rows) =>
  `<ul class="coach-legend">${rows.map(([glyph, text]) => `<li><span class="legend-glyph">${glyph}</span><span>${text}</span></li>`).join("")}</ul>`;

const inkSwatch = '<span class="swatch ink"></span>';

/**
 * 每个新机制第一次出现时弹出的说明。文案按说明书的口吻写，关键词用 [ ] 标出。
 * body 可以是字符串，也可以是接收上下文（如本章武器槽数）的函数。
 */
export const TOPICS = {
  move: {
    title: "移动",
    body: `使用方向键或 WASD 移动一格，点击棋盘上的格子可自动寻路前往。进入[出口]即完成本章。`,
  },
  "battle-matrix": {
    title: "红心矩阵",
    body: `屿屿与怪物的生命均以[红心矩阵]表示。左侧为怪物，右侧为屿屿。红心全部消除的一方战败。${demoGrid()}`,
  },
  "battle-shape": {
    title: "形状攻击",
    body: () =>
      `每件[武器]具有固定的攻击形状。将指针移至怪物的红心矩阵上可预览攻击范围，范围内的红心将被消除。攻击范围可以越出矩阵边缘。<p class="coach-example"><span class="inline-shape">${shapeSvg(WEAPONS.hook.shape, { cell: 10 })}</span>L 钩镰瞄准 a00 时，消除 a00、a01、a10。</p>${demoGrid([[0, 0], [0, 1], [1, 0]], [0, 0])}`,
  },
  "battle-intent": {
    title: "怪物的下一招",
    body: `怪物按固定顺序行动，下一招会提前显示。${legend([
      [inkSwatch, "屿屿红心矩阵上的墨黑格为怪物下一招的攻击范围。"],
      [icon("shield"), "[防御]抵挡下一次攻击，不消耗回合。"],
      [icon("potion"), "[药水]恢复十字范围内的红心。"],
    ])}`,
  },
  // 开战时讲：钩镰这样的武器要花充能。获得方式留到第一次完美命中之后再讲。
  energy: {
    title: "充能",
    body: `L 钩镰等武器每次使用消耗 1 点[充能]。${legend([[icon("energy"), "每场战斗开始时持有 2 点，最多积蓄 5 点。"]])}`,
  },
  // 第一次打出完美命中、心阵上出现蓝色虚线框之后才弹出。
  "combo-energy": {
    title: "连击",
    body: `攻击范围内的每一格均为红心时，记为[完美命中]，命中位置以蓝色虚线框标记。更换武器，在紧邻虚线框的位置再次完美命中，即构成[连击]。${demoGrid([[1, 0], [1, 1], [2, 0]], [1, 0], 3, 4, [[0, 0], [0, 1]])}${steps([
      { glyph: icon("perfect"), title: "完美命中", note: "标记虚线框" },
      { glyph: icon("combo"), title: "连击", note: "更换武器，紧邻虚线框" },
      { glyph: icon("energy"), title: "连击 ×2 起", note: "每次连击获得 1 点充能", tone: "accent" },
    ])}攻击落空、未紧邻虚线框或连续使用同一件武器时，连击中断。`,
  },
  chest: {
    title: "宝箱与药水",
    body: "走到[宝箱]或[药水]所在格子可以拾取该物品。宝箱中装有新武器。",
  },
  slots: {
    title: "武器槽",
    body: (ctx) =>
      `出战的武器置于[武器槽]中，本章共有 ${ctx.slots} 个武器槽，其余武器存放在[背包]中。${slotDiagram(ctx.slots)}在棋盘上按 B 键[打开背包|背包]，可随时更换出战武器。`,
  },
  "slots-up": {
    title: "武器槽增加",
    body: (ctx) => `自本章起，[武器槽]增加至 ${ctx.slots} 个。${slotDiagram(ctx.slots, true)}`,
  },
  "key-door": {
    title: "钥匙与铁栅门",
    body: "[铁栅门]需要[钥匙]才能开启。拾取本章棋盘上的钥匙后，走入铁栅门即可将其打开。",
  },
  ambush: {
    title: "巡猎的怪物",
    body: "部分怪物发现屿屿后会主动追击。被怪物接触时，由怪物先手。将指针停在怪物上，可查看其招式与移动方式。",
  },
  skills: {
    title: "技能",
    body: `[技能]为次数有限的特殊攻击，不占用武器槽。${legend([[icon("skill"), "每章开始时恢复全部次数。"]])}`,
  },
  forge: {
    title: "铁砧",
    body: "站在[铁砧]相邻的格子上点击铁砧，可从三项强化中选择一项。每项可重抽一次。每座铁砧仅能使用一次。",
  },
  // 护甲只讲玩家手里已经有的破甲手段。
  armor: {
    title: "护甲心",
    body: (ctx) =>
      `带黑框的[护甲心]需要命中两次才会消除。命中护甲心同样计入[完美命中]。${legend(
        [
          ctx.weapons?.includes("awl") ? [icon("pierce"), "破甲锥可一击消除护甲心。"] : null,
          ctx.skills?.includes("crush") ? [icon("pierce"), "技能碎甲可一击消除护甲心。"] : null,
        ].filter(Boolean),
      )}`,
  },
  charge: {
    title: "蓄力",
    body: `怪物蓄力后，下一招为[重击]。可使用[防御]抵挡。`,
  },
  heal: {
    title: "恢复红心",
    body: `部分怪物会恢复红心。恢复的位置以红色虚线框提前标出，且必须与现有红心相连。${legend([
      ['<span class="swatch heal-plan"></span>', "在怪物行动前消除与虚线框相邻的红心，可减少或阻止这次恢复。"],
    ])}`,
  },
  // 第一次拿到战锤这样的重武器时弹出。
  heavy: {
    title: "重型武器",
    body: (ctx) =>
      `${ctx.weapon ? `<p class="coach-example"><span class="inline-shape">${shapeSvg(ctx.weapon.shape, { cell: 12 })}</span>${ctx.weapon.name}可一次消除大片红心。</p>` : ""}${legend([
        [`${icon("energy")}${icon("energy")}`, "每次使用消耗 2 点[充能]。"],
        [icon("stagger"), "单次消除不少于 3 颗红心，可[打断]怪物蓄力后的[重击]。可打断时，怪物的下一招旁显示此标记。"],
      ])}`,
  },
  fog: {
    title: "战争迷雾",
    body: "[迷雾]中仅显示屿屿周围的格子，障碍物会遮挡视线。已探索的区域保留地形，但不显示怪物。[出口]始终可见。",
  },
  boss: {
    title: "暗王",
    body: "暗王的情报无法查看，战斗中仅显示其下一招。「将军！」会中断[连击]并延长武器的[冷却]。暗王战无法撤退。",
  },
};

/** 武器槽示意：实心格为出战，虚线格为本章新增的槽。 */
function slotDiagram(n, grow = false) {
  const cells = Array.from({ length: 5 }, (_, i) =>
    i < n ? `<i class="slot-cell ${grow && i === n - 1 ? "new" : ""}">${icon("sword")}</i>` : '<i class="slot-cell locked"></i>',
  ).join("");
  return `<div class="slot-diagram">${cells}</div>`;
}

/** 新技能的说明（每个技能第一次学会时弹出）。 */
export function skillTopic(id) {
  const skill = SKILLS[id];
  return {
    title: `新技能 · ${skill.name}`,
    body: `<p class="coach-example"><span class="inline-shape">${shapeSvg(skill.shape, { cell: 12, tone: "skill" })}</span>${skill.desc}</p>${legend([
      [icon("skill"), `每章 ×${skill.charges}`],
    ])}`,
  };
}

/**
 * 说明弹窗。依次展示尚未看过的主题；关闭提示时直接跳过。
 * 返回 Promise，全部看完后 resolve，方便在战斗开始前或进入章节后等待。
 */
export function createCoach({ root, enabled, seen, markSeen, sfx }) {
  return async function explain(items, ctx = {}) {
    if (!enabled()) return;
    const queue = items
      .map((item) => (typeof item === "string" ? { id: item, topic: TOPICS[item] } : item))
      .filter((item) => item.topic && !seen(item.id));
    for (const [index, item] of queue.entries()) {
      markSeen(item.id);
      const body = rich(typeof item.topic.body === "function" ? item.topic.body(ctx) : item.topic.body);
      await new Promise((resolve) => {
        root.innerHTML = `<div class="coach" role="dialog" aria-modal="true" aria-label="${item.topic.title}">
          <div class="coach-card">
            <div class="coach-head"><span class="t-meta">New · 新机制</span>${queue.length > 1 ? `<span class="t-meta">${index + 1} / ${queue.length}</span>` : ""}</div>
            <h3>${item.topic.title}</h3>
            <div class="coach-body">${body}</div>
            <div class="coach-actions"><button class="primary" data-coach-ok>${index + 1 < queue.length ? "下一条" : "知道了"}<span aria-hidden="true">→</span></button></div>
          </div>
        </div>`;
        const ok = root.querySelector("[data-coach-ok]");
        sfx?.play("page");
        const done = () => {
          document.removeEventListener("keydown", onKey, true);
          root.innerHTML = "";
          sfx?.play("click");
          resolve();
        };
        const onKey = (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done();
          } else e.stopPropagation();
        };
        ok.addEventListener("click", done);
        document.addEventListener("keydown", onKey, true);
        setTimeout(() => ok.focus(), 30);
      });
    }
  };
}
