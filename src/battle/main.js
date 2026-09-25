import "./style.css";
import { BoardWorld } from "./render/world.js";
import { Sfx } from "./audio.js";
import { LEVELS, weaponsForLevel, skillsForLevel } from "./data/levels.js";
import { WEAPONS, STARTING_WEAPONS, POTION, SHIELD } from "./data/weapons.js";
import { SKILLS } from "./data/skills.js";
import {
  weaponShape,
  applyUpgrade,
  upgradePreview,
  createForgeOptions,
  rerollForgeOption,
  toggleEquip,
  toggleSkill,
  swapEquip,
  swapSkill,
  UPGRADE_TEXT,
  SKILL_SLOTS,
} from "./logic/arsenal.js";
import { createCoach, skillTopic, TOPICS } from "./ui/coach.js";
import { rich, kw } from "./ui/keywords.js";

const TOPICS_SLOTS_UP = TOPICS["slots-up"];
import { MONSTERS, INTENT_TEXT } from "./data/monsters.js";
import {
  createBoard,
  heroMove,
  isVisible,
  isExplored,
  visibleMonsterAt,
  NEARBY_PICKUP,
  pickableAt,
  pickupAt,
  useForge,
  heroCanEnter,
  advanceMonsters,
  resolveBattle,
  threatTiles,
  isAdjacent,
  ORTHO,
  key,
} from "./logic/board.js";
import { createCombat } from "./logic/combat.js";
import { countHearts, resolveHeal, applyChanges } from "./logic/shapes.js";
import { runBattle, GLYPH, MOVE_TEXT } from "./ui/battleView.js";
import { MatrixView } from "./ui/matrixView.js";
import { SPRITE, icon, shapeSvg, matrixSvg, heartSvg } from "./ui/icons.js";

// v3：新增序章；每章开始时的构筑（强化、装备的武器与技能）一起保存；记录看过的新机制说明。
const STORAGE_KEY = "heart-gambit-progress-v3";
const AI_TEXT = { static: "原地驻守", patrol: "来回巡逻", chase: "随处巡逻" };

function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && typeof data.unlocked === "number") return { unlocked: 1, stars: {}, loadouts: {}, seen: [], hints: true, ...data };
  } catch {
    /* 隐私模式或存储被禁用时退回到本次会话 */
  }
  return { unlocked: 1, stars: {}, loadouts: {}, seen: [], hints: true };
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* 同上 */
  }
}

const app = document.querySelector("#app");
app.innerHTML = `${SPRITE}
  <div class="stage" id="stage" aria-label="3D 棋盘"></div>
  <header class="topbar">
    <div class="brand"><span class="brand-mark" aria-hidden="true"></span><div><strong>心阵棋局</strong><small>HEART GAMBIT</small></div></div>
    <div class="chapter" id="chapter"></div>
    <div class="top-actions">
      <span class="turns" id="turns" title="已行动回合"></span>
      <button class="icon-btn" data-cmd="rotate" title="旋转视角（C）" aria-label="旋转视角">${icon("rotate")}</button>
      <button class="icon-btn" data-cmd="help" title="玩法说明（H）" aria-label="玩法说明">${icon("help")}</button>
      <button class="icon-btn" data-cmd="sound" title="音效开关" aria-label="音效开关" id="sound-btn">${icon("sound")}</button>
      <button class="icon-btn" data-cmd="restart" title="重新开始本关（R）" aria-label="重新开始本关">${icon("restart")}</button>
      <button class="icon-btn" data-cmd="levels" title="选择关卡" aria-label="选择关卡">${icon("menu")}</button>
    </div>
  </header>
  <aside class="hud hero-hud" id="hero-hud"></aside>
  <aside class="hud goal-hud" id="goal-hud"></aside>
  <div class="hint-bar" id="hint-bar"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</span><span>点击格子 自动寻路</span><span>拖拽 旋转 / 滚轮 缩放</span><span>悬停怪物 查看情报</span></div>
  <div class="dpad" id="dpad" aria-label="方向键">
    <button data-dir="up" aria-label="上">↑</button><button data-dir="left" aria-label="左">←</button><button data-dir="down" aria-label="下">↓</button><button data-dir="right" aria-label="右">→</button>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <div class="tooltip" id="tooltip" hidden></div>
  <div id="battle-root"></div>
  <div class="screen" id="screen" hidden></div>
  <div id="coach-root"></div>`;

const $ = (sel) => document.querySelector(sel);
const world = new BoardWorld($("#stage"));
const sfx = new Sfx();
const progress = loadProgress();
const explain = createCoach({
  root: $("#coach-root"),
  enabled: () => progress.hints !== false,
  seen: (id) => progress.seen.includes(id),
  markSeen: (id) => {
    progress.seen = [...progress.seen, id];
    saveProgress();
  },
  sfx,
});

let board = null;
let levelIndex = 0;
let busy = false;
let playing = false;
let hoverTile = null;
let walkToken = 0;
let levelGen = 0;
let screenName = null;
let screenBack = null;
let currentCombat = null;

// ——— 通用提示 ———

