import "./style.css";
// 手机竖屏的专用样式，必须在 style.css 之后加载才能覆盖。
import "./phone.css";
import { BoardWorld } from "./render/world.js";
import { Sfx } from "./audio.js";
import { LEVELS, LEGACY_ORDER, weaponsForLevel, skillsForLevel } from "./data/levels.js";
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
  weaponCooldown,
  sanitizeUpgrades,
  UPGRADE_TEXT,
  SKILL_SLOTS,
} from "./logic/arsenal.js";
import { createCoach, skillTopic, TOPICS } from "./ui/coach.js";
import { rich, kw } from "./ui/keywords.js";
import { getHeroName, setHeroName, validateName } from "./data/heroName.js";
import { featuresAt } from "./data/features.js";
import { isTouch } from "./ui/device.js";
import { nameEntryHtml, bindNameEntry } from "./ui/nameEntry.js";

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
  PLATE_SHAPE,
  previewPlate,
  armorHero,
} from "./logic/board.js";
import { createCombat, ENERGY_COST, CHASE_EVERY } from "./logic/combat.js";
import { countHearts, resolveHeal, applyChanges } from "./logic/shapes.js";
import { runBattle, GLYPH, MOVE_TEXT, traitChips } from "./ui/battleView.js";
import { MatrixView } from "./ui/matrixView.js";
import { SPRITE, icon, shapeSvg, matrixSvg, heartSvg } from "./ui/icons.js";

// v3：新增序章；每章开始时的构筑（强化、装备的武器与技能）一起保存；记录看过的新机制说明。
const STORAGE_KEY = "heart-gambit-progress-v3";
const AI_TEXT = { static: "原地驻守", patrol: "往返巡逻", chase: "发现后追击" };

/**
 * 进度按章节的 key 记录（插入新章节不会错位）。
 * profile：跨章节的构筑存档（拥有的武器与技能、强化、出战配置、已解锁的武器槽）。
 * 每通过一章更新一次；重玩旧章节时照样使用它，不会因为回到前面而变弱。
 * forged：{ 章节 key: 用过的铁砧坐标 "r,c" 列表 }，重玩时这些铁砧不能再用。
 */
const PROGRESS_VERSION = 4;
const EMPTY_PROGRESS = { v: PROGRESS_VERSION, unlocked: 1, stars: {}, profile: null, forged: {}, seen: [], hints: true, name: "" };

function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && typeof data.unlocked === "number") return migrate({ ...EMPTY_PROGRESS, v: data.v ?? 3, ...data });
  } catch {
    /* 隐私模式或存储被禁用时退回到本次会话 */
  }
  return { ...EMPTY_PROGRESS };
}

const indexOfKey = (key) => LEVELS.findIndex((l) => l.key === key);

/** 一章里全部铁砧的坐标。 */
const forgeKeys = (level) =>
  level.map.flatMap((line, r) => [...line.replace(/\s+/g, "")].map((ch, c) => (ch === "U" ? `${r},${c}` : null))).filter(Boolean);

/**
 * 旧存档（v3 及更早）按章节序号记录，那时还没有兵阵、镜厅、王城禁卫三章。
 * 把序号换成 key，解锁进度换算到新的章节顺序；按章节分别保存的构筑取走得最远的一份作为 profile。
 */
function migrate(data) {
  if (data.v >= PROGRESS_VERSION) return data;
  const legacyKey = (i) => LEGACY_ORDER[Math.min(i, LEGACY_ORDER.length - 1)];
  const saved = Object.keys(data.loadouts ?? {}).map(Number);
  if (!data.profile && saved.length) {
    const index = indexOfKey(legacyKey(Math.max(...saved)));
    const old = data.loadouts[Math.max(...saved)];
    data.profile = {
      weapons: weaponsForLevel(index, STARTING_WEAPONS),
      skills: Object.keys(skillsForLevel(index, SKILLS)),
      upgrades: old.upgrades ?? {},
      equipped: old.equipped ?? null,
      equippedSkills: old.equippedSkills ?? null,
      slots: LEVELS[index].slots,
    };
  }
  delete data.loadouts;
  data.stars = Object.fromEntries(Object.entries(data.stars ?? {}).map(([id, n]) => [/^\d+$/.test(id) ? legacyKey(+id) : id, n]));
  data.forged = Object.fromEntries(
    Object.entries(data.forged ?? {}).map(([id, used]) => {
      const key = /^\d+$/.test(id) ? legacyKey(+id) : id;
      return [key, Array.isArray(used) ? used : forgeKeys(LEVELS[indexOfKey(key)])];
    }),
  );
  if (data.unlocked > 1) data.unlocked = indexOfKey(legacyKey(data.unlocked - 1)) + 1;
  data.v = PROGRESS_VERSION;
  return data;
}

