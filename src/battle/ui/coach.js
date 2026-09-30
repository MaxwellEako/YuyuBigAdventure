import { shapeSvg, heartSvg, icon } from "./icons.js";
import { rich } from "./keywords.js";
import { WEAPONS } from "../data/weapons.js";
import { SKILLS } from "../data/skills.js";
import { getHeroName } from "../data/heroName.js";
import { CHASE_EVERY, ENERGY_COST, ENERGY_START, ENERGY_MAX } from "../logic/combat.js";

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
import { isTouch as coarse, battleLayout } from "./device.js";

/** 战斗窗口里怪物心阵 / 主角心阵的方位：竖屏手机上下排布，其余左右并排。 */
const sides = () => (battleLayout() === "stacked" ? { enemy: "上方", hero: "下方" } : { enemy: "左侧", hero: "右侧" });

/**
 * 每个新机制第一次出现时弹出的说明。文案按说明书的口吻写，关键词用 [ ] 标出。
 * body 可以是字符串，也可以是接收上下文（如本章武器槽数）的函数。
 */
export const TOPICS = {
  move: {
    title: "移动",
    body: () =>
      coarse()
        ? `点击屏幕右下角的方向键移动一格；点击棋盘上的格子，可自动寻路前往。进入[出口]即完成本章。`
        : `使用方向键或 WASD 移动一格，点击棋盘上的格子可自动寻路前往。进入[出口]即完成本章。`,
  },
  // 第一场战斗的引导：逐个高亮战斗界面上的区域，说明卡贴在旁边。
  "tour-enemy": {
    title: "怪物的红心矩阵",
    target: "[data-side=enemy] .matrix-box",
    body: () => `${sides().enemy}为怪物的[红心矩阵]。消除全部红心即可获胜。`,
  },
  "tour-hero": {
    get title() {
      return `${getHeroName()}的红心矩阵`;
    },
    target: "[data-side=hero] .matrix-box",
    body: () => `${sides().hero}为${getHeroName()}的[红心矩阵]，红心全部消除即战败。${legend([[inkSwatch, "墨黑格为怪物下一招的攻击范围。"]])}`,
  },
  "tour-intent": {
    title: "怪物的下一招",
    target: "[data-side=enemy] .intent",
    body: `怪物按固定顺序出招。此处显示其下一招及之后的出招顺序。`,
  },
  "tour-attack": {
    title: "攻击",
    target: "[data-weapons]",
    body: () =>
      `选择一件[武器]，${
        coarse() ? "点击怪物红心矩阵上的格子预览攻击范围，再次点击同一格发动攻击" : "将指针移至怪物的红心矩阵上预览攻击范围，单击发动攻击"
      }。范围内的红心将被消除，攻击范围可越出矩阵边缘。<p class="coach-example"><span class="inline-shape">${shapeSvg(WEAPONS.dagger.shape, { cell: 10 })}</span>短剑：横向攻击两格。</p>`,
  },
  "tour-energy": {
    title: "充能",
    target: "[data-energy]",
    body: `中型武器（如钩镰）每次使用消耗 1 点[充能]。${legend([[icon("energy"), `每场战斗开始时持有 ${ENERGY_START} 点，最多积蓄 ${ENERGY_MAX} 点。`]])}`,
  },
  "tour-shield": {
    title: "防御",
    target: "[data-act=shield]",
    body: `[防御]抵挡怪物的下一次攻击，不消耗回合。使用后需要[冷却] 3 回合。`,
  },
  "tour-potion": {
    title: "药水",
    target: "[data-act=potion]",
    body: `[药水]恢复十字范围内的红心，消耗一回合。数字为剩余瓶数。`,
  },
  "tour-retreat": {
    title: "撤退",
    target: "[data-act=retreat]",
    body: `承受怪物的一次追击后返回棋盘，该怪物晕眩两回合。`,
  },
  // 第一次打出完美命中、心阵上出现蓝色虚线框之后才弹出。
  "combo-energy": {
    title: "连击",
    target: "[data-side=enemy] .matrix-box",
    body: `攻击范围内的每一格均为红心时，记为[完美命中]，命中位置以蓝色虚线框标记。更换武器，在紧邻虚线框的位置再次完美命中，即构成[连击]。${demoGrid([[1, 0], [1, 1], [2, 0]], [1, 0], 3, 4, [[0, 0], [0, 1]])}${steps([
      { glyph: icon("perfect"), title: "完美命中", note: "标记虚线框" },
      { glyph: icon("combo"), title: "连击", note: "更换武器，紧邻虚线框" },
      { glyph: icon("energy"), title: "连击 ×2 起", note: "每次连击获得 1 点充能", tone: "accent" },
      { glyph: icon("chase"), title: `连击 ×${CHASE_EVERY}`, note: "追击：怪物行动前再攻击一次", tone: "accent" },
    ])}按怪物红心矩阵的形状交替使用不同武器，可更快消除全部红心。攻击落空、未紧邻虚线框或连续使用同一件武器时，连击中断。[追击]期间不会再次触发追击。`,
  },
  chest: {
    title: "宝箱与药水",
    body: "进入[宝箱]或[药水]所在的格子即可拾取。宝箱中装有新武器。",
  },
  slots: {
    title: "武器槽",
    body: (ctx) =>
      `出战的武器置于[武器槽]中，本章共有 ${ctx.slots} 个武器槽，其余武器存放在[背包]中。${slotDiagram(ctx.slots)}${coarse() ? "点击信息栏的「武器」，再点击底部的[构筑]" : "在棋盘上按 B 键打开[构筑]"}，可随时更换出战武器。`,
  },
  "slots-up": {
    title: "武器槽增加",
    body: (ctx) => `自本章起，[武器槽]增加至 ${ctx.slots} 个。${slotDiagram(ctx.slots, true)}`,
  },
  "key-door": {
    title: "钥匙与铁栅门",
    body: "[铁栅门]须使用[钥匙]开启。拾取本章棋盘上的钥匙后，进入铁栅门所在的格子即可将其打开。",
  },
  ambush: {
    title: "巡猎的怪物",
    get body() {
      return `部分怪物发现${getHeroName()}后会主动追击。被怪物接触时，由怪物先手。${coarse() ? "在「目标」中可查看怪物的移动方式。" : "将指针停在怪物上，可查看其招式与移动方式。"}`;
    },
  },
  skills: {
    title: "技能",
    body: `[技能]为次数有限的特殊攻击，不占用武器槽。${legend([[icon("skill"), "每章开始时恢复全部次数。"]])}`,
  },
  forge: {
    title: "铁砧",
    body: "站在[铁砧]相邻的格子上点击铁砧，可从三项强化中选择一项。每项可重抽一次，每座铁砧仅可使用一次。",
  },
  // 护甲只讲玩家手里已经有的破甲手段。
  armor: {
    title: "护甲心",
    target: "[data-side=enemy] .matrix-box",
    body: (ctx) =>
      `带黑框的[护甲心]须命中两次才会消除。命中护甲心同样计入[完美命中]。${legend(
        [
          ctx.weapons?.includes("awl") ? [icon("pierce"), "破甲锥可一击消除护甲心。"] : null,
          ctx.skills?.includes("crush") ? [icon("pierce"), "技能碎甲可一击消除护甲心。"] : null,
        ].filter(Boolean),
      )}`,
  },
  charge: {
    title: "蓄力",
    target: "[data-side=enemy] .intent",
    body: `怪物蓄力后，下一招为[重击]。可使用[防御]抵挡。`,
  },
  heal: {
    title: "恢复红心",
    target: "[data-side=enemy] .matrix-box",
    body: `部分怪物会恢复红心。恢复的位置以红色虚线框提前标出，且必须与现有红心相连。${legend([
      ['<span class="swatch heal-plan"></span>', "在怪物行动前消除与虚线框相邻的红心，可减少或阻止这次恢复。"],
    ])}`,
  },
  // 第一次拿到战锤这样的重武器时弹出。
  plate: {
    title: "护甲片",
    body: () => `${legend([
      [icon("armor"), "护甲片可为自己[红心矩阵]中 2×2 范围内的红心附加护甲。"],
      [heartSvg("armor"), "[护甲心]首次被击中时失去护甲，第二次被击中时消除。"],
    ])}${coarse() ? "点击信息栏的护甲片图标" : "在棋盘上按 G 键或点击信息栏的护甲片图标"}，选择位置后使用。`,
  },
  heavy: {
    title: "重型武器",
    body: (ctx) =>
      `${ctx.weapon ? `<p class="coach-example"><span class="inline-shape">${shapeSvg(ctx.weapon.shape, { cell: 12 })}</span>${ctx.weapon.name}可一次消除大范围的红心。</p>` : ""}${legend([
        [icon("energy").repeat(ENERGY_COST.heavy), `每次使用消耗 ${ENERGY_COST.heavy} 点[充能]，多于战斗开始时持有的 ${ENERGY_START} 点，须先通过[连击]积蓄。`],
        [icon("stagger"), "单次消除不少于 3 颗红心，可[打断]怪物蓄力后的[重击]。可打断时，怪物的下一招旁显示此标记。"],
      ])}`,
  },
  fog: {
    title: "战争迷雾",
    get body() {
      return `[迷雾]中仅显示${getHeroName()}周围的格子，障碍物会遮挡视线。已探索的区域保留地形，但不显示怪物。[出口]始终可见。`;
    },
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

/** 找到说明要指向的元素；不在页面上或看不见时返回 null，说明卡改为居中。 */
function findTarget(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? el : null;
}

/**
 * 把说明卡放在高亮区域旁边：依次尝试下方、上方、右侧、左侧，放得下就用；
 * 都放不下时贴在屏幕底部居中。箭头指向高亮区域的中心。
 */
function placeCard(card, arrow, spot, el) {
  const pad = 6;
  const gap = 14;
  const margin = 12;
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  const t = el.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  Object.assign(spot.style, {
    left: `${t.left - pad}px`,
    top: `${t.top - pad}px`,
    width: `${t.width + pad * 2}px`,
    height: `${t.height + pad * 2}px`,
  });
  // 先按内容的自然高度量尺寸，再决定放哪一边。
  card.style.maxHeight = "";
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const cx = t.left + t.width / 2;
  const cy = t.top + t.height / 2;
  const room = { below: H - t.bottom - pad - gap - margin, above: t.top - pad - gap - margin };
  const sides = [
    ["below", room.below >= ch, () => [clamp(cx - cw / 2, margin, W - cw - margin), t.bottom + pad + gap]],
    ["above", room.above >= ch, () => [clamp(cx - cw / 2, margin, W - cw - margin), t.top - pad - gap - ch]],
    ["right", W - t.right - pad - gap - margin >= cw, () => [t.right + pad + gap, clamp(cy - ch / 2, margin, H - ch - margin)]],
    ["left", t.left - pad - gap - margin >= cw, () => [t.left - pad - gap - cw, clamp(cy - ch / 2, margin, H - ch - margin)]],
  ];
  let fit = sides.find(([, ok]) => ok);
  if (!fit) {
    // 哪一边都放不下（手机上的长说明）：贴在上下空间更大的一边，卡片压到那一边的高度，正文在卡片里滚动，
    // 标题和按钮始终在屏幕内。实在太挤（目标几乎占满屏幕）就直接压在屏幕中间。
    const side = room.below >= room.above ? "below" : "above";
    const space = Math.max(room[side], 0);
    if (space >= Math.min(ch, 220)) {
      card.style.maxHeight = `${space}px`;
      const h = Math.min(ch, space);
      const x = clamp(cx - cw / 2, margin, W - cw - margin);
      fit = [side, true, () => [x, side === "below" ? t.bottom + pad + gap : t.top - pad - gap - h]];
    } else {
      card.style.maxHeight = `${H - margin * 2}px`;
      const h = Math.min(ch, H - margin * 2);
      fit = ["none", true, () => [(W - cw) / 2, (H - h) / 2]];
    }
  }
  const [side, , pos] = fit;
  const [x, y] = pos();
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
  arrow.dataset.side = side;
  const shownH = card.offsetHeight;
  if (side === "below" || side === "above") {
    arrow.style.left = `${clamp(cx - x, 18, cw - 18)}px`;
    arrow.style.top = "";
  } else if (side === "left" || side === "right") {
    arrow.style.top = `${clamp(cy - y, 18, shownH - 18)}px`;
    arrow.style.left = "";
  }
}

/**
 * 说明弹窗。依次展示尚未看过的主题；关闭提示时直接跳过。
 * 主题带 target 时高亮界面上的对应区域，说明卡贴在旁边；否则居中显示。
 * 返回 Promise，全部看完后 resolve，方便在战斗开始前或进入章节后等待。
 */
/** 同一时刻最多讲几张新机制卡；界面导览（tour-*）是一组指向式说明，不计入、也不拆开。 */
export const TOPICS_PER_MOMENT = 2;

export function createCoach({ root, enabled, seen, markSeen, sfx }) {
  // 超出数量、这次没讲的说明卡，按场合（棋盘 / 战斗）顺延到下一次同类场合再讲。
  const deferred = new Map();
  return async function explain(items, ctx = {}, { context = "board", limit = TOPICS_PER_MOMENT } = {}) {
    if (!enabled()) return;
    const fresh = items
      .map((item) => (typeof item === "string" ? { id: item, topic: TOPICS[item] } : item))
      .filter((item) => item.topic && !seen(item.id));
    const pending = (deferred.get(context) ?? []).filter((item) => !seen(item.id) && !fresh.some((f) => f.id === item.id));
    const all = [...pending, ...fresh];
    const isTour = (item) => item.id.startsWith("tour-");
    const tour = all.filter(isTour);
    const rest = all.filter((item) => !isTour(item));
    const queue = [...tour, ...rest.slice(0, limit)];
    deferred.set(context, rest.slice(limit));
    if (!queue.length) return;
    // 指向式说明要等界面（如刚打开的战斗窗口）展开、排好版，才能准确指到位置。
    if (queue.some((item) => item.topic.target)) await new Promise((r) => setTimeout(r, 360));
    root.innerHTML = `<div class="coach" role="dialog" aria-modal="true">
      <div class="coach-spot" hidden></div>
      <div class="coach-card"><i class="coach-arrow" aria-hidden="true"></i><div class="coach-inner"></div></div>
    </div>`;
    const overlay = root.querySelector(".coach");
    const spot = root.querySelector(".coach-spot");
    const card = root.querySelector(".coach-card");
    const arrow = root.querySelector(".coach-arrow");
    const inner = root.querySelector(".coach-inner");
    let target = null;
    const relayout = () => target && placeCard(card, arrow, spot, target);
    window.addEventListener("resize", relayout);

    let skipped = false;
    for (const [index, item] of queue.entries()) {
      if (skipped) {
        markSeen(item.id);
        continue;
      }
      markSeen(item.id);
      const body = rich(typeof item.topic.body === "function" ? item.topic.body(ctx) : item.topic.body);
      const last = index + 1 === queue.length;
      target = findTarget(item.topic.target);
      overlay.classList.toggle("pointed", Boolean(target));
      spot.hidden = !target;
      overlay.setAttribute("aria-label", item.topic.title);
      inner.innerHTML = `<div class="coach-head"><span class="t-meta">New · 新机制</span>${queue.length > 1 ? `<span class="t-meta">${index + 1} / ${queue.length}</span>` : ""}</div>
        <h3>${item.topic.title}</h3>
        <div class="coach-body">${body}</div>
        <div class="coach-actions">${!last ? '<button class="ghost" data-coach-skip>跳过</button>' : ""}<button class="primary" data-coach-ok>${last ? "知道了" : "下一条"}<span aria-hidden="true">→</span></button></div>`;
      card.style.left = "";
      card.style.top = "";
      card.classList.remove("enter");
      void card.offsetWidth;
      card.classList.add("enter");
      if (target) placeCard(card, arrow, spot, target);
      sfx?.play("page");
      await new Promise((resolve) => {
        const ok = inner.querySelector("[data-coach-ok]");
        const skip = inner.querySelector("[data-coach-skip]");
        const done = (all = false) => {
          document.removeEventListener("keydown", onKey, true);
          skipped = all;
          sfx?.play("click");
          resolve();
        };
        const onKey = (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done(e.key === "Escape");
          } else e.stopPropagation();
        };
        ok.addEventListener("click", () => done());
        skip?.addEventListener("click", () => done(true));
        document.addEventListener("keydown", onKey, true);
        setTimeout(() => ok.focus(), 30);
      });
    }
    window.removeEventListener("resize", relayout);
    root.innerHTML = "";
  };
}