let toastTimer = 0;
function toast(html, tone = "") {
  const el = $("#toast");
  el.innerHTML = html;
  el.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

// ——— HUD ———

const pad = (n) => String(n).padStart(2, "0");

/** 瑞士风小标题：等宽编号 + 中文 + 英文大写。 */
const kicker = (nb, zh, en, extra = "") =>
  `<div class="kicker"><span class="kicker-nb">${nb}</span><span>${zh}</span><span class="kicker-en">${en}</span>${extra}</div>`;

function renderHud() {
  if (!board) return;
  const level = board.level;
  $("#chapter").innerHTML = `<span class="t-meta">CH.${pad(level.id)}</span><b>${level.name}</b><em class="t-meta">${level.english}</em>`;
  $("#turns").innerHTML = `<span class="t-meta">TURN</span><b>${pad(board.turn)}</b><span class="t-meta">PAR ${level.par}</span>`;
  const { hearts, slots } = countHearts(board.hero.matrix);
  const hero = board.hero;
  $("#hero-hud").innerHTML = `
    ${kicker("01", "主角", "HERO")}
    <div class="hud-hero">
      <div class="hud-name"><b>屿屿</b><small>白色小兵 · ${hero.matrix.length}×${hero.matrix[0].length} 红心矩阵</small></div>
      <div class="hud-hp ${hearts / slots < 0.35 ? "low" : ""}"><span class="num">${hearts}</span><span class="of">/${slots}</span></div>
    </div>
    <div class="hud-matrix" title="你的红心矩阵">${matrixSvg(hero.matrix, { cell: 16, gap: 3 })}</div>
    <div class="hud-items">
      <button class="chip-btn" data-cmd="potion" ${hero.potions && hearts < slots ? "" : "disabled"} title="喝药水（P）">${icon("potion")}<span>药水</span><b>${hero.potions}</b></button>
      <span class="chip ${hero.keys ? "on" : ""}" title="钥匙">${icon("key")}<span>钥匙</span><b>${hero.keys}</b></span>
    </div>
    ${kicker("02", "武器", "ARSENAL", slotPips(hero.equipped.length, hero.slots))}
    <ul class="weapon-list">${hero.equipped
      .map((id, i) => {
        const w = WEAPONS[id];
        return `<li title="${w.desc}"><span class="wi">${i + 1}</span><span class="ws">${shapeSvg(weaponShape(id, hero.upgrades), { cell: 8, gap: 1.5 })}</span><span class="wn"><b>${w.name}${upIcons(id, hero.upgrades)}</b></span><em>${cdMark(w.cooldown)}</em></li>`;
      })
      .join("")}
      <li class="shield-row" title="${SHIELD.desc}"><span class="wi">Q</span><span class="ws">${icon("shield")}</span><span class="wn"><b>${SHIELD.name}</b></span><em>${cdMark(SHIELD.cooldown)}</em></li>
    </ul>
    ${hero.weapons.length > hero.equipped.length ? `<p class="bag-line" title="背包">${icon("bag")}${hero.weapons.filter((id) => !hero.equipped.includes(id)).map((id) => `<span title="${WEAPONS[id].name}">${shapeSvg(weaponShape(id, hero.upgrades), { cell: 6, gap: 1.5 })}</span>`).join("")}</p>` : ""}
    ${Object.keys(hero.skills).length ? `${kicker("03", "技能", "SKILLS", slotPips(hero.equippedSkills.length, SKILL_SLOTS, "skill"))}
    <ul class="weapon-list skill-list">${hero.equippedSkills
      .map((id) => {
        const sk = SKILLS[id];
        const charges = hero.skills[id];
        return `<li class="${charges ? "" : "spent"}" title="${sk.desc}"><span class="wi">${icon("skill")}</span><span class="ws">${shapeSvg(sk.shape, { cell: 8, gap: 1.5, tone: "skill" })}</span><span class="wn"><b>${sk.name}</b></span><em>×${charges}</em></li>`;
      })
      .join("")}</ul>` : ""}
    <button class="ghost build-btn" data-cmd="armory">${icon("bag")}<span>构筑</span><span class="t-meta">B</span></button>`;

  const alive = board.monsters.filter((m) => m.alive);
  $("#goal-hud").innerHTML = `
    ${kicker("04", "目标", "OBJECTIVE")}
    <p class="goal">${rich(level.goalText)}</p>
    ${kicker("05", "敌人", "HOSTILES", `<em>${alive.length}/${board.monsters.length}</em>`)}
    <ul class="enemy-list">${board.monsters
      .map((m) => {
        const { hearts: h, slots: sl } = countHearts(m.matrix);
        if (!m.seen) return `<li class="unseen"><span class="avatar-sm unknown">?</span><span class="wn"><b>未发现</b><small>藏在迷雾中</small></span><em>?</em></li>`;
        const hp = m.def.boss ? "?" : `${h}/${sl}`;
        return `<li class="${m.alive ? "" : "dead"} ${m.aggro && m.alive ? "alert" : ""}" data-uid="${m.uid}"><span class="avatar-sm ${m.def.model}">${GLYPH[m.def.model]}</span><span class="wn"><b>${m.def.name}</b><small>${m.alive ? `${m.def.boss ? "情报不明" : AI_TEXT[m.ai]}${m.stun ? " · 晕眩" : ""}` : "已击败"}</small></span><em>${m.alive ? hp : "0"}</em></li>`;
      })
      .join("")}</ul>
    <p class="hud-foot"><span class="sq ${board.exitOpen ? "on" : ""}"></span>${board.exitOpen ? "出口已开启" : "出口已被封印"}</p>`;
}

/** 槽位小方块：实心为已占用。 */
function slotPips(used, total, tone = "") {
  return `<em class="slot-pips ${tone}" title="${used}/${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < used ? "on" : ""}"></i>`).join("")}</em>`;
}

/** 冷却标记：沙漏 + 回合数；不需要冷却的武器不标。 */
const cdMark = (n) => (n ? `<span class="cd-mark" title="冷却 ${n} 回合">${icon("cd")}${n}</span>` : "");

/** 武器已获得的强化，用小图标表示。 */
const upIcons = (id, upgrades) =>
  Object.keys(UPGRADE_TEXT)
    .filter((k) => upgrades[id]?.[k])
    .map((k) => `<i class="up-icon" title="${UPGRADE_TEXT[k].name}">${icon(UPGRADE_TEXT[k].icon)}</i>`)
    .join("") + (WEAPONS[id].pierce ? `<i class="up-icon" title="破甲">${icon("pierce")}</i>` : "");

// ——— 棋盘高亮与情报卡 ———

/**
 * 自动寻路。只走已探索的格子，只绕开玩家看得见的怪物（迷雾里的怪物会被撞上，触发战斗）。
 * 目标是宝箱或药水时，走到它旁边为止。
 */
function findPath(target, { ignoreMonsters = false } = {}) {
  const start = key(board.hero.r, board.hero.c);
  const goal = key(target.r, target.c);
  const goalItem = board.items.get(goal);
  const pickupGoal = Boolean(goalItem && NEARBY_PICKUP.has(goalItem.type) && !goalItem.opened);
  const prev = new Map([[start, null]]);
  const queue = [{ r: board.hero.r, c: board.hero.c }];
  while (queue.length) {
    const cur = queue.shift();
    const k = key(cur.r, cur.c);
    if (k === goal) {
      const path = [];
      let step = k;
      while (step !== start) {
        const [r, c] = step.split(",").map(Number);
        path.unshift({ r, c });
        step = prev.get(step);
      }
      return pickupGoal ? path.slice(0, -1) : path;
    }
    for (const [dr, dc] of ORTHO) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      const nk = key(nr, nc);
      if (prev.has(nk) || !isExplored(board, nr, nc)) continue;
      const isGoal = nk === goal;
      const seen = visibleMonsterAt(board, nr, nc);
      if (!(isGoal && (seen || pickupGoal))) {
        if (!heroCanEnter(board, nr, nc).ok) continue;
        if (!ignoreMonsters && seen) continue;
      }
      prev.set(nk, k);
      queue.push({ r: nr, c: nc });
    }
  }
  return null;
}

function refreshMarks() {
  if (!board) return;
  const marks = new Map();
  if (playing && !busy) {
    for (const [dr, dc] of ORTHO) {
      const r = board.hero.r + dr;
      const c = board.hero.c + dc;
      if (visibleMonsterAt(board, r, c)) marks.set(key(r, c), "attack");
      else if (pickableAt(board, r, c) || heroCanEnter(board, r, c).ok) marks.set(key(r, c), "move");
    }
  }
  if (hoverTile) {
    const m = visibleMonsterAt(board, hoverTile.r, hoverTile.c);
    if (m) for (const t of threatTiles(board, m)) if (!marks.has(key(t.r, t.c))) marks.set(key(t.r, t.c), "threat");
    if (playing && !busy && !isAdjacent(board.hero, hoverTile)) {
      const path = findPath(hoverTile);
      if (path) path.forEach((p, i) => marks.set(key(p.r, p.c), i === path.length - 1 && m ? "attack" : "path"));
    }
    if (!marks.has(key(hoverTile.r, hoverTile.c)) && isExplored(board, hoverTile.r, hoverTile.c))
      marks.set(key(hoverTile.r, hoverTile.c), "hover");
  }
  world.setMarks(marks);
}

function showItemTip(item, event) {
  const tip = $("#tooltip");
  const w = WEAPONS[item.weapon];
  const text =
    item.type === "chest"
      ? ["宝箱", w ? `<span class="inline-shape">${shapeSvg(w.shape, { cell: 7, gap: 1.5 })}</span>${w.name}` : ""]
      : ["红心药水", POTION.desc];
  tip.innerHTML = `<div class="tip-head tip-item"><span class="tip-icon">${icon(item.type === "chest" ? "chest" : "potion")}</span><div><b>${text[0]}</b><small>${text[1]}</small></div></div>`;
  tip.hidden = false;
  const x = Math.min(event.clientX + 18, innerWidth - tip.offsetWidth - 12);
  const y = Math.min(event.clientY + 18, innerHeight - tip.offsetHeight - 12);
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

function showTooltip(monster, event) {
  const tip = $("#tooltip");
  if (!monster || !event) {
    tip.hidden = true;
    return;
  }
  const def = monster.def;
  const { hearts, slots, armor } = countHearts(monster.matrix);
  if (def.boss) {
    // Boss 的情报隐藏：只显示名字。
    tip.innerHTML = `<div class="tip-head"><span class="avatar-sm ${def.model}">${GLYPH[def.model]}</span><div><b>${def.name}</b><small>${def.title}</small></div><span class="tip-hp"><span class="num">?</span></span></div><p class="tip-foot t-meta">情报不明</p>`;
    tip.hidden = false;
    const x = Math.min(event.clientX + 18, innerWidth - tip.offsetWidth - 12);
    const y = Math.min(event.clientY + 18, innerHeight - tip.offsetHeight - 12);
    tip.style.transform = `translate(${x}px, ${y}px)`;
    return;
  }
  tip.innerHTML = `
    <div class="tip-head"><span class="avatar-sm ${def.model}">${GLYPH[def.model]}</span><div><b>${def.name}</b><small>${def.title}</small></div><span class="tip-hp"><span class="num">${hearts}</span><span class="of">/${slots}</span></span></div>
    <div class="tip-body">
      <div class="tip-matrix">${matrixSvg(monster.matrix, { cell: 13, gap: 2.5 })}<span class="t-meta">${armor ? `ARMOR ${armor}` : "HP MATRIX"}</span></div>
      <ul>${def.pattern
        .map((p) => `<li>${p.kind === "attack" ? shapeSvg(p.shape, { cell: 7, gap: 1.5, tone: "enemy", pivot: false }) : '<i class="dot"></i>'}<span><b>${p.name}</b> ${INTENT_TEXT[p.kind](p)}</span></li>`)
        .join("")}</ul>
    </div>
    <p class="tip-foot t-meta">${MOVE_TEXT[def.moves]} · ${AI_TEXT[monster.ai]}${monster.sight ? ` · 视野 ${monster.sight} 格` : ""}${monster.stun ? " · 晕眩中" : ""}</p>`;
  tip.hidden = false;
  const x = Math.min(event.clientX + 18, innerWidth - tip.offsetWidth - 12);
  const y = Math.min(event.clientY + 18, innerHeight - tip.offsetHeight - 12);
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

world.on("hover", (r, c, event) => {
  const same = hoverTile && r === hoverTile.r && c === hoverTile.c;
  hoverTile = r === null ? null : { r, c };
  const m = board && hoverTile ? visibleMonsterAt(board, r, c) : null;
  const item = board && hoverTile && !m && isExplored(board, r, c) ? pickableAt(board, r, c) : null;
  if (item && !screenName) showItemTip(item, event);
  else showTooltip(screenName ? null : m, event);
  document.body.style.cursor = hoverTile && playing ? "pointer" : "";
  if (!same) refreshMarks();
});

world.on("click", (r, c) => {
  if (!playing || busy || screenName) return;
  sfx.unlock();
  if (isAdjacent(board.hero, { r, c }) && !pickableAt(board, r, c)) {
    walkToken += 1;
    step(r, c);
    return;
  }
  if (!isExplored(board, r, c)) {
    sfx.play("bump");
    toast("雾里看不清");
    return;
  }
  if (pickableAt(board, r, c)) {
    walkToken += 1;
    if (isAdjacent(board.hero, { r, c })) {
      interact(r, c);
      return;
    }
    const route = findPath({ r, c });
    if (!route) {
      sfx.play("bump");
      toast("无法到达");
      return;
    }
    autoWalk(route).then((arrived) => {
      if (arrived && isAdjacent(board.hero, { r, c })) interact(r, c);
    });
    return;
  }
  const path = findPath({ r, c });
  if (path && !path.length) return;
  if (!path) {
    sfx.play("bump");
    toast(findPath({ r, c }, { ignoreMonsters: true }) ? "路线被怪物阻挡" : "无法到达");
    return;
  }
  autoWalk(path);
});

// ——— 回合流程 ———

/** 沿路径逐格行走；中途被事件打断时返回 false。 */
async function autoWalk(path) {
  const token = ++walkToken;
  for (const p of path) {
    if (token !== walkToken || !playing) return false;
    const outcome = await step(p.r, p.c);
    if (outcome !== "moved") return false;
  }
  return token === walkToken;
}

/** 主动拾取相邻的宝箱或药水（不消耗回合）。 */
async function interact(r, c) {
  if (busy || !playing) return;
  const result = pickupAt(board, r, c);
  if (!result.ok) {
    sfx.play("bump");
    toast(result.reason);
    return;
  }
  busy = true;
  showTooltip(null);
  try {
    await world.faceToward(world.hero, world.items.get(key(r, c))?.position ?? world.hero.position);
    for (const event of result.events) {
      if (event.type === "forge") {
        await explain(["forge"]);
        showForge(event.item);
      } else {
        await pickup(event.item);
        if (event.item.type === "chest" && board.hero.weapons.length > board.hero.slots)
          await explain(["slots"], { slots: board.hero.slots });
      }
    }
  } finally {
    busy = false;
    renderHud();
    refreshMarks();
  }
}

/** 铁砧：随机给出三项强化，玩家选一项；也可以暂不强化，稍后再来。 */
function showForge(item) {
  item.options ??= createForgeOptions(board.hero, Math.random);
  if (!item.options.length) {
    toast("所有武器都已强化完毕");
    return;
  }
  playing = false;
  const draw = () => {
    showScreen(
      "forge",
      `<div class="panel forge">
        <header class="panel-head"><div>${kicker(icon("anvil"), "铁砧", "FORGE")}<h2>挑一项强化</h2></div><button class="icon-btn" data-cmd="back" aria-label="暂不强化">${icon("close")}</button></header>
        <div class="forge-grid">${item.options
          .map((opt, i) => {
            const w = WEAPONS[opt.weapon];
            const { before, after } = upgradePreview(opt, board.hero.upgrades);
            const equipped = board.hero.equipped.includes(opt.weapon);
            return `<div class="forge-slot">
              <button class="forge-card" data-upgrade="${i}">
                <span class="t-meta forge-weapon">${w.name}${equipped ? "" : `<i class="in-bag" title="在背包里">${icon("bag")}</i>`}</span>
                <b>${icon(UPGRADE_TEXT[opt.kind].icon)}${UPGRADE_TEXT[opt.kind].name}</b>
                <span class="forge-shapes"><span>${shapeSvg(before, { cell: 14, gap: 3 })}</span><i aria-hidden="true">→</i><span>${shapeSvg(after, { cell: 14, gap: 3 })}</span></span>
                <small>${UPGRADE_TEXT[opt.kind].desc}</small>
              </button>
              <button class="reroll" data-reroll="${i}" ${opt.rerolled ? "disabled" : ""}>${icon("restart")}${opt.rerolled ? "已重抽" : "重抽"}</button>
            </div>`;
          })
          .join("")}</div>
        <div class="panel-actions"><button class="ghost" data-cmd="back">暂不强化</button></div>
      </div>`,
    );
    screenBack = () => {
      hideScreen();
      playing = true;
      refreshMarks();
    };
    document.querySelectorAll("[data-reroll]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const result = rerollForgeOption(board.hero, item.options, Number(btn.dataset.reroll), Math.random);
        if (!result.ok) {
          sfx.play("invalid");
          toast(result.reason);
          return;
        }
        sfx.play("click");
        draw();
      }),
    );
    document.querySelectorAll("[data-upgrade]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const opt = item.options[Number(btn.dataset.upgrade)];
        applyUpgrade(board.hero, opt);
        useForge(board, item.r, item.c);
        world.useForge(item.r, item.c);
        sfx.play("chest");
        toast(`${icon(UPGRADE_TEXT[opt.kind].icon)}<b>${WEAPONS[opt.weapon].name}</b> ${UPGRADE_TEXT[opt.kind].name}`, "gold");
        hideScreen();
        playing = true;
        renderHud();
        refreshMarks();
      }),
    );
  };
  draw();
}

/**
 * 构筑：左边是出战的武器槽与技能槽，右边是背包。点卡片就在两侧之间移动；
 * 槽位满了时，先点背包里的卡片，再点左边要换下的那一张。
 */
function showArmory() {
  if (!board || busy || screenName || document.body.classList.contains("in-battle") || !document.body.classList.contains("in-level")) return;
  const was = playing;
  playing = false;
  const hero = board.hero;
  let pending = null; // { kind: "weapon" | "skill", id }

  const weaponCard = (id, side) => {
    const w = WEAPONS[id];
    const picked = pending?.kind === "weapon" && pending.id === id;
    return `<button class="build-card ${side} ${picked ? "picked" : ""}" data-kind="weapon" data-id="${id}" title="${w.desc}">
      <span class="build-shape">${shapeSvg(weaponShape(id, hero.upgrades), { cell: 11, gap: 2 })}</span>
      <span class="build-text"><b>${w.name}${upIcons(id, hero.upgrades)}</b><small>${w.desc}</small></span>
      <span class="build-meta">${cdMark(w.cooldown)}</span>
      <span class="build-move" aria-hidden="true">${side === "on" ? "→" : pending?.kind === "weapon" && !picked ? "" : "←"}</span>
    </button>`;
  };
  const skillCard = (id, side) => {
    const sk = SKILLS[id];
    const picked = pending?.kind === "skill" && pending.id === id;
    return `<button class="build-card skill ${side} ${picked ? "picked" : ""}" data-kind="skill" data-id="${id}" title="${sk.desc}">
      <span class="build-shape">${shapeSvg(sk.shape, { cell: 11, gap: 2, tone: "skill" })}</span>
      <span class="build-text"><b>${sk.name}</b><small>${sk.desc}</small></span>
      <span class="build-meta">${icon("skill")}×${hero.skills[id]}</span>
      <span class="build-move" aria-hidden="true">${side === "on" ? "→" : "←"}</span>
    </button>`;
  };
  const emptySlot = (kind) => `<div class="build-card empty ${kind}">${icon(kind === "skill" ? "skill" : "sword")}</div>`;

  const draw = () => {
    const bagWeapons = hero.weapons.filter((id) => !hero.equipped.includes(id));
    const ownedSkills = Object.keys(hero.skills);
    const bagSkills = ownedSkills.filter((id) => !hero.equippedSkills.includes(id));
    const weaponSlots = Array.from({ length: hero.slots }, (_, i) => (hero.equipped[i] ? weaponCard(hero.equipped[i], "on") : emptySlot("weapon"))).join("");
    const skillSlots = Array.from({ length: SKILL_SLOTS }, (_, i) => (hero.equippedSkills[i] ? skillCard(hero.equippedSkills[i], "on") : emptySlot("skill"))).join("");
    showScreen(
      "armory",
      `<div class="panel armory ${pending ? `swapping swap-${pending.kind}` : ""}">
        <header class="panel-head"><div>${kicker(icon("bag"), "构筑", "LOADOUT")}<h2>构筑</h2></div><button class="icon-btn" data-cmd="back" aria-label="完成">${icon("close")}</button></header>
        <div class="loadout">
          <section class="loadout-col">
            <h4 class="build-title">${kw("武器槽")}${slotPips(hero.equipped.length, hero.slots)}</h4>
            <div class="build-list">${weaponSlots}</div>
            ${ownedSkills.length ? `<h4 class="build-title">${kw("技能")}${slotPips(hero.equippedSkills.length, SKILL_SLOTS, "skill")}</h4><div class="build-list">${skillSlots}</div>` : ""}
          </section>
          <div class="loadout-rule" aria-hidden="true"><span>⇄</span></div>
          <section class="loadout-col bag">
            <h4 class="build-title">${kw("背包")}<em class="t-meta">${bagWeapons.length + bagSkills.length}</em></h4>
            <div class="build-list">${bagWeapons.map((id) => weaponCard(id, "off")).join("") || '<div class="build-card empty bag"></div>'}</div>
            ${bagSkills.length ? `<h4 class="build-title">${kw("技能")}</h4><div class="build-list">${bagSkills.map((id) => skillCard(id, "off")).join("")}</div>` : ""}
          </section>
        </div>
        <div class="panel-actions"><button class="primary" data-cmd="back">完成<span aria-hidden="true">→</span></button></div>
      </div>`,
      { wide: true },
    );
    screenBack = () => {
      hideScreen();
      playing = was;
      renderHud();
      refreshMarks();
    };
    document.querySelectorAll(".armory [data-kind]").forEach((btn) => btn.addEventListener("click", () => pick(btn.dataset.kind, btn.dataset.id)));
  };

  const done = (result) => {
    if (!result.ok) {
      sfx.play("invalid");
      toast(result.reason);
    } else sfx.play("click");
    draw();
  };

  function pick(kind, id) {
    const equippedList = kind === "weapon" ? hero.equipped : hero.equippedSkills;
    const cap = kind === "weapon" ? hero.slots : SKILL_SLOTS;
    const onSide = equippedList.includes(id);
    if (pending) {
      const p = pending;
      pending = null;
      // 换下：先选了背包里的卡，再点同类的出战卡。
      if (p.kind === kind && onSide) return done(kind === "weapon" ? swapEquip(hero, id, p.id) : swapSkill(hero, id, p.id));
      if (p.kind === kind && p.id === id) return done({ ok: true });
    }
    if (!onSide && equippedList.length >= cap) {
      pending = { kind, id };
      sfx.play("click");
      return draw();
    }
    done(kind === "weapon" ? toggleEquip(hero, id) : toggleSkill(hero, id));
  }
  draw();
}

/** 主角走一步，然后怪物行动。返回 moved / blocked / battle / event / over。 */
async function step(r, c) {
  if (busy || !playing) return "blocked";
  busy = true;
  hoverTile = null;
  refreshMarks();
  showTooltip(null);
  let outcome = "moved";
  const gen = levelGen;
  try {
    const result = heroMove(board, r, c);
    if (result.kind === "blocked") {
      sfx.play("bump");
      const item = pickableAt(board, r, c);
      toast(item ? (item.type === "chest" ? "点一下宝箱就能打开" : "点一下药水就能收下") : result.reason);
      await world.bump({ dr: r - board.hero.r, dc: c - board.hero.c });
      return "blocked";
    }
    if (result.kind === "battle") {
      await battle(result.monster, true);
      return board.over ? "over" : "battle";
    }
    sfx.play("step");
    await world.moveHero(result.events[0].to);
    if (gen !== levelGen) return "over";
    world.updateFog(board);
    for (const event of result.events.slice(1)) {
      outcome = "event";
      if (event.type === "pickup") await pickup(event.item);
      if (event.type === "door") {
        sfx.play("door");
        toast(`${icon("key")} 铁栅门已打开`);
        await world.openDoor(event.r, event.c);
      }
      if (event.type === "exit") {
        await levelComplete();
        return "over";
      }
    }
    renderHud();
    const monsters = advanceMonsters(board);
    if (monsters.alerts.length) {
      sfx.play("alert");
      outcome = "event";
      const named = monsters.alerts.filter((m) => isVisible(board, m.r, m.c));
      toast(named.length ? `<b>${named.map((m) => m.def.name).join("、")}</b> 发现了你` : "迷雾中有怪物发现了你", "danger");
    }
    await Promise.all(monsters.moves.map((mv) => world.moveMonster(mv.monster, mv.to)));
    if (gen !== levelGen) return "over";
    world.updateFog(board);
    board.monsters.forEach((m) => world.updateMonster(m));
    if (monsters.ambush) {
      const m = monsters.ambush;
      toast(`<b>${m.def.name}</b> 发起突袭`, "danger");
      await world.lunge(world.monsters.get(m.uid).group, world.hero.position);
      await battle(m, false);
      return board.over ? "over" : "battle";
    }
    return outcome;
  } finally {
    if (gen === levelGen) {
      busy = false;
      renderHud();
      refreshMarks();
    }
  }
}

async function pickup(item) {
  if (item.type === "potion") {
    sfx.play("pickup");
    toast(`${icon("potion")} 获得 <b>红心药水</b>`);
  } else if (item.type === "key") {
    sfx.play("pickup");
    toast(`${icon("key")} 获得 <b>钥匙</b>`);
  } else if (item.type === "chest") {
    sfx.play("chest");
    const w = WEAPONS[item.weapon];
    toast(`<span class="toast-shape">${shapeSvg(w.shape, { cell: 10 })}</span>获得新武器 <b>${w.name}</b>`, "gold");
  }
  await world.collectItem(item.r, item.c);
}

async function battle(monster, heroFirst) {
  walkToken += 1;
  sfx.play("battle");
  const monsterObj = world.monsters.get(monster.uid).group;
  monsterObj.visible = true;
  world.saveView();
  world.faceToward(world.hero, monsterObj.position);
  world.faceToward(monsterObj, world.hero.position);
  await world.focusOn(world.hero.position, monsterObj.position);
  const combat = createCombat({ hero: board.hero, monster, heroFirst });
  currentCombat = combat;
  document.body.classList.add("in-battle");
  const topics = ["battle-matrix", "battle-shape", "battle-intent", "battle-combo"];
  if (monster.matrix.some((row) => row.some((v) => v >= 2))) topics.push("armor");
  await runBattle({ root: $("#battle-root"), combat, monster, world, sfx, heroFirst, coach: () => explain(topics) });
  document.body.classList.remove("in-battle");
  currentCombat = null;
  const events = resolveBattle(board, monster, combat, heroFirst);
  const restore = world.restoreView();
  for (const event of events) {
    if (event.type === "defeat") await world.defeatMonster(event.monster);
    if (event.type === "drop") toast(`${event.monster.def.name}掉落了 <b>红心药水</b>`, "gold");
    if (event.type === "exit-open") {
      world.setExitOpen(true);
      sfx.play("win");
      toast("封印解除，出口已开启", "gold");
    }
    if (event.type === "move") await world.moveHero(event.to);
    if (event.type === "pickup") await pickup(event.item);
  }
  await restore;
  world.updateFog(board);
  if (combat.phase === "fled") world.updateMonster(monster);
  renderHud();
  if (combat.phase === "lost") gameOver();
}

// ——— 关卡与界面 ———

function startLevel(index, { intro = true } = {}) {
  walkToken += 1;
  levelGen += 1;
  levelIndex = index;
  const level = LEVELS[index];
  board = createBoard(level, {
    weapons: weaponsForLevel(index, STARTING_WEAPONS),
    // 武器强化会带进后面的章节；技能次数每章开始时恢复。
    upgrades: progress.loadouts?.[index]?.upgrades ?? {},
    equipped: progress.loadouts?.[index]?.equipped ?? [],
    equippedSkills: progress.loadouts?.[index]?.equippedSkills ?? [],
    skills: skillsForLevel(index, SKILLS),
  });
  world.loadLevel(board);
  world.controls.autoRotate = false;
  world.setScreenShift(0);
  playing = false;
  busy = false;
  renderHud();
  refreshMarks();
  document.body.classList.add("in-level");
  if (intro) showIntro();
  else begin();
}

async function begin() {
  hideScreen();
  const level = board.level;
  const has = (ch) => level.map.some((row) => row.includes(ch));
  const topics = [];
  if (level.tutorial) topics.push("move");
  if (has("H") || has("P")) topics.push("chest");
  if (levelIndex > 0 && level.slots > LEVELS[levelIndex - 1].slots) topics.push({ id: `slots-${level.slots}`, topic: TOPICS_SLOTS_UP });
  if (has("K")) topics.push("key-door");
  if (level.monsters.some((m) => m.ai === "chase")) topics.push("ambush");
  if (level.skill) topics.push("skills", { id: `skill-${level.skill}`, topic: skillTopic(level.skill) });
  if (level.fog) topics.push("fog");
  if (level.monsters.some((m) => MONSTERS[m.type].boss)) topics.push("boss");
  await explain(topics, { slots: level.slots });
  playing = true;
  refreshMarks();
}

function showScreen(name, html, { back = null, wide = false } = {}) {
  screenName = name;
  screenBack = back;
  const el = $("#screen");
  el.hidden = false;
  el.className = `screen screen-${name} ${wide ? "wide" : ""}`;
  el.innerHTML = html;
  requestAnimationFrame(() => {
    if (screenName === name) el.classList.add("open");
  });
  $("#tooltip").hidden = true;
}

function hideScreen() {
  screenName = null;
  screenBack = null;
  const el = $("#screen");
  el.className = "screen";
  el.hidden = true;
  el.innerHTML = "";
}

/** 评分用直角小方块表示（瑞士风不用圆润的星形）。 */
function stars(n, total = 3) {
  return `<span class="stars" aria-label="${n} / ${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
}

