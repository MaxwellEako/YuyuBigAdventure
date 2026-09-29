import { MatrixView } from "./matrixView.js";
import { icon, shapeSvg, heartSvg } from "./icons.js";
import { WEAPONS, SHIELD, POTION } from "../data/weapons.js";
import { INTENT_TEXT } from "../data/monsters.js";
import { countHearts, reach } from "../logic/shapes.js";
import {
  heroAttack,
  heroHeal,
  heroShield,
  heroRetreat,
  heroWait,
  monsterTurn,
  previewAttack,
  previewCombo,
  previewInterrupt,
  interruptible,
  energyCost,
  ENERGY_MAX,
  comboLinks,
  comboLabel,
  previewHeal,
  slotOf,
  slotDef,
  slotShape,
  slotBlocked,
  heroTransform,
} from "../logic/combat.js";
import { weaponShape, weaponCooldown, UPGRADE_TEXT } from "../logic/arsenal.js";

export const GLYPH = { ink: "✹", pawn: "♟", knight: "♞", bishop: "♝", rook: "♜", queen: "♛", king: "♚" };
const MOVE_TEXT = { orth: "直行一格", diag: "斜行一格", king: "八方一格", knight: "马步跳跃" };

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const INTENT_ICON = { charge: "", heal: heartSvg("heart"), armor: heartSvg("armor"), curse: icon("cd") };

/** 招式形状画在固定高度的一行里：行数越多，格子越小，行高始终不变。 */
const INTENT_SHAPE_H = 34;
const intentCell = (shape) => Math.min(12, Math.floor((INTENT_SHAPE_H - (shape.rows - 1) * 2) / shape.rows));

/** 怪物的下一招：攻击只画形状，其他招式配一个小图标和数值。 */
function intentHtml(intent) {
  if (!intent) return "";
  const extra =
    intent.kind === "attack"
      ? shapeSvg(intent.shape, { cell: intentCell(intent.shape), gap: 2, tone: "enemy", pivot: false })
      : `<span class="intent-fx ${intent.kind}">${INTENT_ICON[intent.kind] ?? ""}${INTENT_TEXT[intent.kind](intent)}${intent.kind === "curse" ? `<i class="fx-break">${icon("combo")}</i>` : ""}</span>`;
  return `<span class="intent-label t-meta">Next</span><strong>${intent.name}</strong>${extra}`;
}

/** 怪物的特性：一眼看出该带什么武器。 */
export function monsterTraits(def) {
  const has = (kind) => def.pattern.some((p) => p.kind === kind);
  const traits = [];
  if (def.armored || has("armor")) traits.push({ key: "armor", glyph: heartSvg("armor"), label: "护甲" });
  if (has("heal")) traits.push({ key: "heal", glyph: `${heartSvg("heart")}<b class="plus">+</b>`, label: "回血" });
  if (has("charge")) traits.push({ key: "charge", glyph: icon("stagger"), label: "蓄力重击" });
  if (has("curse")) traits.push({ key: "curse", glyph: icon("cd"), label: "打断连击" });
  return traits;
}

export const traitChips = (def) =>
  monsterTraits(def)
    .map((t) => `<i class="trait ${t.key}" title="${t.label}">${t.glyph}<span>${t.label}</span></i>`)
    .join("");

/**
 * 战斗窗口：左侧怪物心阵（悬停预览 / 点击出招），右侧主角心阵（显示怪物瞄准、药水治疗）。
 * 返回的 Promise 在玩家确认战斗结果后 resolve。
 */