/** 章节数写成中文：十一个章节。 */
function cnNumber(n) {
  const d = "零一二三四五六七八九";
  if (n < 10) return d[n];
  if (n < 20) return `十${n % 10 ? d[n % 10] : ""}`;
  return `${d[Math.floor(n / 10)]}十${n % 10 ? d[n % 10] : ""}`;
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
      <button class="icon-btn" data-cmd="rotate" title="转动视角（C）" aria-label="转动视角">${icon("orbit")}</button>
      <button class="icon-btn" data-cmd="help" title="玩法说明（H）" aria-label="玩法说明">${icon("help")}</button>
      <button class="icon-btn" data-cmd="music" title="音乐开关" aria-label="音乐开关" id="music-btn">${icon("music")}</button>
      <button class="icon-btn" data-cmd="sound" title="音效开关" aria-label="音效开关" id="sound-btn">${icon("sound")}</button>
      <button class="icon-btn" data-cmd="restart" title="重新开始本章（R）" aria-label="重新开始本章">${icon("restart")}</button>
      <button class="icon-btn" data-cmd="levels" title="选择章节" aria-label="选择章节">${icon("menu")}</button>
      <button class="icon-btn phone-menu" data-cmd="menu" aria-label="菜单">${icon("menu")}</button>
    </div>
  </header>
  <aside class="hud hero-hud" id="hero-hud"></aside>
  <aside class="hud goal-hud" id="goal-hud"></aside>
  <div class="hud-strip" id="hud-strip"></div>
  <div class="sheet-backdrop" data-cmd="closeSheet"></div>
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
// 存档里的名字要重新校验（可能被手动改过）；没有合格的名字就留空，开局时让玩家起名。
progress.name = validateName(progress.name).ok ? validateName(progress.name).name : "";
setHeroName(progress.name);
// 音效与音乐开关各自记住。
sfx.enabled = progress.audio?.sfx !== false;
sfx.musicEnabled = progress.audio?.music !== false;

/** 每个场景对应一首背景音乐。 */
const BATTLE_TRACK = { ink: "battle", pawn: "battle", knight: "elite", bishop: "elite", rook: "elite", queen: "elite", king: "boss" };
const boardTrack = () => (board?.level.fog ? "fog" : "board");
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
let slotsBefore = 0;

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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 瑞士风小标题：等宽编号 + 中文 + 英文大写。 */
const kicker = (nb, zh, en, extra = "") =>
  `<div class="kicker${extra.includes("build-chip") ? " with-chip" : ""}"><span class="kicker-nb">${nb}</span><span>${zh}</span><span class="kicker-en">${en}</span>${extra}</div>`;

/** 手机抽屉顶部的标题栏：标题 + 大号关闭按钮（桌面上两块面板常驻，不显示）。 */
const sheetHead = (title) =>
  `<header class="sheet-head"><b>${title}</b><button class="icon-btn" data-cmd="closeSheet" aria-label="收起">${icon("close")}</button></header>`;

function renderHud() {
  if (!board) return;
  const level = board.level;
  $("#chapter").innerHTML = `<span class="t-meta">CH.${pad(level.id)}</span><b>${level.name}</b><em class="t-meta">${level.english}</em>`;
  $("#turns").innerHTML = `<span class="t-meta">TURN</span><b>${pad(board.turn)}</b><span class="t-meta">PAR ${level.par}</span>`;
  const { hearts, slots } = countHearts(board.hero.matrix);
  const hero = board.hero;
  // 手机上：两块大面板收起来，只在棋盘上方留一条信息栏，点按钮才从底部拉出面板。
  const alive = board.monsters.filter((m) => m.alive);
  $("#hud-strip").innerHTML = `
    <span class="strip-hp ${hearts / slots < 0.35 ? "low" : ""}">${heartSvg("heart")}<b>${hearts}</b><small>/${slots}</small></span>
    ${unlockedFeatures().has("potion") ? `<button class="strip-chip" data-cmd="potion" ${hero.potions && hearts < slots ? "" : "disabled"} aria-label="喝药水">${icon("potion")}<b>${hero.potions}</b></button>` : ""}
    ${hero.keys ? `<span class="strip-chip">${icon("key")}<b>${hero.keys}</b></span>` : ""}
    ${hero.plates ? `<button class="strip-chip" data-cmd="armor" aria-label="使用护甲片">${icon("armor")}<b>${hero.plates}</b></button>` : ""}
    <span class="strip-gap"></span>
    <button class="strip-btn" data-cmd="sheetHero">${icon("sword")}武器</button>
    <button class="strip-btn" data-cmd="sheetGoal">${icon("exit")}目标<em>${alive.length}</em></button>`;
  $("#hero-hud").innerHTML = `
    ${sheetHead("武器与构筑")}
    ${kicker("01", "主角", "HERO")}
    <div class="hud-hero">
      <div class="hud-name"><b>${getHeroName()}</b><small>白色小兵 · ${hero.matrix.length}×${hero.matrix[0].length} 红心矩阵</small></div>
      <div class="hud-hp ${hearts / slots < 0.35 ? "low" : ""}"><span class="num">${hearts}</span><span class="of">/${slots}</span></div>
    </div>
    <div class="hud-matrix" title="${getHeroName()}的红心矩阵">${matrixSvg(hero.matrix, { cell: 12, gap: 2.5 })}</div>
    <div class="hud-items">
      ${unlockedFeatures().has("potion") ? `<button class="chip-btn" data-cmd="potion" ${hero.potions && hearts < slots ? "" : "disabled"} title="喝药水（P）">${icon("potion")}<span>药水</span><b>${hero.potions}</b></button>` : ""}
      <span class="chip ${hero.keys ? "on" : ""}" title="钥匙">${icon("key")}<span>钥匙</span><b>${hero.keys}</b></span>
      ${hero.plates ? `<button class="chip-btn" data-cmd="armor" title="使用护甲片（G）">${icon("armor")}<span>护甲片</span><b>${hero.plates}</b></button>` : ""}
    </div>
    ${kicker("02", "武器", "ARSENAL", `${slotPips(hero.equipped.length, hero.slots)}<button class="build-chip" data-cmd="armory" title="构筑（B）">${icon("bag")}构筑<kbd class="key-hint">B</kbd></button>`)}
    <ul class="weapon-list">${hero.equipped
      .map((id, i) => {
        const w = WEAPONS[id];
        return `<li title="${w.desc}"><span class="wi key-hint">${i + 1}</span><span class="ws">${shapeSvg(weaponShape(id, hero.upgrades), { cell: 8, gap: 1.5 })}</span><span class="wn"><b>${w.name}${upIcons(id, hero.upgrades)}</b></span><em>${costMark(id)}</em></li>`;
      })
      .join("")}
      <li class="shield-row" title="${SHIELD.desc}"><span class="wi key-hint">Q</span><span class="ws">${icon("shield")}</span><span class="wn"><b>${SHIELD.name}</b></span><em>${cdMark(SHIELD.cooldown)}</em></li>
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
    <button class="primary sheet-build" data-cmd="armory">${icon("bag")}<span>构筑 · 更换出战武器与技能</span><span aria-hidden="true">→</span></button>
`;

  $("#goal-hud").innerHTML = `
    ${sheetHead("目标")}
    ${kicker("04", "目标", "OBJECTIVE")}
    <p class="goal">${rich(level.goalText)}</p>
    ${kicker("05", "敌人", "HOSTILES", `<em>${alive.length}/${board.monsters.length}</em>`)}
    <ul class="enemy-list">${board.monsters
      .map((m) => {
        const { hearts: h, slots: sl } = countHearts(m.matrix);
        if (!m.seen) return `<li class="unseen"><span class="avatar-sm unknown">?</span><span class="wn"><b>未发现</b><small>位于迷雾中</small></span><em>?</em></li>`;
        const hp = m.def.boss ? "?" : `${h}/${sl}`;
        return `<li class="${m.alive ? "" : "dead"} ${m.aggro && m.alive ? "alert" : ""}" data-uid="${m.uid}"><span class="avatar-sm ${m.def.model}">${GLYPH[m.def.model]}</span><span class="wn"><b>${m.def.name}${m.alive && !m.def.boss ? `<span class="traits mini">${traitChips(m.def)}</span>` : ""}</b><small>${m.alive ? `${m.def.boss ? "情报不明" : AI_TEXT[m.ai]}${m.stun ? " · 晕眩" : ""}` : "已击败"}</small></span><em>${m.alive ? hp : "0"}</em></li>`;
      })
      .join("")}</ul>
    <p class="hud-foot"><span class="sq ${board.exitOpen ? "on" : ""}"></span>${board.exitOpen ? "出口已开启" : "出口已被封印"}</p>`;
}

/** 槽位小方块：实心为已占用。 */
function slotPips(used, total, tone = "") {
  return `<em class="slot-pips ${tone}" title="${used}/${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < used ? "on" : ""}"></i>`).join("")}</em>`;
}

/** 中型、重型武器每用一次要消耗的充能，画成蓝色菱形。 */
const costMark = (id) => {
  const n = ENERGY_COST[WEAPONS[id].weight] ?? 0;
  return n ? `<span class="cost-mark" title="每次消耗 ${n} 点充能">${Array.from({ length: n }, () => icon("energy")).join("")}</span>` : "";
};

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
  const text = {
    chest: ["宝箱", w ? `<span class="inline-shape">${shapeSvg(w.shape, { cell: 7, gap: 1.5 })}</span>${w.name}` : ""],
    potion: ["红心药水", POTION.desc],
    forge: ["铁砧", "从三项强化中选择一项。"],
  }[item.type];
  if (!text) return;
  tip.innerHTML = `<div class="tip-head tip-item"><span class="tip-icon">${icon({ chest: "chest", potion: "potion", forge: "anvil" }[item.type])}</span><div><b>${text[0]}</b><small>${text[1]}</small></div></div>`;
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
    ${traitChips(def) ? `<p class="traits tip-traits">${traitChips(def)}</p>` : ""}
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
  const found = board && hoverTile && !m && isExplored(board, r, c) ? board.items.get(key(r, c)) : null;
  const item = found && found.type !== "key" && !found.opened ? found : null;
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
    toast("迷雾中无法查看");
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

/** 使用相邻的铁砧（不消耗回合）。 */
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
      }
    }
  } finally {
    busy = false;
    renderHud();
    refreshMarks();
  }
}

/** 第一只护甲怪出场的章节。在那之前，铁砧不会刷出破甲。 */
const FIRST_ARMOR_LEVEL = LEVELS.findIndex((l) => l.monsters.some((m) => MONSTERS[m.type].armored));
const forgeRules = () => ({ pierce: levelIndex >= FIRST_ARMOR_LEVEL });

/** 铁砧：随机给出三项强化，玩家选一项；也可以暂不强化，稍后再来。 */
function showForge(item) {
  item.options ??= createForgeOptions(board.hero, Math.random, forgeRules());
  if (!item.options.length) {
    toast("所有武器均已强化完毕");
    return;
  }
  playing = false;
  const cardHtml = (opt, i) => {
    const w = WEAPONS[opt.weapon];
    const { before, after } = upgradePreview(opt, board.hero.upgrades);
    const equipped = board.hero.equipped.includes(opt.weapon);
    return `<button class="forge-card" data-upgrade="${i}">
        <span class="t-meta forge-weapon">${w.name}${equipped ? "" : `<i class="in-bag" title="在背包里">${icon("bag")}</i>`}</span>
        <b>${icon(UPGRADE_TEXT[opt.kind].icon)}${UPGRADE_TEXT[opt.kind].name}</b>
        <span class="forge-shapes"><span>${shapeSvg(before, { cell: 14, gap: 3 })}</span><i aria-hidden="true">→</i><span>${shapeSvg(after, { cell: 14, gap: 3 })}</span></span>
        <small>${opt.kind === "extend" ? `攻击范围增加 ${WEAPONS[opt.weapon].plusShape.size - WEAPONS[opt.weapon].shape.size} 格。` : UPGRADE_TEXT[opt.kind].desc}</small>
      </button>
      <button class="reroll" data-reroll="${i}" ${opt.rerolled ? "disabled" : ""}>${icon("restart")}${opt.rerolled ? "已重抽" : "重抽"}</button>`;
  };
  showScreen(
    "forge",
    `<div class="panel forge">
      <header class="panel-head"><div>${kicker(icon("anvil"), "铁砧", "FORGE")}<h2>选择一项强化</h2></div><button class="icon-btn" data-cmd="back" aria-label="暂不强化">${icon("close")}</button></header>
      <div class="forge-grid">${item.options.map((opt, i) => `<div class="forge-slot" data-slot="${i}">${cardHtml(opt, i)}</div>`).join("")}</div>
      <div class="panel-actions"><button class="ghost" data-cmd="back">暂不强化</button></div>
    </div>`,
  );
  screenBack = () => {
    hideScreen();
    playing = true;
    refreshMarks();
  };
  const grid = document.querySelector(".forge-grid");
  let spinning = false;

  // 重抽只替换这一张卡：先翻过去，换上新内容，再翻回来。整个窗口不重建，所以不会抽动。
  async function reroll(i) {
    if (spinning) return;
    const result = rerollForgeOption(board.hero, item.options, i, Math.random, forgeRules());
    if (!result.ok) {
      sfx.play("invalid");
      toast(result.reason);
      return;
    }
    spinning = true;
    sfx.play("flip");
    const slot = grid.querySelector(`[data-slot="${i}"]`);
    slot.classList.add("flip-out");
    await sleep(180);
    slot.innerHTML = cardHtml(item.options[i], i);
    slot.classList.remove("flip-out");
    slot.classList.add("flip-in");
    await sleep(320);
    slot.classList.remove("flip-in");
    spinning = false;
  }

  function choose(i) {
    if (spinning) return;
    const opt = item.options[i];
    applyUpgrade(board.hero, opt);
    useForge(board, item.r, item.c);
    board.forgesUsed = [...(board.forgesUsed ?? []), `${item.r},${item.c}`];
    world.useForge(item.r, item.c);
    sfx.play("anvil");
    toast(`${icon(UPGRADE_TEXT[opt.kind].icon)}<b>${WEAPONS[opt.weapon].name}</b> ${UPGRADE_TEXT[opt.kind].name}`, "gold");
    hideScreen();
    playing = true;
    renderHud();
    refreshMarks();
  }

  grid.addEventListener("click", (e) => {
    const rerollBtn = e.target.closest("[data-reroll]");
    if (rerollBtn) return reroll(Number(rerollBtn.dataset.reroll));
    const card = e.target.closest("[data-upgrade]");
    if (card) choose(Number(card.dataset.upgrade));
  });
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
      <span class="build-meta">${costMark(id)}</span>
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
  const emptySlot = (kind) => `<div class="build-card empty empty-${kind}">${icon(kind === "skill" ? "skill" : "sword")}</div>`;

  const draw = () => {
    const bagWeapons = hero.weapons.filter((id) => !hero.equipped.includes(id));
    const ownedSkills = Object.keys(hero.skills);
    const bagSkills = ownedSkills.filter((id) => !hero.equippedSkills.includes(id));
    const weaponSlots = Array.from({ length: hero.slots }, (_, i) => (hero.equipped[i] ? weaponCard(hero.equipped[i], "on") : emptySlot("weapon"))).join("");
    const skillSlots = Array.from({ length: SKILL_SLOTS }, (_, i) => (hero.equippedSkills[i] ? skillCard(hero.equippedSkills[i], "on") : emptySlot("skill"))).join("");
    showScreen(
      "armory",
      `<div class="panel armory ${pending ? `swapping swap-${pending.kind}` : ""}">
        <header class="panel-head"><div>${kicker(icon("bag"), "构筑", "BUILD")}<h2>构筑</h2></div><button class="icon-btn" data-cmd="back" aria-label="完成">${icon("close")}</button></header>
        <div class="loadout">
          <section class="loadout-col">
            <h4 class="build-title">${kw("武器槽")}${slotPips(hero.equipped.length, hero.slots)}</h4>
            <div class="build-list">${weaponSlots}</div>
            ${ownedSkills.length ? `<h4 class="build-title">${kw("技能")}${slotPips(hero.equippedSkills.length, SKILL_SLOTS, "skill")}</h4><div class="build-list">${skillSlots}</div>` : ""}
          </section>
          <div class="loadout-rule" aria-hidden="true"><span>⇄</span></div>
          <section class="loadout-col bag">
            <h4 class="build-title">${kw("闲置", "背包")}<em class="t-meta">${bagWeapons.length + bagSkills.length}</em></h4>
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
      toast(pickableAt(board, r, c) ? "须站在铁砧相邻的格子上点击" : result.reason);
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
        toast(`${icon("key")} 铁栅门已开启`);
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
      toast(named.length ? `<b>${named.map((m) => m.def.name).join("、")}</b> 发现了${getHeroName()}` : `迷雾中的怪物发现了${getHeroName()}`, "danger");
    }
    await Promise.all(monsters.moves.map((mv) => world.moveMonster(mv.monster, mv.to)));
    if (gen !== levelGen) return "over";
    world.updateFog(board);
    board.monsters.forEach((m) => world.updateMonster(m));
    // 第一次被怪物发现（或被突袭）时，才讲“巡猎的怪物”。
    if (monsters.alerts.length || monsters.ambush) await explain(["ambush"]);
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
    await world.collectItem(item.r, item.c);
    await explain(["key-door"]);
    return;
  } else if (item.type === "plate") {
    sfx.play("pickup");
    toast(`${icon("armor")} 获得 <b>护甲片</b>`);
  } else if (item.type === "chest") {
    sfx.play("chest");
    const w = WEAPONS[item.weapon];
    toast(`<span class="toast-shape">${shapeSvg(w.shape, { cell: 10 })}</span>获得新武器 <b>${w.name}</b>`, "gold");
  }
  await world.collectItem(item.r, item.c);
  if (item.type === "plate") {
    await explain(["plate"], {});
    return;
  }
  if (item.type !== "chest") return;
  // 拿到新武器时，才讲这件武器带来的新概念：武器槽不够、重武器、护甲。
  const w = WEAPONS[item.weapon];
  const topics = [];
  if (board.hero.weapons.length > board.hero.slots) topics.push("slots");
  if (w.weight === "heavy") topics.push("heavy");
  if (w.pierce) topics.push("armor");
  await explain(topics, { slots: board.hero.slots, weapon: w, weapons: board.hero.weapons, skills: Object.keys(board.hero.skills) });
}