const foeGlyphs = (level) =>
  [...new Set(level.monsters.map((m) => m.type))]
    .map((k) => `<i class="avatar-sm ${MONSTERS[k].model}" title="${MONSTERS[k].name}">${GLYPH[MONSTERS[k].model]}</i>`)
    .join("");

function showTitle() {
  document.body.classList.remove("in-level");
  playing = false;
  if (!board) {
    board = createBoard(LEVELS[0], { weapons: STARTING_WEAPONS });
    world.loadLevel(board);
  }
  world.controls.autoRotate = true;
  world.controls.autoRotateSpeed = 0.6;
  world.setScreenShift(0.25);
  const continueIndex = Math.min(progress.unlocked, LEVELS.length) - 1;
  const earned = LEVELS.reduce((sum, l) => sum + (progress.stars[l.id] ?? 0), 0);
  showScreen(
    "title",
    `<div class="title-card">
      <div class="dot-mat" aria-hidden="true"></div>
      <div class="t-meta title-chrome"><span>YUYU'S ADVENTURE</span></div>
      <h1>心阵<br>棋局</h1>
      <p class="subtitle t-meta">HEART GAMBIT / A TURN-BASED BOARD GAME</p>
      <p class="lede">墨水瓶打翻在棋盘上，被墨迹侵蚀的黑棋变成了怪物。白色小兵屿屿要穿过八个章节，找到墨迹的源头。</p>
      <div class="title-actions">
        <button class="primary" data-cmd="continue">${progress.unlocked > 1 ? `继续冒险 · 第 ${continueIndex} 章` : "开始冒险"}<span aria-hidden="true">→</span></button>
        <button class="ghost" data-cmd="levels">选择关卡</button>
        <button class="ghost" data-cmd="help">玩法说明</button>
      </div>
      <dl class="title-specs">
        <div><dt class="t-meta">Chapters</dt><dd>${pad(LEVELS.length - 1)}</dd></div>
        <div><dt class="t-meta">Weapons</dt><dd>07</dd></div>
        <div><dt class="t-meta">Board</dt><dd>8×8</dd></div>
        <div><dt class="t-meta">Stars</dt><dd>${pad(earned)}<small>/${LEVELS.length * 3}</small></dd></div>
      </dl>
    </div>`,
  );
}