export function runBattle({ root, combat, monster, world, sfx, heroFirst, coach = null, afterPerfectHit = null }) {
  const def = combat.def;
  root.innerHTML = `
  <div class="battle-modal" role="dialog" aria-modal="true" aria-label="战斗">
    <div class="battle-card ${def.boss ? "boss" : ""}">
      <header class="battle-head">
        <div class="head-left">
          <div class="energy" data-energy title="充能 · 连击 ×2 起，每次连击获得 1 点"></div>
          <div class="combo-badge" data-combo title="连击">${icon("combo", "combo-icon")}<b data-combo-count></b></div>
        </div>
        <div class="turn-banner" data-banner>你的回合</div>
        <div class="round"><span class="t-meta">Round</span><b data-round>01</b></div>
      </header>
      <div class="arena">
        <section class="side enemy" data-side="enemy">
          <div class="side-head">
            <div class="avatar enemy ${def.model}">${GLYPH[def.model]}</div>
            <div class="who"><span class="t-meta">Enemy${def.boss ? " · Boss" : ""}</span><h3>${def.name}</h3><p class="traits">${def.boss ? def.title : traitChips(def) || def.title}</p></div>
            <div class="hp" data-enemy-hp></div>
          </div>
          <div class="intent"><div class="intent-main" data-intent></div><div class="pattern" data-pattern></div></div>
          <div class="matrix-box"><div data-enemy-matrix></div><div class="float-layer" data-enemy-float></div></div>
        </section>
        <div class="vs" aria-hidden="true"><span class="t-meta">VS</span></div>
        <section class="side hero" data-side="hero">
          <div class="side-head">
            <div class="avatar hero">♙</div>
            <div class="who"><span class="t-meta">Hero</span><h3>屿屿</h3><p data-hero-status>白色小兵</p></div>
            <div class="hp" data-hero-hp></div>
          </div>
          <div class="aim-note" data-aim-note></div>
          <div class="matrix-box"><div data-hero-matrix></div><div class="float-layer" data-hero-float></div></div>
        </section>
      </div>
      <footer class="battle-foot">
        <div class="weapon-bar" data-weapons role="toolbar" aria-label="武器与技能"></div>
        <div class="transform-bar" data-transform></div>
        <div class="action-bar">
          <button class="action shield" data-act="shield"></button>
          <button class="action potion" data-act="potion"></button>
          <button class="action wait" data-act="wait" title="跳过本回合">${icon("wait")}<span>等待</span><small>Z</small></button>
          <button class="action retreat" data-act="retreat">${icon("run")}<span>撤退</span></button>
        </div>
      </footer>
      <div class="battle-log" data-log aria-live="polite"></div>
      <div class="battle-toast" data-toast></div>
      <div class="battle-result" data-result hidden></div>
    </div>
  </div>`;

  const $ = (sel) => root.querySelector(sel);
  const modal = $(".battle-modal");
  modal.classList.toggle("landscape", innerHeight < 520 && innerWidth > innerHeight);
  modal.classList.toggle("portrait", innerWidth < 760 && !(innerHeight < 520 && innerWidth > innerHeight));
  // 手机横屏：心阵在左、招式在右；手机竖屏：两块心阵左右并排，各占一半宽度。
  const landscape = innerHeight < 520 && innerWidth > innerHeight;
  const narrow = innerWidth < 760 && !landscape;
  const compact = narrow || landscape;
  // 矩阵尺寸同时受宽度和高度约束，保证整张战斗卡片在一屏内。
  const maxSize = landscape
    ? Math.max(120, Math.min((innerWidth - 300) / 2, innerHeight - 150))
    : narrow
      ? Math.max(120, Math.floor((innerWidth - 44) / 2))
      : Math.max(240, Math.min(460, (innerWidth - 220) / 2.3, innerHeight - 520));
  // 怪物心阵四周的界外圈按主角武器的实际覆盖范围来留：锚点在形状左上角的武器，只需要上方和左侧的界外格。
  const enemyMargin = { top: 0, bottom: 0, left: 0, right: 0 };
  // 所有招式在所有可能朝向下的形状（武器可能被强化为可旋转、可镜像、延长）。
  const allShapes = combat.weapons.flatMap((slot) =>
    slot.kind === "skill"
      ? [slotShape(combat, slot)]
      : [0, 1, 2, 3].flatMap((rot) => [false, true].map((flip) => weaponShape(slot.id, combat.upgrades, { rot, flip }))),
  );
  for (const shape of allShapes) {
    const r = reach(shape);
    enemyMargin.top = Math.max(enemyMargin.top, r.down);
    enemyMargin.bottom = Math.max(enemyMargin.bottom, r.up);
    enemyMargin.left = Math.max(enemyMargin.left, r.right);
    enemyMargin.right = Math.max(enemyMargin.right, r.left);
  }
  // 小屏上界外只留一圈，红心才不会被压得太小。
  if (compact) for (const k of Object.keys(enemyMargin)) enemyMargin[k] = Math.min(enemyMargin[k], 1);
  // 两块心阵的外框等高；矩阵在框内居中，界外格铺满整个外框。
  for (const box of root.querySelectorAll(".matrix-box")) box.style.height = `${Math.round(maxSize)}px`;
  const enemyBox = $("[data-enemy-matrix]").parentElement;
  const heroBox = $("[data-hero-matrix]").parentElement;
  const enemyView = new MatrixView($("[data-enemy-matrix]"), { margin: enemyMargin, maxSize, side: "enemy", box: enemyBox, minCell: compact ? 12 : 22 });
  // 主角心阵只需容纳药水的十字（每边 1 格）。
  const heroView = new MatrixView($("[data-hero-matrix]"), { margin: compact ? 0 : 1, maxSize, side: "hero", box: heroBox, minCell: compact ? 12 : 22 });
  // 两块心阵共用同一个格子边长，左右的红心一样大。
  const syncSize = () => {
    const size = Math.min(
      enemyView.fitSize(combat.monsterMatrix.length, combat.monsterMatrix[0].length),
      heroView.fitSize(combat.heroMatrix.length, combat.heroMatrix[0].length),
    );
    enemyView.fixedSize = heroView.fixedSize = size;
  };
  syncSize();
  enemyView.set(combat.monsterMatrix);
  heroView.set(combat.heroMatrix);

  const heroEntity = () => world.hero;
  const monsterEntity = () => world.monsters.get(monster.uid)?.group;

  const firstReady = () => combat.weapons.find((w) => w.kind === "weapon" && !slotBlocked(combat, w))?.id;
  let selected = firstReady() ?? combat.weapons[0].id;
  let mode = "attack";
  let busy = !heroFirst;
  let hover = null;
  let done = false;
  let resolveBattle;
  let toastTimer = 0;

  requestAnimationFrame(() => modal.classList.add("open"));

  function toast(text) {
    const el = $("[data-toast]");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }

  function flyBean(count) {
    const from = $("[data-enemy-matrix]").getBoundingClientRect();
    const beans = [...$("[data-energy]").querySelectorAll(".bean.on")];
    const to = beans.at(-1)?.getBoundingClientRect() ?? $("[data-energy]").getBoundingClientRect();
    const card = $(".battle-card").getBoundingClientRect();
    for (let k = 0; k < count; k += 1) {
      const bean = document.createElement("i");
      bean.className = "flying-bean";
      bean.innerHTML = icon("energy");
      bean.style.left = `${from.left + from.width / 2 - card.left}px`;
      bean.style.top = `${from.top + from.height / 2 - card.top}px`;
      bean.style.setProperty("--dx", `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
      bean.style.setProperty("--dy", `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
      bean.style.animationDelay = `${k * 90}ms`;
      $(".battle-card").appendChild(bean);
      setTimeout(() => bean.remove(), 800 + k * 90);
    }
    setTimeout(() => {
      $("[data-energy]").classList.remove("pulse");
      void $("[data-energy]").offsetWidth;
      $("[data-energy]").classList.add("pulse");
    }, 520);
  }

  function floatText(side, text, kind) {
    const layer = $(side === "hero" ? "[data-hero-float]" : "[data-enemy-float]");
    const el = document.createElement("span");
    el.className = `float ${kind}`;
    el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  function hpHtml(matrix) {
    const { hearts, slots, armor } = countHearts(matrix);
    return `<span class="num">${hearts}</span><span class="of">/${slots}</span>${armor ? `<em class="t-meta" title="护甲心">Armor ${armor}</em>` : ""}`;
  }

  const keyLabel = (i) => (i < 9 ? String(i + 1) : i === 9 ? "0" : "");

  // 底栏的招式卡：固定尺寸的竖卡，上面是形状，下面是名字和状态；武器一组、技能一组。
  const cardCell = (shape) => {
    const n = Math.max(shape.rows, shape.cols);
    return Math.min(10, Math.floor((38 - (n - 1) * 2) / n));
  };

  function moveCard(slot, i) {
    const def = slotDef(slot);
    const blocked = slotBlocked(combat, slot);
    const up = slot.kind === "weapon" ? combat.upgrades[slot.id] ?? {} : {};
    const ups = [
      ...Object.keys(UPGRADE_TEXT)
        .filter((k) => up[k])
        .map((k) => `<i class="up-icon" title="${UPGRADE_TEXT[k].name}">${icon(UPGRADE_TEXT[k].icon)}</i>`),
      ...(def.pierce ? [`<i class="up-icon" title="破甲">${icon("pierce")}</i>`] : []),
    ].join("");
    // 中型、重型武器标出要消耗几点充能；冷却中显示沙漏。
    const cost = energyCost(slot);
    const starved = slot.kind === "weapon" && !slot.cd && cost > combat.energy;
    const status =
      slot.kind === "skill"
        ? `${icon("skill")}×${slot.charges}`
        : slot.cd
          ? `${icon("cd")}${slot.cd}`
          : cost
            ? `<span class="cost">${Array.from({ length: cost }, () => icon("energy")).join("")}</span>`
            : "";
    const shape = slotShape(combat, slot);
    // 连击中，上一击用过的招式角上画一个虚线框（和心阵上标出上一击范围的虚线一致）：换一件才接得上。
    const lastUsed = combat.combo > 0 && slot.id === combat.lastWeaponId;
    const classes = [
      "weapon",
      slot.kind,
      slot.id === selected && mode === "attack" ? "selected" : "",
      blocked ? "cooling" : "",
      lastUsed ? "last-used" : "",
      slot.kind === "skill" && slot.charges <= 0 ? "spent" : "",
      starved ? "starved" : "",
    ].join(" ");
    return `<button class="${classes}" data-weapon="${slot.id}" title="${def.name} · ${def.desc}${lastUsed ? " · 上一击所用武器，无法接续连击" : ""}">
      <kbd>${keyLabel(i)}</kbd>
      <span class="weapon-ups">${ups}</span>
      <span class="weapon-shape">${shapeSvg(shape, { cell: cardCell(shape), gap: 2, tone: slot.kind === "skill" ? "skill" : "attack" })}</span>
      <span class="weapon-name">${def.name}</span>
      <span class="weapon-cd t-meta">${status}</span>
    </button>`;
  }

  function renderWeapons() {
    const cards = combat.weapons.map((slot, i) => ({ slot, html: moveCard(slot, i) }));
    const weapons = cards.filter((c) => c.slot.kind === "weapon").map((c) => c.html).join("");
    const skills = cards.filter((c) => c.slot.kind === "skill").map((c) => c.html).join("");
    $("[data-weapons]").innerHTML = `<div class="move-group" aria-label="武器">${weapons}</div>${
      skills ? `<div class="move-group skills" aria-label="技能">${skills}</div>` : ""
    }`;
    // 选中的武器若有变形强化，显示旋转 / 镜像按钮（不消耗回合）。
    const slot = slotOf(combat, selected);
    const up = slot?.kind === "weapon" ? combat.upgrades[slot.id] ?? {} : {};
    $("[data-transform]").innerHTML = ["rotate", "mirror"]
      .filter((k) => up[k])
      .map((k) => `<button class="action transform" data-transform-kind="${k}">${icon(UPGRADE_TEXT[k].icon)}<span>${UPGRADE_TEXT[k].name}</span><small>${k === "rotate" ? "R" : "F"}</small></button>`)
      .join("");
  }

  function renderActions() {
    const shield = $("[data-act=shield]");
    shield.innerHTML = `${icon("shield")}<span>${SHIELD.name}</span><small>${
      combat.shieldUp ? "防御中" : combat.shieldCd ? `冷却 ${combat.shieldCd}` : "Q"
    }</small>`;
    shield.disabled = combat.shieldUp || combat.shieldCd > 0;
    shield.classList.toggle("up", combat.shieldUp);
    const potion = $("[data-act=potion]");
    potion.innerHTML = `${icon("potion")}<span>药水</span><b class="count">${combat.potions}</b><small>${mode === "heal" ? "Esc" : "E"}</small>`;
    potion.disabled = combat.potions <= 0;
    potion.classList.toggle("active", mode === "heal");
    const retreat = $("[data-act=retreat]");
    retreat.disabled = !combat.canRetreat;
    retreat.title = combat.canRetreat ? "承受一次追击后脱离战斗，怪物晕眩两回合" : "这一战没有退路";
  }

  function renderIntent() {
    $("[data-intent]").innerHTML =
      intentHtml(combat.intent) +
      (interruptible(combat) ? `<i class="fx-interrupt" title="重型武器单次消除不少于 3 颗红心即可打断">${icon("stagger")}</i>` : "");
    const len = def.pattern.length;
    // 招式循环画成一排小方块，当前这一招涂黑；名字放在悬停提示里。
    $("[data-pattern]").innerHTML = def.boss
      ? `<i class="unknown" title="情报不明">?</i>`
      : def.pattern
          .map((p, i) => `<i class="${i === combat.step % len ? "now" : ""} ${p.kind}" title="${p.name}"></i>`)
          .join("");
    const aimShape = combat.intent?.kind === "attack" ? combat.intent.shape : null;
    heroView.markAim(aimShape, combat.aim);
    enemyView.markHeal(combat.phase === "hero" ? combat.healPlan : null);
    const note = $("[data-aim-note]");
    if (combat.intent?.kind === "attack" && combat.aim) {
      const hits = previewAim();
      note.innerHTML = combat.shieldUp
        ? `${icon("shield")}<strong>格挡</strong><span class="aim-name">${combat.intent.name}</span>`
        : `<span class="aim-swatch"></span><strong>${combat.intent.name}</strong><b>−${hits}</b>${heartSvg("heart")}`;
      note.className = `aim-note ${combat.shieldUp ? "safe" : "danger"}`;
    } else {
      note.innerHTML = "";
      note.className = "aim-note";
    }
  }

  function previewAim() {
    let n = 0;
    for (const [dr, dc] of combat.intent.shape.offsets) {
      const r = combat.aim.r + dr;
      const c = combat.aim.c + dc;
      if (combat.heroMatrix[r]?.[c] > 0) n += 1;
    }
    return n;
  }

  // 左上角：充能一排蓝色菱形，连击标记连上之后才出现。
  function renderCombo() {
    const links = comboLinks(combat.combo);
    const badge = $("[data-combo]");
    badge.classList.toggle("on", links > 0);
    $("[data-combo-count]").textContent = links ? `×${links}` : "";
    $("[data-energy]").innerHTML = Array.from(
      { length: ENERGY_MAX },
      (_, k) => `<i class="bean ${k < combat.energy ? "on" : ""}">${icon("energy")}</i>`,
    ).join("");
  }

  function render() {
    $("[data-round]").textContent = String(combat.round).padStart(2, "0");
    $("[data-enemy-hp]").innerHTML = hpHtml(combat.monsterMatrix);
    $("[data-hero-hp]").innerHTML = hpHtml(combat.heroMatrix);
    $("[data-hero-status]").textContent = combat.shieldUp ? "防御中" : "白色小兵";
    const banner = $("[data-banner]");
    const heroTurn = combat.phase === "hero" && !busy;
    banner.textContent = heroTurn ? (mode === "heal" ? "选择治疗位置" : combat.bonus ? "追加攻击" : "你的回合") : "敌方回合";
    banner.classList.toggle("enemy-turn", !heroTurn);
    modal.classList.toggle("heal-mode", mode === "heal");
    modal.classList.toggle("locked", !heroTurn);
    renderWeapons();
    renderActions();
    renderIntent();
    renderCombo();
    enemyView.markLast(combat.combo > 0 ? combat.lastFootprint : null);
    $("[data-log]").innerHTML = combat.log
      .slice(-3)
      .map((line, i, arr) => `<p class="${i === arr.length - 1 ? "latest" : ""}">${line}</p>`)
      .join("");
    refreshPreview();
  }

  function refreshPreview() {
    enemyView.clearPreview();
    heroView.clearPreview();
    enemyView.el.classList.remove("pv-perfect", "pv-link");
    $(".intent").classList.remove("will-interrupt");
    $("[data-combo]").classList.remove("at-risk", "rising");
    if (!hover || busy || combat.phase !== "hero") return;
    if (mode === "attack" && hover.side === "enemy") {
      const slot = slotOf(combat, selected);
      const hits = previewAttack(combat, selected, hover.r, hover.c);
      const ready = !slotBlocked(combat, slot);
      enemyView.preview(slotShape(combat, slot), hover.r, hover.c, hits, { valid: ready && hits.length > 0 });
      const outcome = ready && hits.length ? previewCombo(combat, selected, hover.r, hover.c) : null;
      enemyView.el.classList.toggle("pv-perfect", outcome && outcome !== "break");
      enemyView.el.classList.toggle("pv-link", outcome === "link");
      if (ready && hits.length && previewInterrupt(combat, selected, hover.r, hover.c)) $(".intent").classList.add("will-interrupt");
      // 连击中：这一击能接上，标记亮起；落空或离上一击太远，标记变成虚线。
      if (outcome && comboLinks(combat.combo)) $("[data-combo]").classList.add(outcome === "link" ? "rising" : "at-risk");
    }
    if (mode === "heal" && hover.side === "hero") {
      const heals = previewHeal(combat, hover.r, hover.c);
      heroView.preview(POTION.shape, hover.r, hover.c, heals, { tone: "heal", valid: heals.length > 0 });
    }
  }

  enemyView.onHover = (r, c) => {
    hover = { side: "enemy", r, c };
    refreshPreview();
  };
  heroView.onHover = (r, c) => {
    hover = { side: "hero", r, c };
    refreshPreview();
  };
  enemyView.onLeave = heroView.onLeave = () => {
    hover = null;
    refreshPreview();
  };
  enemyView.onPick = (r, c) => {
    if (mode === "heal") return toast("药水只能用于屿屿的红心矩阵");
    attack(r, c);
  };
  heroView.onPick = (r, c) => {
    if (mode === "heal") heal(r, c);
    else toast("请在怪物的红心矩阵上选择攻击位置");
  };

  function selectWeapon(id) {
    if (busy || combat.phase !== "hero") return;
    const slot = slotOf(combat, id);
    if (!slot) return;
    const blocked = slotBlocked(combat, slot);
    if (blocked) {
      sfx.play("invalid");
      return toast(blocked);
    }
    selected = id;
    mode = "attack";
    sfx.play("click");
    render();
  }

  async function attack(r, c) {
    if (busy || combat.phase !== "hero") return;
    const result = heroAttack(combat, selected, r, c);
    if (!result.ok) {
      sfx.play("invalid");
      enemyView.shake();
      return toast(result.reason);
    }
    busy = true;
    hover = null;
    const [event] = result.events;
    const broken = event.hits.filter((h) => h.after === 0).length;
    const cracked = event.hits.length - broken;
    // 挥击声分三种：技能、四格以上的重武器、其余轻武器。
    const usedSlot = slotOf(combat, selected);
    const weight = usedSlot.kind === "skill" ? "skill" : WEAPONS[usedSlot.id].weight;
    const heavy = weight === "heavy";
    sfx.play({ skill: "swing-skill", heavy: "swing-heavy", medium: "swing-medium", light: "swing-light" }[weight]);
    const heroObj = heroEntity();
    const target = monsterEntity();
    if (heroObj && target) world.attackAnim(heroObj, target, broken);
    render();
    // 形状先闪一下；重击再顿一拍（打击停顿），碎裂才更有分量。
    enemyView.strike(combat.lastFootprint, { heavy });
    await delay(heavy ? 260 : 140);
    if (heavy) {
      sfx.play("impact", event.hits.length);
      modal.classList.remove("impact");
      void modal.offsetWidth;
      modal.classList.add("impact");
    }
    if (broken) sfx.play("shatter", broken);
    if (cracked) sfx.play("crack");
    floatText("enemy", `-${event.hits.length}`, heavy ? "dmg big" : "dmg");
    enemyView.shake(heavy);
    await enemyView.animate(event.hits, "hit", combat.monsterMatrix, { heavy });
    const comboEvent = result.events.find((e) => e.type === "combo");
    const links = comboEvent ? comboLinks(comboEvent.combo) : 0;
    if (links) {
      sfx.play("combo", links);
      floatText("enemy", comboLabel(links), "combo");
      $("[data-combo]").classList.remove("pulse");
      void $("[data-combo]").offsetWidth;
      $("[data-combo]").classList.add("pulse");
      if (comboEvent.energy) {
        // 得到充能：一颗蓝色菱形从心阵飞向左上角的能量条。
        setTimeout(() => {
          sfx.play("energy", comboEvent.energy);
          flyBean(comboEvent.energy);
        }, 180);
      }
    } else if (result.events.some((e) => e.type === "combo-break")) {
      floatText("enemy", "连击中断", "miss");
      sfx.play("combo-break");
    }
    if (result.events.some((e) => e.type === "interrupt")) {
      sfx.play("stun");
      setTimeout(() => floatText("enemy", "打断！", "chase"), 420);
    }
    const drained = result.events.find((e) => e.type === "heal" && e.side === "hero");
    if (drained) {
      sfx.play("heal");
      floatText("hero", `+${drained.changes.length}`, "heal");
      await heroView.animate(drained.changes, "heal", combat.heroMatrix);
    }
    if (result.events.some((e) => e.type === "won")) return finish();
    // 第一次完美命中、心阵上出现蓝色虚线框：这时候才讲连击。
    if (afterPerfectHit && combat.combo > 0) {
      const explainCombo = afterPerfectHit;
      afterPerfectHit = null;
      render();
      await explainCombo();
    }
    if (combat.phase === "hero") {
      // 疾风斩之后：仍是主角回合，换一件可用的普通武器。
      if (slotBlocked(combat, slotOf(combat, selected))) selected = firstReady() ?? selected;
      busy = false;
      render();
      return;
    }
    await delay(250);
    await enemyPhase();
  }

  async function heal(r, c) {
    if (busy || combat.phase !== "hero") return;
    const result = heroHeal(combat, r, c);
    if (!result.ok) {
      sfx.play("invalid");
      return toast(result.reason);
    }
    busy = true;
    mode = "attack";
    hover = null;
    sfx.play("heal");
    render();
    floatText("hero", `+${result.events[0].changes.length}`, "heal");
    await heroView.animate(result.events[0].changes, "heal", combat.heroMatrix);
    await delay(250);
    await enemyPhase();
  }

  function shield() {
    if (busy) return;
    const result = heroShield(combat);
    if (!result.ok) {
      sfx.play("invalid");
      return toast(result.reason);
    }
    sfx.play("shield");
    render();
  }

  async function wait() {
    if (busy) return;
    const result = heroWait(combat);
    if (!result.ok) return;
    busy = true;
    floatText("hero", "等待", "miss");
    render();
    await delay(200);
    await enemyPhase();
  }

  async function retreat() {
    if (busy) return;
    const result = heroRetreat(combat);
    if (!result.ok) {
      sfx.play("invalid");
      return toast(result.reason);
    }
    busy = true;
    render();
    await delay(200);
    await enemyPhase();
  }

  async function enemyPhase() {
    busy = true;
    render();
    await delay(heroFirst || combat.round > 1 ? 380 : 650);
    const linksBefore = comboLinks(combat.combo);
    const result = monsterTurn(combat);
    const heroObj = heroEntity();
    const target = monsterEntity();
    for (const event of result.events) {
      if (event.type === "monster-attack") {
        if (target && heroObj) world.attackAnim(target, heroObj, event.hits.length);
        await delay(170);
        if (event.blocked) {
          sfx.play("block");
          floatText("hero", "格挡", "block");
          $('[data-side="hero"]').classList.add("blocked");
          setTimeout(() => $('[data-side="hero"]')?.classList.remove("blocked"), 700);
          await delay(500);
        } else if (event.hits.length) {
          sfx.play("hurt");
          floatText("hero", `-${event.hits.length}`, "dmg");
          heroView.shake();
          modal.classList.add("hurt");
          setTimeout(() => modal.classList.remove("hurt"), 400);
          await heroView.animate(event.hits, "hit", combat.heroMatrix);
        } else {
          floatText("hero", "未命中", "miss");
          await delay(400);
        }
      } else if (event.type === "charge") {
        sfx.play("charge");
        floatText("enemy", "蓄力", "charge");
        $('[data-side="enemy"]').classList.add("charging");
        setTimeout(() => $('[data-side="enemy"]')?.classList.remove("charging"), 900);
        await delay(650);
      } else if (event.type === "heal") {
        sfx.play("pray");
        if (event.changes.length) floatText("enemy", `+${event.changes.length}`, "heal");
        await enemyView.animate(event.changes, "heal", combat.monsterMatrix);
      } else if (event.type === "armor") {
        sfx.play("fortify");
        floatText("enemy", "护甲", "armor");
        await enemyView.animate(event.changes, "armor", combat.monsterMatrix);
      } else if (event.type === "interrupted") {
        sfx.play("block");
        floatText("enemy", "被打断", "charge");
        await delay(650);
      } else if (event.type === "stunned") {
        sfx.play("stun");
        floatText("enemy", "定身", "charge");
        await delay(650);
      } else if (event.type === "curse") {
        sfx.play(event.blocked ? "block" : "curse");
        floatText("hero", event.blocked ? "格挡" : "冷却 +1", event.blocked ? "block" : "curse");
        if (!event.blocked && linksBefore) setTimeout(() => floatText("enemy", "连击中断", "miss"), 200);
        await delay(550);
      }
    }
    enemyView.set(combat.monsterMatrix);
    heroView.set(combat.heroMatrix);
    if (combat.phase !== "hero") return finish();
    if (slotBlocked(combat, slotOf(combat, selected))) selected = firstReady() ?? selected;
    busy = false;
    render();
  }

  function finish() {
    busy = true;
    render();
    const box = $("[data-result]");
    const outcome = combat.phase;
    const text = {
      won: ["胜利", combat.stats.taken ? `${def.name}被击败。本场战斗损失 ${combat.stats.taken} 颗红心。` : `${def.name}被击败。屿屿未损失红心。`, "继续"],
      lost: ["战斗失败", "屿屿的红心已全部消除。", "查看结果"],
      fled: ["撤退成功", `${def.name}晕眩两回合。`, "返回棋盘"],
    }[outcome];
    sfx.play(outcome === "won" ? "victory" : outcome === "lost" ? "defeat" : "step");
    box.className = `battle-result ${outcome}`;
    const meta = { won: "Victory", lost: "Defeat", fled: "Retreat" }[outcome];
    box.innerHTML = `<div class="result-inner"><p class="t-meta">${meta} · Round ${String(combat.round).padStart(2, "0")}</p><h2>${text[0]}</h2><p>${text[1]}</p><button class="primary" data-continue autofocus>${text[2]}<span aria-hidden="true">→</span></button></div>`;
    box.hidden = false;
    box.querySelector("[data-continue]").addEventListener("click", close);
    setTimeout(() => box.querySelector("[data-continue]")?.focus(), 50);
  }

  function close() {
    if (done) return;
    done = true;
    document.removeEventListener("keydown", onKey);
    modal.classList.remove("open");
    modal.classList.add("closing");
    setTimeout(() => {
      root.innerHTML = "";
      resolveBattle(combat);
    }, 260);
  }

  function onKey(e) {
    if (done) return;
    if (!$("[data-result]").hidden) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        close();
      }
      return;
    }
    const digit = "1234567890".indexOf(e.key);
    if (digit >= 0 && digit < combat.weapons.length) selectWeapon(combat.weapons[digit].id);
    else if (e.key === "r" || e.key === "R") transform("rotate");
    else if (e.key === "f" || e.key === "F") transform("mirror");
    else if (e.key === "q" || e.key === "Q") shield();
    else if (e.key === "z" || e.key === "Z") wait();
    else if (e.key === "e" || e.key === "E") togglePotion();
    else if (e.key === "Escape" && mode === "heal") {
      mode = "attack";
      render();
    }
  }

  function togglePotion() {
    if (busy || combat.phase !== "hero") return;
    if (combat.potions <= 0) {
      sfx.play("invalid");
      return toast("药水已用尽");
    }
    mode = mode === "heal" ? "attack" : "heal";
    sfx.play("click");
    render();
  }

  function transform(kind) {
    if (busy || combat.phase !== "hero") return;
    const result = heroTransform(combat, selected, kind);
    if (!result.ok) {
      sfx.play("invalid");
      return toast(result.reason);
    }
    sfx.play("click");
    render();
  }

  $("[data-transform]").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-transform-kind]");
    if (btn) transform(btn.dataset.transformKind);
  });
  $("[data-weapons]").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-weapon]");
    if (btn) selectWeapon(btn.dataset.weapon);
  });
  $("[data-act=shield]").addEventListener("click", shield);
  $("[data-act=potion]").addEventListener("click", togglePotion);
  $("[data-act=retreat]").addEventListener("click", retreat);
  $("[data-act=wait]").addEventListener("click", wait);
  modal.addEventListener("contextmenu", (e) => {
    if (mode === "heal") {
      e.preventDefault();
      mode = "attack";
      render();
    }
  });
  document.addEventListener("keydown", onKey);

  render();
  // 招式很多时底部会折成两行：若整张卡片超出屏幕，就把两块心阵的外框压矮，再按新尺寸重建。
  const card = $(".battle-card");
  const overflow = card.getBoundingClientRect().height - (innerHeight - 24);
  if (overflow > 0 && !compact) {
    const height = Math.max(200, Math.round(maxSize - overflow));
    for (const box of root.querySelectorAll(".matrix-box")) box.style.height = `${height}px`;
    syncSize();
    enemyView.relayout();
    heroView.relayout();
    render();
  }
  (async () => {
    if (coach) {
      busy = true;
      render();
      await coach();
    }
    if (!heroFirst) enemyPhase();
    else {
      busy = false;
      render();
    }
  })();

  return new Promise((resolve) => {
    resolveBattle = resolve;
  });
}

export { MOVE_TEXT };
