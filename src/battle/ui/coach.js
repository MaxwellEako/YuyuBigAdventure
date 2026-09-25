import { shapeSvg, heartSvg, icon } from "./icons.js";
import { rich } from "./keywords.js";
import { WEAPONS } from "../data/weapons.js";
import { SKILLS } from "../data/skills.js";
import { UPGRADE_TEXT } from "../logic/arsenal.js";

/** 4×4 示意矩阵：hit 中的格子标为被消除，anchor 为锚点。 */
function demoGrid(hitCells = [], anchor = null, rows = 4, cols = 4) {
  const hit = new Set(hitCells.map(([r, c]) => `${r},${c}`));
  let html = "";
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const on = hit.has(`${r},${c}`);
      const isAnchor = anchor && r === anchor[0] && c === anchor[1];
      html += `<span class="demo-cell ${on ? "hit" : ""} ${isAnchor ? "anchor" : ""}">${heartSvg("heart")}<small>a${r}${c}</small></span>`;
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
    body: `方向键或 WASD 移动一格，点击远处的格子，屿屿会自己走过去。走进蓝色方框的[出口]，这一章就完成了。`,
  },
  "battle-matrix": {
    title: "红心矩阵",
    body: `屿屿和怪物的生命都是一块[红心矩阵]。左边是怪物，右边是屿屿，红心碎光的一方倒下。${demoGrid()}`,
  },
  "battle-shape": {
    title: "形状攻击",
    body: () =>
      `每件[武器]有自己的形状。鼠标移到怪物的心阵上，形状盖住的红心就是这一击要打碎的红心；形状探出矩阵边缘也照样能出手。<p class="coach-example"><span class="inline-shape">${shapeSvg(WEAPONS.hook.shape, { cell: 10 })}</span>L 钩镰对准 a00，打碎 a00、a01、a10。</p>${demoGrid([[0, 0], [0, 1], [1, 0]], [0, 0])}`,
  },
  "battle-intent": {
    title: "怪物的下一招",
    body: `怪物按固定的顺序出招。${legend([
      [inkSwatch, "你心阵上的墨黑格，就是它下一招要打的地方。"],
      [icon("shield"), "[木盾] 挡下一次攻击，举盾不占回合。"],
      [icon("potion"), "[药水] 补回十字范围里的红心。"],
    ])}`,
  },
  "battle-combo": {
    title: "连击",
    body: `形状的每一格都落在红心上，就是一次[完美命中]。一次接一次地完美命中，就连成了[连击]。${steps([
      { glyph: icon("perfect"), title: "完美命中", note: "起手" },
      { glyph: icon("combo"), title: "连击", note: "其他武器冷却 −1", tone: "accent" },
      { glyph: icon("chase"), title: "连击 ×2", note: "追击，怪物来不及还手", tone: "accent" },
    ])}之后每连上两次，再追击一次。打到空格、护甲或矩阵外，连击就断了。`,
  },
  chest: {
    title: "宝箱与药水",
    body: "走到[宝箱]旁边点一下，就能打开它，里面是新的武器。[药水]也要站在旁边点一下才会收进包里。",
  },
  slots: {
    title: "武器槽",
    body: (ctx) =>
      `上阵的武器放在[武器槽]里，这一章有 ${ctx.slots} 个。其余的收在[背包]里。${slotDiagram(ctx.slots)}在棋盘上按 B 打开[构筑]，随时可以换。`,
  },
  "slots-up": {
    title: "武器槽增加",
    body: (ctx) => `从这一章起，[武器槽]增加到 ${ctx.slots} 个。${slotDiagram(ctx.slots, true)}`,
  },
  "key-door": {
    title: "钥匙与铁栅门",
    body: "[铁栅门]挡住了去路。[钥匙]就在这张棋盘上，拿到后走进铁栅门即可打开。",
  },
  ambush: {
    title: "巡猎的怪物",
    body: "有的怪物一看见屿屿就会追过来。被怪物撞上时，由它先出手。鼠标停在怪物身上，可以看到它的招式和走法。",
  },
  skills: {
    title: "技能",
    body: `[技能]是次数有限的特殊攻击，不占武器槽，最多带两个。${legend([
      [icon("skill"), "每章开始时，技能次数补满。"],
      [icon("bag"), "学会的技能多于两个时，在构筑里挑选带哪两个。"],
    ])}`,
  },
  forge: {
    title: "铁砧",
    body: () =>
      `站在[铁砧]旁边点一下，从三项强化里挑一项。每项可以重抽一次，离开再回来，选项不会变。每座铁砧只能用一次。${legend(
        ["rotate", "mirror", "extend", "precise"].map((k) => [icon(UPGRADE_TEXT[k].icon), `[${UPGRADE_TEXT[k].name}] ${UPGRADE_TEXT[k].desc}`]),
      )}`,
  },
  armor: {
    title: "护甲心",
    body: `带黑框的[护甲心]要打两下才会碎。打在护甲上接不上连击。[破甲锥|破甲]一下就能把它击碎。`,
  },
  fog: {
    title: "战争迷雾",
    body: "[迷雾]里只看得见屿屿身边的格子，障碍也会挡住视线。走过的地方会留下地形，怪物却藏回了雾里。[出口]始终看得见。",
  },
  boss: {
    title: "暗王",
    body: "暗王的底细无从得知，交手时只看得到它的下一招。它的「将军！」会打断[连击]。这一战没有退路。",
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