function showLevels() {
  const back = board && document.body.classList.contains("in-level") ? "resume" : "title";
  const was = playing;
  playing = false;
  showScreen(
    "levels",
    `<div class="panel">
      <header class="panel-head"><div>${kicker("05", "章节", "CHAPTERS")}<h2>选择章节</h2></div><button class="icon-btn" data-cmd="back" aria-label="返回">${icon("close")}</button></header>
      <div class="level-grid">${LEVELS.map((level, i) => {
        const locked = i >= progress.unlocked;
        return `<button class="level-card ${locked ? "locked" : ""}" data-level="${i}" ${locked ? "disabled" : ""}>
          <span class="level-no">${pad(level.id)}</span>
          <b>${level.name}</b><em class="t-meta">${level.english}</em>
          <span class="level-foes">${foeGlyphs(level)}</span>
          ${locked ? `<span class="lock t-meta">${icon("lock")} Locked</span>` : stars(progress.stars[level.id] ?? 0)}
        </button>`;
      }).join("")}</div>
    </div>`,
    { back, wide: true },
  );
  screenBack = back === "resume" ? () => ((playing = was), hideScreen(), refreshMarks()) : showTitle;
}

function showIntro() {
  const level = board.level;
  const prevChest = levelIndex > 0 && LEVELS[levelIndex - 1].chest ? WEAPONS[LEVELS[levelIndex - 1].chest] : null;
  const newSkill = level.skill ? SKILLS[level.skill] : null;
  const hasForge = level.map.some((row) => row.includes("U"));
  const kinds = [...new Set(level.monsters.map((m) => m.type))];
  const hero = level.hero;
  showScreen(
    "intro",
    `<div class="panel intro">
      <div class="intro-head">
        <span class="num-mega">${pad(level.id)}</span>
        <div>
          <p class="t-meta">Chapter ${pad(level.id)} / ${level.english}</p>
          <h2>${level.name}</h2>
          <p class="story">${level.story}</p>
        </div>
      </div>
      <div class="intro-grid">
        <div><h4 class="t-meta">Objective · 目标</h4><p>${rich(level.goalText)}</p></div>
        <div><h4 class="t-meta">Hearts · 红心矩阵</h4><p><span class="big">${hero.rows}×${hero.cols}</span>${kw(`${hero.rows * hero.cols}`, "红心")} ${kw(`×${level.potions}`, "药水")}</p></div>
        <div><h4 class="t-meta">Hostiles · 敌人</h4><p class="foes">${kinds.map((k) => `<span><i class="avatar-sm ${MONSTERS[k].model}">${GLYPH[MONSTERS[k].model]}</i>${MONSTERS[k].name}</span>`).join("")}</p></div>
        ${prevChest ? `<div><h4 class="t-meta">New weapon · 新武器</h4><p><span class="inline-shape">${shapeSvg(prevChest.shape, { cell: 9 })}</span>${prevChest.name}<br>${prevChest.desc}</p></div>` : levelIndex === 0 ? `<div><h4 class="t-meta">Arsenal · 武器</h4><p>短剑、L 钩镰</p></div>` : ""}
        ${newSkill ? `<div><h4 class="t-meta">New skill · 新技能</h4><p><span class="inline-shape">${shapeSvg(newSkill.shape, { cell: 9, tone: "skill" })}</span>${newSkill.name}<br>${newSkill.desc}<br>${kw(`每章 ×${newSkill.charges}`, "技能")}</p></div>` : ""}
        ${hasForge ? `<div><h4 class="t-meta">Forge · 铁砧</h4><p>${kw("铁砧 ×1", "铁砧")}</p></div>` : ""}
      </div>
      <p class="tip"><span class="t-meta">Note</span>${rich(level.tip)}</p>
      <div class="panel-actions"><button class="primary" data-cmd="begin">${level.tutorial ? "开始序章" : `开始第 ${level.id} 章`}<span aria-hidden="true">→</span></button></div>
    </div>`,
    { back: null },
  );
}