/** 当前已经解锁的战斗机制：看玩家走到的最远章节，回头重玩旧章节不会“忘掉”学过的东西。 */
const unlockedFeatures = () => featuresAt(Math.max(levelIndex, progress.unlocked - 1));

/**
 * 这场战斗要讲的说明：界面导览只讲已经解锁的部分（看过的会自动跳过，
 * 所以每章第一场战斗只会讲这一章新解锁的按钮），再加上这只怪物自身的特性。
 */
function battleTopics(monster, features) {
  const tour = [
    ["tour-enemy"],
    ["tour-hero"],
    ["tour-intent"],
    ["tour-attack"],
    ["tour-energy", "energy"],
    ["tour-shield", "shield"],
    ["tour-potion", "potion"],
    ["tour-retreat", "retreat"],
  ];
  // 暗王战不能撤退，也就不讲撤退。
  const shown = ([id, feature]) => (!feature || features.has(feature)) && !(id === "tour-retreat" && monster.def.boss);
  const topics = tour.filter(shown).map(([id]) => id);
  // 带着技能进入战斗：讲技能是什么，以及带着的每一个新技能。
  const skills = board.hero.equippedSkills ?? [];
  if (skills.length) topics.push("skills", ...skills.map((id) => ({ id: `skill-${id}`, topic: skillTopic(id) })));
  if (monster.matrix.some((row) => row.some((v) => v >= 2))) topics.push("armor");
  if (monster.def.pattern.some((p) => p.kind === "charge")) topics.push("charge");
  if (monster.def.pattern.some((p) => p.kind === "heal")) topics.push("heal");
  return topics;
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
  const features = unlockedFeatures();
  const combat = createCombat({ hero: board.hero, monster, heroFirst, features });
  currentCombat = combat;
  closeSheet();
  document.body.classList.add("in-battle");
  // 逐个指着界面讲已经解锁的部分；连击等第一次完美命中、心阵上出现虚线框之后再讲。
  const topics = battleTopics(monster, features);
  const ctx = { weapons: board.hero.weapons, skills: Object.keys(board.hero.skills) };
  sfx.music.play(BATTLE_TRACK[monster.def.id] ?? "battle");
  await runBattle({
    root: $("#battle-root"),
    combat,
    monster,
    world,
    sfx,
    heroFirst,
    features,
    coach: () => explain(topics, ctx, { context: "battle" }),
    afterPerfectHit: features.has("combo") ? () => explain(["combo-energy"]) : null,
  });
  document.body.classList.remove("in-battle");
  sfx.music.play(combat.phase === "lost" ? null : boardTrack());
  currentCombat = null;
  const events = resolveBattle(board, monster, combat, heroFirst);
  const restore = world.restoreView();
  for (const event of events) {
    if (event.type === "defeat") await world.defeatMonster(event.monster);
    if (event.type === "drop") toast(`${event.monster.def.name}掉落 <b>红心药水</b>`, "gold");
    if (event.type === "exit-open") {
      world.setExitOpen(true);
      sfx.play("win");
      toast("出口封印已解除", "gold");
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
  const profile = progress.profile;
  // 拥有的武器只算真正从宝箱里拿到的（存在存档里）；跳过的宝箱，武器就还在宝箱里，回去还能拿。
  // 技能按章节学会，次数每章开始时补满。
  const weapons = profile ? [...new Set([...STARTING_WEAPONS, ...profile.weapons])] : weaponsForLevel(index, STARTING_WEAPONS);
  const skills = { ...skillsForLevel(index, SKILLS) };
  for (const id of profile?.skills ?? []) if (SKILLS[id]) skills[id] = SKILLS[id].charges;
  slotsBefore = profile?.slots ?? 0;
  board = createBoard(level, {
    weapons,
    skills,
    upgrades: sanitizeUpgrades(profile?.upgrades ?? {}),
    equipped: profile?.equipped ?? null,
    equippedSkills: profile?.equippedSkills ?? null,
    knownSkills: profile?.skills ?? [],
    minSlots: profile?.slots ?? 0,
    usedForges: progress.forged?.[level.key] ?? [],
  });
  world.loadLevel(board);
  sfx.music.play(boardTrack());
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
  if (slotsBefore && board.hero.slots > slotsBefore) topics.push({ id: `slots-${board.hero.slots}`, topic: TOPICS_SLOTS_UP });
  // 钥匙、巡猎的怪物、新技能不在开场讲：分别在拾取钥匙、第一次被怪物发现、第一场能用上技能的战斗时再讲。
  if (level.fog) topics.push("fog");
  if (level.monsters.some((m) => MONSTERS[m.type].boss)) topics.push("boss");
  await explain(topics, { slots: board.hero.slots });
  playing = true;
  refreshMarks();
}

/** 手机上的底部面板：同一时间只开一块。 */
function openSheet(name) {
  const open = document.body.classList.contains(`sheet-${name}`);
  closeSheet();
  if (!open) document.body.classList.add(`sheet-${name}`, "sheet-open");
}

function closeSheet() {
  document.body.classList.remove("sheet-hero", "sheet-goal", "sheet-open");
}

function showScreen(name, html, { back = null, wide = false } = {}) {
  closeSheet();
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

/** 有没有值得重置的东西：解锁过章节、拿过星、有构筑存档或看过说明。 */
function hasProgress() {
  return progress.unlocked > 1 || Object.keys(progress.stars ?? {}).length > 0 || Boolean(progress.profile) || progress.seen.length > 0;
}

/** 重置前的确认。不可撤销，所以单独一屏，默认焦点放在「取消」上。 */
function showResetConfirm() {
  const back = screenName && screenBack ? screenBack : null;
  const from = screenName;
  showScreen(
    "reset",
    `<div class="panel reset-panel" role="alertdialog" aria-labelledby="reset-title">
      <header class="panel-head"><div>${kicker(icon("restart"), "重置", "RESET")}<h2 id="reset-title">重置进度</h2></div></header>
      <p class="body">${rich(`所有章节、星级、[武器]、强化与名字都将被清除，游戏将从序章重新开始。`)}</p>
      <p class="reset-warn">${icon("close")}这一步无法撤销。</p>
      <div class="panel-actions">
        <button class="ghost" data-cmd="back" autofocus>取消</button>
        <button class="primary danger" data-cmd="confirmReset">确认重置<span aria-hidden="true">→</span></button>
      </div>
    </div>`,
  );
  // 取消后回到打开前的那一屏。从玩法说明进来的，回去时沿用它原来的关闭方式，棋盘上的状态不会丢。
  screenBack =
    from === "help" && back
      ? () => {
          showHelp();
          screenBack = back;
        }
      : showTitle;
  setTimeout(() => document.querySelector(".reset-panel [data-cmd=back]")?.focus(), 30);
}

function resetProgress() {
  const audio = progress.audio;
  for (const k of Object.keys(progress)) delete progress[k];
  Object.assign(progress, JSON.parse(JSON.stringify(EMPTY_PROGRESS)), audio ? { audio } : {});
  saveProgress();
  // 回到标题；棋盘背景重新从序章开始。进行中的走动和动画一并作废。
  walkToken += 1;
  levelGen += 1;
  playing = false;
  busy = false;
  board = null;
  currentCombat = null;
  document.body.classList.remove("in-level", "in-battle");
  setHeroName("");
  enterGame();
  toast(`${icon("restart")} 进度已重置`);
}

function showTitle() {
  sfx.music.play("title");
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
  const earned = LEVELS.reduce((sum, l) => sum + (progress.stars[l.key] ?? 0), 0);
  showScreen(
    "title",
    `<div class="title-card">
      <div class="dot-mat" aria-hidden="true"></div>
      <div class="t-meta title-chrome"><span>ADVENTURER · ${getHeroName()}</span></div>
      <h1>心阵<br>棋局</h1>
      <p class="subtitle t-meta">HEART GAMBIT / A TURN-BASED BOARD GAME</p>
      <p class="lede">墨水瓶倾倒在棋盘上，被墨迹侵蚀的黑棋化为怪物。白色小兵${getHeroName()}须穿越${cnNumber(LEVELS.length - 1)}个章节，找到墨迹的源头。</p>
      <div class="title-actions">
        <button class="primary" data-cmd="continue">${progress.unlocked > 1 ? `继续冒险 · 第 ${continueIndex} 章` : "开始冒险"}<span aria-hidden="true">→</span></button>
        <button class="ghost" data-cmd="levels">选择章节</button>
        <button class="ghost" data-cmd="help">玩法说明</button>
        <button class="ghost" data-cmd="rename">更改名字</button>
        ${hasProgress() ? `<button class="ghost subtle" data-cmd="reset">${icon("restart")}重置进度</button>` : ""}
      </div>
      <dl class="title-specs">
        <div><dt class="t-meta">Chapters</dt><dd>${pad(LEVELS.length - 1)}</dd></div>
        <div><dt class="t-meta">Weapons</dt><dd>${pad(Object.keys(WEAPONS).length)}</dd></div>
        <div><dt class="t-meta">Board</dt><dd>8×8</dd></div>
        <div><dt class="t-meta">Stars</dt><dd>${pad(earned)}<small>/${LEVELS.length * 3}</small></dd></div>
      </dl>
    </div>`,
  );
}

/** 进入游戏的第一屏：还没起名就先起名，起过了直接看标题。 */
function enterGame() {
  if (progress.name) showTitle();
  else showNameEntry();
}

/**
 * 起名 / 改名界面。
 * cancelable 为 true 时是从标题页点「更改名字」进来的，可以取消；首次起名必须填完才能继续。
 */
function showNameEntry({ cancelable = false } = {}) {
  sfx.music.play("title");
  document.body.classList.remove("in-level");
  playing = false;
  // 背景棋盘照常转起来，和标题页保持一致。
  if (!board) {
    board = createBoard(LEVELS[0], { weapons: STARTING_WEAPONS });
    world.loadLevel(board);
  }
  world.controls.autoRotate = true;
  world.controls.autoRotateSpeed = 0.6;
  world.setScreenShift(0);
  showScreen(
    "name",
    nameEntryHtml({ current: progress.name, cancelable, kickerHtml: kicker("00", "起名", "YOUR NAME") }),
    { back: cancelable ? showTitle : null },
  );
  bindNameEntry($("#screen"), (name) => {
    progress.name = setHeroName(name);
    saveProgress();
    sfx.play("click");
    showTitle();
  });
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
          ${locked ? `<span class="lock t-meta">${icon("lock")} Locked</span>` : stars(progress.stars[level.key] ?? 0)}
        </button>`;
      }).join("")}</div>
    </div>`,
    { back, wide: true },
  );
  screenBack = back === "resume" ? () => ((playing = was), hideScreen(), refreshMarks()) : showTitle;
}

/**
 * 章节开场：只交代“这一章讲什么、要做什么”。
 * 红心、敌人、新武器等细节留给棋盘上的信息面板和第一次遇到时的说明卡，不在开场堆一屏。
 */
function showIntro() {
  const level = board.level;
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
      <p class="intro-goal"><span class="t-meta">Objective · 目标</span><span class="intro-goal-text">${rich(level.goalText)}</span></p>
      <p class="tip"><span class="t-meta">Note</span>${rich(level.tip)}</p>
      <div class="panel-actions"><button class="primary" data-cmd="begin">${level.tutorial ? "开始序章" : `开始第 ${level.id} 章`}<span aria-hidden="true">→</span></button></div>
    </div>`,
    { back: null },
  );
}

async function levelComplete() {
  playing = false;
  sfx.music.play(null);
  sfx.play("win");
  const level = board.level;
  const { hearts, slots } = countHearts(board.hero.matrix);
  const healthy = hearts / slots >= 0.5;
  const fast = board.turn <= level.par;
  const earned = 1 + (healthy ? 1 : 0) + (fast ? 1 : 0);
  progress.stars[level.key] = Math.max(progress.stars[level.key] ?? 0, earned);
  progress.unlocked = Math.max(progress.unlocked, Math.min(levelIndex + 2, LEVELS.length));
  const hero = board.hero;
  // 通关奖励的武器（序章的钩镰）：直接放进构筑，有空槽就装上。
  const reward = level.reward && !hero.weapons.includes(level.reward) ? WEAPONS[level.reward] : null;
  if (reward) {
    hero.weapons.push(reward.id);
    if (hero.equipped.length < hero.slots) hero.equipped.push(reward.id);
  }
  progress.profile = JSON.parse(
    JSON.stringify({
      weapons: hero.weapons,
      skills: Object.keys(hero.skills),
      upgrades: hero.upgrades,
      equipped: hero.equipped,
      equippedSkills: hero.equippedSkills,
      slots: Math.max(progress.profile?.slots ?? 0, hero.slots),
    }),
  );
  if (board.forgesUsed?.length)
    progress.forged = { ...(progress.forged ?? {}), [level.key]: [...new Set([...(progress.forged?.[level.key] ?? []), ...board.forgesUsed])] };
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
      ${reward ? `<p class="reward-line"><span class="t-meta">New weapon · 新武器</span><span class="inline-shape">${shapeSvg(reward.shape, { cell: 10 })}</span><b>${reward.name}</b>${reward.desc}</p>` : ""}
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
  setTimeout(() => sfx.music.play("title"), 2500);
  const total = LEVELS.reduce((sum, l) => sum + (progress.stars[l.key] ?? 0), 0);
  showScreen(
    "ending",
    `<div class="panel result ending">
      <p class="t-meta">Final chapter / Checkmate</p>
      <h2>将死。</h2>
      ${stars(earned)}
      <p class="story">暗王被击败，墨迹退回墨水瓶，黑棋恢复原状。${getHeroName()}回到了第一排。</p>
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
  sfx.music.play(null);
  showScreen(
    "gameover",
    `<div class="panel result lost">
      <p class="t-meta">Chapter ${pad(board.level.id)} / ${board.level.english}</p>
      <h2>挑战失败</h2>
      <p class="story">${rich(`${getHeroName()}的红心已全部消除。请留意怪物的下一招，并在[重击]到来前使用[防御]。`)}</p>
      <div class="panel-actions">
        <button class="ghost" data-cmd="levels">选择章节</button>
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

/** 玩法说明里的操作一节：键盘设备列按键，触屏设备讲手势。 */
function controlsHelp() {
  if (isTouch())
    return `<h3><span class="t-meta">06</span>操作</h3>
          <p class="keys"><span>方向键 移动</span><span>点格子 自动寻路</span><span>单指拖动 转动视角</span><span>双指 缩放</span><span>攻击：点击格子预览范围，再次点击同一格确认</span><span>信息栏按钮 武器 / 目标 / 药水 / 护甲片</span></p>`;
  return `<h3><span class="t-meta">06</span>按键</h3>
          <p class="keys"><span><kbd>WASD</kbd>移动</span><span><kbd>C</kbd>转动视角</span><span><kbd>B</kbd>构筑</span><span><kbd>G</kbd>护甲片</span><span><kbd>P</kbd>喝药水</span><span><kbd>1</kbd>~<kbd>7</kbd>选武器</span><span><kbd>R</kbd>旋转</span><span><kbd>F</kbd>镜像</span><span><kbd>Q</kbd>防御</span><span><kbd>E</kbd>药水</span><span><kbd>Z</kbd>等待</span></p>`;
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
          <p>${rich(`${getHeroName()}与怪物的生命均以[红心矩阵]表示，红心全部消除的一方战败。带黑框的[护甲心]需要命中两次才会消除。`)}</p>
          <h3><span class="t-meta">02</span>形状攻击</h3>
          <p>${rich(`每件[武器]具有固定的攻击形状，范围内的红心将被消除。<span class="inline-shape">${shapeSvg(hook.shape, { cell: 9 })}</span> 钩镰瞄准 a00 时，消除 a00、a01、a10。`)}</p>
          ${demoGrid([[0, 0], [0, 1], [1, 0]])}
        </section>
        <section>
          <h3><span class="t-meta">03</span>战斗</h3>
          <ul class="help-legend">
            <li><span class="legend-glyph"><span class="swatch ink"></span></span><span>墨黑格为怪物下一招的攻击范围。</span></li>
            <li><span class="legend-glyph"><span class="swatch heal-plan"></span></span><span>红色虚线框为怪物即将恢复红心的位置。</span></li>
            <li><span class="legend-glyph">${icon("shield")}</span><span>${rich("[防御]抵挡怪物的下一次攻击，不消耗回合。")}</span></li>
            <li><span class="legend-glyph">${icon("potion")}</span><span>${rich("[药水]恢复十字范围内的红心。")}</span></li>
            <li><span class="legend-glyph">${icon("cd")}</span><span>${rich("中型与重型武器使用后需要[冷却] 1 回合。")}</span></li>
            <li><span class="legend-glyph">${icon("run")}</span><span>撤退时承受一次追击，之后怪物晕眩两回合。</span></li>
          </ul>
          <h3><span class="t-meta">04</span>连击</h3>
          <ul class="help-legend">
            <li><span class="legend-glyph">${icon("perfect")}</span><span>${rich("攻击范围内的每一格均为红心时，记为[完美命中]。")}</span></li>
            <li><span class="legend-glyph">${icon("combo")}</span><span>${rich("更换武器，在紧邻上一击的位置再次完美命中，构成[连击]。")}</span></li>
            <li><span class="legend-glyph">${icon("energy")}</span><span>${rich(`连击 ×2 起，每次连击获得 1 点[充能]。中型武器每次消耗 ${ENERGY_COST.medium} 点，重型武器每次消耗 ${ENERGY_COST.heavy} 点。连击 ×${CHASE_EVERY} 时触发[追击]。`)}</span></li>
          </ul>
          <h3><span class="t-meta">05</span>棋盘</h3>
          <ul class="help-legend">
            <li><span class="legend-glyph">${icon("chest")}</span><span>${rich("进入[宝箱]、[药水]或[护甲片]所在的格子即可拾取。站在[铁砧]相邻的格子上点击铁砧即可使用。")}</span></li>
            <li><span class="legend-glyph">${icon("bag")}</span><span>${rich("[武器槽]数量决定可装备的武器数，[技能]最多装备三个。在[构筑]中更换出战的武器与技能。")}</span></li>
            <li><span class="legend-glyph">${icon("fog")}</span><span>${rich(`[迷雾]中仅显示${getHeroName()}周围的格子。`)}</span></li>
          </ul>
          ${controlsHelp()}
          <div class="panel-actions"><button class="ghost" data-cmd="hints">新手提示 · ${progress.hints === false ? "关" : "开"}</button><button class="ghost subtle" data-cmd="reset">${icon("restart")}重置进度</button></div>
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

/**
 * 在自己的心阵上摆放一个形状（棋盘上喝药水、上护甲共用）。不消耗回合。
 * resolve(r, c) 给出落在 (r,c) 时会改变的格子；apply(r, c) 真正生效并返回这些改动。
 */
function showHeroPlacement({ name, kickerHtml, title, bodyHtml, shape, resolve, apply, tone, anim, sound }) {
  playing = false;
  showScreen(
    name,
    `<div class="panel heal-panel">
      <header class="panel-head"><div>${kickerHtml}<h2>${title}</h2></div><button class="icon-btn" data-cmd="back" aria-label="关闭">${icon("close")}</button></header>
      <p class="body">${bodyHtml}</p>
      <div class="heal-matrix"><div id="place-matrix"></div></div>
    </div>`,
  );
  const view = new MatrixView($("#place-matrix"), { margin: 1, maxSize: 300, side: "hero" });
  const resume = () => {
    hideScreen();
    playing = true;
    refreshMarks();
  };
  view.set(board.hero.matrix);
  view.onHover = (r, c) => {
    const changes = resolve(r, c);
    view.preview(shape, r, c, changes, { tone, valid: changes.length > 0 });
  };
  view.onLeave = () => view.clearPreview();
  view.onPick = async (r, c) => {
    if (!resolve(r, c).length) {
      sfx.play("invalid");
      return;
    }
    const changes = apply(r, c);
    sfx.play(sound);
    view.clearPreview();
    await view.animate(changes, anim, board.hero.matrix);
    renderHud();
    resume();
  };
  screenBack = resume;
}

/** 棋盘上喝药水：在自己的心阵上选择十字落点。 */
function showFieldHeal() {
  if (!playing || busy || board.hero.potions <= 0 || !unlockedFeatures().has("potion")) return;
  showHeroPlacement({
    name: "heal",
    kickerHtml: kicker("P", "治疗", "POTION", `<em>${board.hero.potions}</em>`),
    title: "红心药水",
    bodyHtml: `选择一个位置，恢复 <span class="inline-shape">${shapeSvg(POTION.shape, { cell: 9, tone: "heal" })}</span> 十字范围内的红心。`,
    shape: POTION.shape,
    resolve: (r, c) => resolveHeal(board.hero.matrix, POTION.shape, r, c),
    apply: (r, c) => {
      const heals = resolveHeal(board.hero.matrix, POTION.shape, r, c);
      board.hero.matrix = applyChanges(board.hero.matrix, heals);
      board.hero.potions -= 1;
      return heals;
    },
    tone: "heal",
    anim: "heal",
    sound: "heal",
  });
}

/** 棋盘上使用护甲片：在自己的心阵上选择一块 2×2 区域，附加护甲。 */
function showFieldArmor() {
  if (!playing || busy || board.hero.plates <= 0) return;
  showHeroPlacement({
    name: "armor",
    kickerHtml: kicker(icon("armor"), "护甲", "ARMOR", `<em>${board.hero.plates}</em>`),
    title: "护甲片",
    bodyHtml: rich(`选择一个位置，为 <span class="inline-shape">${shapeSvg(PLATE_SHAPE, { cell: 9 })}</span> 2×2 范围内的红心附加护甲。[护甲心]首次被击中时失去护甲，第二次被击中时消除。`),
    shape: PLATE_SHAPE,
    resolve: (r, c) => previewPlate(board, r, c),
    apply: (r, c) => armorHero(board, r, c).changes,
    tone: "armor",
    anim: "armor",
    sound: "pickup",
  });
}

/**
 * 手机菜单：竖屏顶栏只留一个菜单按钮，其余按钮收进这里，每一行都有足够的点按高度。
 * 在章节里多出“转动视角 / 重新开始 / 选择章节”；标题页只有说明和声音开关。
 */
function showMenu() {
  if (busy || document.body.classList.contains("in-battle")) return;
  const inLevel = document.body.classList.contains("in-level");
  const was = playing;
  playing = false;
  const row = (cmd, glyph, label, extra = "") =>
    `<button class="menu-row" data-cmd="${cmd}">${icon(glyph)}<span>${label}</span>${extra}</button>`;
  const toggle = (cmd, glyph, label, on) => row(cmd, glyph, label, `<em data-menu-state="${cmd}">${on ? "开" : "关"}</em>`);
  showScreen(
    "menu",
    `<div class="panel menu-panel">
      <header class="panel-head"><div>${kicker(icon("menu"), "菜单", "MENU")}</div><button class="icon-btn" data-cmd="back" aria-label="关闭">${icon("close")}</button></header>
      <nav class="menu-list">
        ${inLevel ? row("levels", "flag", "选择章节") + row("restart", "restart", "重新开始本章") + row("rotate", "orbit", "转动视角") : ""}
        ${row("help", "help", "玩法说明")}
        ${toggle("music", "music", "音乐", sfx.musicEnabled)}
        ${toggle("sound", "sound", "音效", sfx.enabled)}
      </nav>
    </div>`,
  );
  // 关闭菜单回到原来的状态；菜单里跳去别的界面时，由那个界面接管返回。
  screenBack = () => {
    hideScreen();
    playing = was;
    refreshMarks();
  };
  // 从菜单里点“重新开始 / 转动视角”时先把菜单收起来，恢复棋盘状态。
  menuReturn = screenBack;
}

// ——— 命令与输入 ———

/** 手机菜单打开期间，关闭菜单用的回调；菜单项执行前先调用它收起菜单。 */
let menuReturn = null;

/** 从手机菜单里执行的命令：先收起菜单、恢复棋盘状态，再执行。 */
const fromMenu = (fn) => () => {
  if (screenName === "menu" && menuReturn) {
    const back = menuReturn;
    menuReturn = null;
    back();
  }
  fn();
};

const commands = {
  continue: () => startLevel(Math.min(progress.unlocked, LEVELS.length) - 1),
  levels: fromMenu(showLevels),
  menu: showMenu,
  armory: showArmory,
  sheetHero: () => openSheet("hero"),
  sheetGoal: () => openSheet("goal"),
  closeSheet,
  reset: showResetConfirm,
  rename: () => showNameEntry({ cancelable: true }),
  confirmReset: resetProgress,
  hints: () => {
    progress.hints = progress.hints === false;
    saveProgress();
    const btn = document.querySelector("[data-cmd=hints]");
    if (btn) btn.textContent = `新手提示 · ${progress.hints ? "开" : "关"}`;
  },
  help: fromMenu(showHelp),
  begin,
  back: () => (screenBack ? screenBack() : hideScreen()),
  title: showTitle,
  replay: () => startLevel(levelIndex),
  next: () => startLevel(levelIndex + 1),
  restart: fromMenu(() => {
    if (!document.body.classList.contains("in-level") || busy || screenName) return;
    const was = playing;
    playing = false;
    showScreen(
      "restart",
      `<div class="panel reset-panel" role="alertdialog" aria-labelledby="restart-title">
        <header class="panel-head"><div>${kicker(icon("restart"), "重来", "RESTART")}<h2 id="restart-title">重新开始本章</h2></div></header>
        <p class="body">返回${board.level.name}的起点。本章已击败的怪物与已拾取的物品将全部复原。</p>
        <div class="panel-actions">
          <button class="ghost" data-cmd="back">取消</button>
          <button class="primary danger" data-cmd="confirmRestart">重新开始<span aria-hidden="true">→</span></button>
        </div>
      </div>`,
    );
    screenBack = () => {
      hideScreen();
      playing = was;
      refreshMarks();
    };
    setTimeout(() => document.querySelector(".reset-panel [data-cmd=back]")?.focus(), 30);
  }),
  confirmRestart: () => {
    startLevel(levelIndex, { intro: false });
    toast(`${icon("restart")} 已回到本章起点`);
  },
  rotate: fromMenu(() => world.rotateView()),
  potion: showFieldHeal,
  armor: showFieldArmor,
  sound: () => {
    sfx.setEnabled(!sfx.enabled);
    progress.audio = { ...(progress.audio ?? {}), sfx: sfx.enabled };
    saveProgress();
    syncAudioButtons();
    if (sfx.enabled) sfx.play("click");
  },
  music: () => {
    sfx.setMusic(!sfx.musicEnabled);
    progress.audio = { ...(progress.audio ?? {}), music: sfx.musicEnabled };
    saveProgress();
    syncAudioButtons();
  },
};

// 浏览器要求先有一次用户操作才能出声：第一次点击或按键时解锁音频，标题音乐随之响起。
for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, () => sfx.unlock(), { once: true, capture: true });

function syncAudioButtons() {
  $("#sound-btn").innerHTML = icon(sfx.enabled ? "sound" : "mute");
  $("#music-btn").innerHTML = icon(sfx.musicEnabled ? "music" : "music-off");
  // 手机菜单里的开关同步显示当前状态。
  const state = { music: sfx.musicEnabled, sound: sfx.enabled };
  for (const el of document.querySelectorAll("[data-menu-state]")) el.textContent = state[el.dataset.menuState] ? "开" : "关";
}
syncAudioButtons();

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
  else if (k === "g") showFieldArmor();
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
  get audio() {
    const m = sfx.music.current;
    return { state: sfx.context?.state ?? "none", track: m?.name ?? null, steps: m?.step ?? 0, sfx: sfx.enabled, music: sfx.musicEnabled };
  },
  startLevel,
  world,
  /** 直接弹出指定的说明卡（忽略“看过”记录），用于检查每张说明卡在各种屏幕上的排版。 */
  coach: (ids, ctx = {}) =>
    createCoach({ root: $("#coach-root"), enabled: () => true, seen: () => false, markSeen: () => {}, sfx })(ids, {
      slots: board?.hero.slots ?? 2,
      weapons: board?.hero.weapons ?? [],
      skills: Object.keys(board?.hero.skills ?? {}),
      ...ctx,
    }),
};

// 网页字体加载完成后重绘 3D 铭牌，让 Canvas 里的数字也用上 Inter。
document.fonts?.ready.then(() => board?.monsters.forEach((m) => world.updateMonster(m)));

enterGame();