async function levelComplete() {
  playing = false;
  sfx.play("win");
  const level = board.level;
  const { hearts, slots } = countHearts(board.hero.matrix);
  const healthy = hearts / slots >= 0.5;
  const fast = board.turn <= level.par;
  const earned = 1 + (healthy ? 1 : 0) + (fast ? 1 : 0);
  progress.stars[level.id] = Math.max(progress.stars[level.id] ?? 0, earned);
  progress.unlocked = Math.max(progress.unlocked, Math.min(levelIndex + 2, LEVELS.length));
  progress.loadouts = {
    ...(progress.loadouts ?? {}),
    [levelIndex + 1]: JSON.parse(
      JSON.stringify({ upgrades: board.hero.upgrades, equipped: board.hero.equipped, equippedSkills: board.hero.equippedSkills }),
    ),
  };
  const last = levelIndex === LEVELS.length - 1;
  if (last) progress.cleared = true;
  saveProgress();
  await world.wait(500);
  if (last) return showEnding(earned);
  showScreen(
    "complete",
    `<div class="panel result">
      <p class="t-meta">Chapter ${pad(level.id)} / Complete</p>
      <h2>${level.name}</h2>
      ${stars(earned)}
      <div class="stat-row">
        <div class="stat"><span class="t-meta">Turns</span><b>${pad(board.turn)}</b><small>目标 ${level.par}</small></div>
        <div class="stat"><span class="t-meta">Hearts</span><b>${hearts}</b><small>/ ${slots}</small></div>
        <div class="stat"><span class="t-meta">Battles</span><b>${pad(board.stats.battles)}</b><small>撤退 ${board.stats.retreats}</small></div>
      </div>
      <ul class="criteria">
        <li class="on"><i></i>抵达出口</li>
        <li class="${healthy ? "on" : ""}"><i></i>剩余红心不少于一半</li>
        <li class="${fast ? "on" : ""}"><i></i>${level.par} 回合内完成</li>
      </ul>
      <div class="panel-actions">
        <button class="ghost" data-cmd="replay">再玩一次</button>
        <button class="primary" data-cmd="next">下一章 · ${LEVELS[levelIndex + 1].name}<span aria-hidden="true">→</span></button>
      </div>
    </div>`,
  );
}

function showEnding(earned) {
  const total = LEVELS.reduce((sum, l) => sum + (progress.stars[l.id] ?? 0), 0);
  showScreen(
    "ending",
    `<div class="panel result ending">
      <p class="t-meta">Final chapter / Checkmate</p>
      <h2>将死。</h2>
      ${stars(earned)}
      <p class="story">暗王被击败后，墨迹退回了墨水瓶，黑棋恢复了原样。屿屿回到了第一排。</p>
      <div class="stat-row">
        <div class="stat"><span class="t-meta">Stars</span><b>${pad(total)}</b><small>/ ${LEVELS.length * 3}</small></div>
        <div class="stat"><span class="t-meta">Chapters</span><b>${pad(LEVELS.length - 1)}</b><small>全部完成</small></div>
      </div>
      <div class="panel-actions">
        <button class="ghost" data-cmd="levels">回顾章节</button>
        <button class="primary" data-cmd="title">回到标题<span aria-hidden="true">→</span></button>
      </div>
    </div>`,
  );
}

function gameOver() {
  playing = false;
  showScreen(
    "gameover",
    `<div class="panel result lost">
      <p class="t-meta">Chapter ${pad(board.level.id)} / ${board.level.english}</p>
      <h2>挑战失败</h2>
      <p class="story">${rich("屿屿倒下了。留意怪物的下一招，重击之前举起[木盾]。")}</p>
      <div class="panel-actions">
        <button class="ghost" data-cmd="levels">选择关卡</button>
        <button class="primary" data-cmd="replay">重新挑战<span aria-hidden="true">→</span></button>
      </div>
    </div>`,
  );
}

function demoGrid(hitCells, rows = 4, cols = 4, anchor = [0, 0]) {
  const hit = new Set(hitCells.map(([r, c]) => `${r},${c}`));
  let html = "";
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const on = hit.has(`${r},${c}`);
      html += `<span class="demo-cell ${on ? "hit" : ""} ${r === anchor[0] && c === anchor[1] ? "anchor" : ""}">${heartSvg("heart")}<small>a${r}${c}</small></span>`;
    }
  return `<div class="demo-grid" style="grid-template-columns:repeat(${cols}, 1fr)">${html}</div>`;
}

function showHelp() {
  const was = playing;
  playing = false;
  const hook = WEAPONS.hook;
  showScreen(
    "help",
    `<div class="panel help">
      <header class="panel-head"><div>${kicker("00", "规则", "HOW TO PLAY")}<h2>玩法说明</h2></div><button class="icon-btn" data-cmd="back" aria-label="关闭">${icon("close")}</button></header>
      <div class="help-grid">
        <section>
          <h3><span class="t-meta">01</span>红心矩阵</h3>
          <p>${rich("屿屿和怪物的生命都是一块[红心矩阵]，红心碎光的一方倒下。带黑框的[护甲心]要打两下。")}</p>
          <h3><span class="t-meta">02</span>形状攻击</h3>
          <p>${rich(`每件[武器]有自己的形状，形状盖住的红心就是这一击要打碎的红心。<span class="inline-shape">${shapeSvg(hook.shape, { cell: 9 })}</span> L 钩镰对准 a00，打碎 a00、a01、a10。`)}</p>
          ${demoGrid([[0, 0], [0, 1], [1, 0]])}
        </section>
        <section>
          <h3><span class="t-meta">03</span>战斗</h3>
          <ul class="help-legend">
            <li><span class="legend-glyph"><span class="swatch ink"></span></span><span>墨黑格是怪物下一招要打的地方。</span></li>
            <li><span class="legend-glyph">${icon("shield")}</span><span>${rich("[木盾]挡下一次攻击，举盾不占回合。")}</span></li>
            <li><span class="legend-glyph">${icon("potion")}</span><span>${rich("[药水]补回十字范围的红心。")}</span></li>
            <li><span class="legend-glyph">${icon("cd")}</span><span>${rich("用过的武器要[冷却]几回合。")}</span></li>
            <li><span class="legend-glyph">${icon("run")}</span><span>撤退时挨一次追击，怪物随后晕眩两回合。</span></li>
          </ul>
          <h3><span class="t-meta">04</span>连击</h3>
          <ul class="help-legend">
            <li><span class="legend-glyph">${icon("perfect")}</span><span>${rich("形状每一格都落在红心上，是[完美命中]。")}</span></li>
            <li><span class="legend-glyph">${icon("combo")}</span><span>${rich("接连完美命中形成[连击]，其他武器冷却 −1。")}</span></li>
            <li><span class="legend-glyph">${icon("chase")}</span><span>${rich("每连上两次，[追击]一次。")}</span></li>
          </ul>
          <h3><span class="t-meta">05</span>棋盘</h3>
          <ul class="help-legend">
            <li><span class="legend-glyph">${icon("chest")}</span><span>${rich("站在[宝箱]、[药水]、[铁砧]旁边点一下即可使用。")}</span></li>
            <li><span class="legend-glyph">${icon("bag")}</span><span>${rich("[武器槽]决定带几件武器上阵，[技能]最多带两个。按 B 打开[构筑]。")}</span></li>
            <li><span class="legend-glyph">${icon("fog")}</span><span>${rich("[迷雾]里只看得见屿屿身边的格子。")}</span></li>
          </ul>
          <h3><span class="t-meta">06</span>按键</h3>
          <p class="keys"><span><kbd>WASD</kbd>移动</span><span><kbd>C</kbd>转动视角</span><span><kbd>B</kbd>构筑</span><span><kbd>P</kbd>喝药水</span><span><kbd>1</kbd>~<kbd>7</kbd>选武器</span><span><kbd>R</kbd>旋转</span><span><kbd>F</kbd>镜像</span><span><kbd>Q</kbd>木盾</span><span><kbd>E</kbd>药水</span><span><kbd>Z</kbd>等待</span></p>
          <div class="panel-actions"><button class="ghost" data-cmd="hints">新手提示 · ${progress.hints === false ? "关" : "开"}</button></div>
        </section>
      </div>
    </div>`,
    { wide: true },
  );
  screenBack = () => {
    if (document.body.classList.contains("in-level")) {
      hideScreen();
      playing = was;
      refreshMarks();
    } else showTitle();
  };
}

/** 棋盘上喝药水：不消耗回合，在自己的心阵上选择十字落点。 */
function showFieldHeal() {
  if (!playing || busy || board.hero.potions <= 0) return;
  playing = false;
  showScreen(
    "heal",
    `<div class="panel heal-panel">
      <header class="panel-head"><div>${kicker("P", "治疗", "POTION", `<em>${board.hero.potions}</em>`)}<h2>红心药水</h2></div><button class="icon-btn" data-cmd="back" aria-label="关闭">${icon("close")}</button></header>
      <p class="body">点一处，补回 <span class="inline-shape">${shapeSvg(POTION.shape, { cell: 9, tone: "heal" })}</span> 十字范围的红心。</p>
      <div class="heal-matrix"><div id="heal-matrix"></div></div>
    </div>`,
  );
  const view = new MatrixView($("#heal-matrix"), { margin: 1, maxSize: 300, side: "hero" });
  view.set(board.hero.matrix);
  view.onHover = (r, c) => {
    const heals = resolveHeal(board.hero.matrix, POTION.shape, r, c);
    view.preview(POTION.shape, r, c, heals, { tone: "heal", valid: heals.length > 0 });
  };
  view.onLeave = () => view.clearPreview();
  view.onPick = async (r, c) => {
    const heals = resolveHeal(board.hero.matrix, POTION.shape, r, c);
    if (!heals.length) {
      sfx.play("invalid");
      return;
    }
    board.hero.matrix = applyChanges(board.hero.matrix, heals);
    board.hero.potions -= 1;
    sfx.play("heal");
    view.clearPreview();
    await view.animate(heals, "heal", board.hero.matrix);
    renderHud();
    hideScreen();
    playing = true;
    refreshMarks();
  };
  screenBack = () => {
    hideScreen();
    playing = true;
    refreshMarks();
  };
}

// ——— 命令与输入 ———

const commands = {
  continue: () => startLevel(Math.min(progress.unlocked, LEVELS.length) - 1),
  levels: showLevels,
  armory: showArmory,
  hints: () => {
    progress.hints = progress.hints === false;
    saveProgress();
    const btn = document.querySelector("[data-cmd=hints]");
    if (btn) btn.textContent = `新手提示 · ${progress.hints ? "开" : "关"}`;
  },
  help: showHelp,
  begin,
  back: () => (screenBack ? screenBack() : hideScreen()),
  title: showTitle,
  replay: () => startLevel(levelIndex),
  next: () => startLevel(levelIndex + 1),
  restart: () => {
    if (!document.body.classList.contains("in-level") || busy) return;
    startLevel(levelIndex, { intro: false });
    toast("已重新开始本关");
  },
  rotate: () => world.rotateView(),
  potion: showFieldHeal,
  sound: () => {
    sfx.enabled = !sfx.enabled;
    $("#sound-btn").innerHTML = icon(sfx.enabled ? "sound" : "mute");
    if (sfx.enabled) sfx.play("click");
  },
};

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cmd]");
  if (btn && !btn.disabled) {
    sfx.unlock();
    if (btn.closest(".screen") || btn.closest(".topbar") || btn.closest(".hud")) sfx.play("click");
    commands[btn.dataset.cmd]?.();
    return;
  }
  const card = e.target.closest("[data-level]");
  if (card && !card.disabled) {
    sfx.play("click");
    startLevel(Number(card.dataset.level));
  }
});

function moveDir(name) {
  if (!playing || busy || screenName) return;
  const { up, right } = world.screenDirections();
  const d = { up, down: { dr: -up.dr, dc: -up.dc }, right, left: { dr: -right.dr, dc: -right.dc } }[name];
  walkToken += 1;
  step(board.hero.r + d.dr, board.hero.c + d.dc);
}

$("#dpad").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-dir]");
  if (btn) {
    sfx.unlock();
    moveDir(btn.dataset.dir);
  }
});

const KEY_DIRS = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };

document.addEventListener("keydown", (e) => {
  if (document.body.classList.contains("in-battle")) return;
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (screenName) {
    if (k === "escape" && screenBack) commands.back();
    if ((k === "enter" || k === " ") && screenName === "intro") {
      e.preventDefault();
      begin();
    }
    return;
  }
  if (KEY_DIRS[k]) {
    e.preventDefault();
    moveDir(KEY_DIRS[k]);
  } else if (k === "c") commands.rotate();
  else if (k === "h") showHelp();
  else if (k === "r") commands.restart();
  else if (k === "p") showFieldHeal();
  else if (k === "b") showArmory();
  else if (k === "escape") showLevels();
});

// 调试与自动化测试用的只读入口。
window.__heartGambit = {
  get board() {
    return board;
  },
  get busy() {
    return busy;
  },
  get playing() {
    return playing;
  },
  get combat() {
    return currentCombat;
  },
  startLevel,
  world,
};

// 网页字体加载完成后重绘 3D 铭牌，让 Canvas 里的数字也用上 Inter。
document.fonts?.ready.then(() => board?.monsters.forEach((m) => world.updateMonster(m)));

showTitle();
