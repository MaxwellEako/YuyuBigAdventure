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
  previewPerfect,
  comboLinks,
  comboLabel,
  previewHeal,
  slotOf,
  slotDef,
  slotShape,
  slotBlocked,
  heroTransform,
} from "../logic/combat.js";
import { weaponShape, UPGRADE_TEXT } from "../logic/arsenal.js";

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

/**
 * 战斗窗口：左侧怪物心阵（悬停预览 / 点击出招），右侧主角心阵（显示怪物瞄准、药水治疗）。
 * 返回的 Promise 在玩家确认战斗结果后 resolve。
 */
export function runBattle({ root, combat, monster, world, sfx, heroFirst, coach = null }) {
  const def = combat.def;
  root.innerHTML = `
  <div class="battle-modal" role="dialog" aria-modal="true" aria-label="战斗">
    <div class="battle-card ${def.boss ? "boss" : ""}">
      <header class="battle-head">
        <div class="combo-badge" data-combo title="连击 · 每连上两次追击一次">${icon("combo", "combo-icon")}<b data-combo-count></b><span class="chase-pips" data-pips><i></i><i></i></span></div>
        <div class="turn-banner" data-banner>你的回合</div>
        <div class="round"><span class="t-meta">Round</span><b data-round>01</b></div>
      </header>
      <div class="arena">
        <section class="side enemy" data-side="enemy">
          <div class="side-head">
            <div class="avatar enemy ${def.model}">${GLYPH[def.model]}</div>
            <div class="who"><span class="t-meta">Enemy${def.boss ? " · Boss" : ""}</span><h3>${def.name}</h3><p>${def.title}</p></div>
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
  const narrow = innerWidth < 760;
  // 矩阵尺寸同时受宽度和高度约束，保证整张战斗卡片在一屏内。
  const maxSize = narrow
    ? Math.min(innerWidth - 96, 330)
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
  // 两块心阵的外框等高；矩阵在框内居中，界外格铺满整个外框。
  for (const box of root.querySelectorAll(".matrix-box")) box.style.height = `${Math.round(maxSize)}px`;
  const enemyBox = $("[data-enemy-matrix]").parentElement;
  const heroBox = $("[data-hero-matrix]").parentElement;
  const enemyView = new MatrixView($("[data-enemy-matrix]"), { margin: enemyMargin, maxSize, side: "enemy", box: enemyBox });
  // 主角心阵只需容纳药水的十字（每边 1 格）。
  const heroView = new MatrixView($("[data-hero-matrix]"), { margin: 1, maxSize, side: "hero", box: heroBox });
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

  function renderWeapons() {
    $("[data-weapons]").innerHTML = combat.weapons
      .map((slot, i) => {
        const def = slotDef(slot);
        const blocked = slotBlocked(combat, slot);
        const up = slot.kind === "weapon" ? combat.upgrades[slot.id] ?? {} : {};
        const tags = Object.keys(UPGRADE_TEXT)
          .filter((k) => up[k])
          .map((k) => `<i class="up-icon" title="${UPGRADE_TEXT[k].name}">${icon(UPGRADE_TEXT[k].icon)}</i>`)
          .join("");
        const status =
          slot.kind === "skill"
            ? `${icon("skill")}×${slot.charges}`
            : slot.cd
              ? `${icon("cd")}${slot.cd}`
              : def.cooldown
                ? `${icon("cd")}${def.cooldown}`
                : "";
        return `<button class="weapon ${slot.kind} ${slot.id === selected && mode === "attack" ? "selected" : ""} ${blocked ? "cooling" : ""}" data-weapon="${slot.id}" title="${def.name} · ${def.desc}">
          <kbd>${keyLabel(i)}</kbd>
          <span class="weapon-shape">${shapeSvg(slotShape(combat, slot), { cell: 10, tone: slot.kind === "skill" ? "skill" : "attack" })}</span>
          <span class="weapon-name">${def.name}${def.pierce ? `<i class="up-icon" title="破甲">${icon("pierce")}</i>` : ""}${tags}</span>
          <span class="weapon-cd t-meta">${status}</span>
        </button>`;
      })
      .join("");
    // 选中的武器若有变形强化，显示旋转 / 镜像按钮（不消耗回合）。
    const slot = slotOf(combat, selected);
    const up = slot?.kind === "weapon" ? combat.upgrades[slot.id] ?? {} : {};
    $("[data-transform]").innerHTML = ["rotate", "mirror"]
      .filter((k) => up[k])
      .map((k) => `<button class="action transform" data-transform-kind="${k}">${k === "rotate" ? "⟳" : "⇋"}<span>${UPGRADE_TEXT[k].name}</span><small>${k === "rotate" ? "R" : "F"}</small></button>`)
      .join("");
  }

  function renderActions() {
    const shield = $("[data-act=shield]");
    shield.innerHTML = `${icon("shield")}<span>${SHIELD.name}</span><small>${
      combat.shieldUp ? "已举起" : combat.shieldCd ? `冷却 ${combat.shieldCd}` : "Q"
    }</small>`;
    shield.disabled = combat.shieldUp || combat.shieldCd > 0;
    shield.classList.toggle("up", combat.shieldUp);
    const potion = $("[data-act=potion]");
    potion.innerHTML = `${icon("potion")}<span>药水 ×${combat.potions}</span><small>${mode === "heal" ? "Esc" : "E"}</small>`;
    potion.disabled = combat.potions <= 0;
    potion.classList.toggle("active", mode === "heal");
    const retreat = $("[data-act=retreat]");
    retreat.disabled = !combat.canRetreat;
    retreat.title = combat.canRetreat ? "挨一次追击后脱身，怪物晕眩两回合" : "这一战没有退路";
  }

  function renderIntent() {
    $("[data-intent]").innerHTML = intentHtml(combat.intent);
    const len = def.pattern.length;
    // 招式循环画成一排小方块，当前这一招涂黑；名字放在悬停提示里。
    $("[data-pattern]").innerHTML = def.boss
      ? `<i class="unknown" title="情报不明">?</i>`
      : def.pattern
          .map((p, i) => `<i class="${i === combat.step % len ? "now" : ""} ${p.kind}" title="${p.name}"></i>`)
          .join("");
    const aimShape = combat.intent?.kind === "attack" ? combat.intent.shape : null;
    heroView.markAim(aimShape, combat.aim);
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

  // 左上角的连击标记：连上之后才出现，旁边两个小方块是距离下一次追击的进度。
  function renderCombo() {
    const links = comboLinks(combat.combo);
    const badge = $("[data-combo]");
    badge.classList.toggle("on", links > 0);
    $("[data-combo-count]").textContent = links ? `×${links}` : "";
    const filled = combat.combo >= 1 ? (combat.combo - 1) % 2 : 0;
    $("[data-pips]").querySelectorAll("i").forEach((pip, i) => pip.classList.toggle("on", i < filled));
  }

  function render() {
    $("[data-round]").textContent = String(combat.round).padStart(2, "0");
    $("[data-enemy-hp]").innerHTML = hpHtml(combat.monsterMatrix);
    $("[data-hero-hp]").innerHTML = hpHtml(combat.heroMatrix);
    $("[data-hero-status]").textContent = combat.shieldUp ? "木盾已举起" : "白色小兵";
    const banner = $("[data-banner]");
    const heroTurn = combat.phase === "hero" && !busy;
    banner.textContent = heroTurn ? (mode === "heal" ? "选择治疗位置" : combat.bonus ? "再攻击一次" : "你的回合") : "敌方回合";
    banner.classList.toggle("enemy-turn", !heroTurn);
    modal.classList.toggle("heal-mode", mode === "heal");
    modal.classList.toggle("locked", !heroTurn);
    renderWeapons();
    renderActions();
    renderIntent();
    renderCombo();
    $("[data-log]").innerHTML = combat.log
      .slice(-3)
      .map((line, i, arr) => `<p class="${i === arr.length - 1 ? "latest" : ""}">${line}</p>`)
      .join("");
    refreshPreview();
  }

  function refreshPreview() {
    enemyView.clearPreview();
    heroView.clearPreview();
    enemyView.el.classList.remove("pv-perfect");
    $("[data-combo]").classList.remove("at-risk", "rising");
    if (!hover || busy || combat.phase !== "hero") return;
    if (mode === "attack" && hover.side === "enemy") {
      const slot = slotOf(combat, selected);
      const hits = previewAttack(combat, selected, hover.r, hover.c);
      const ready = !slotBlocked(combat, slot);
      enemyView.preview(slotShape(combat, slot), hover.r, hover.c, hits, { valid: ready && hits.length > 0 });
      const perfect = ready && previewPerfect(combat, selected, hover.r, hover.c);
      enemyView.el.classList.toggle("pv-perfect", perfect);
      // 连击中：这一击能接上，标记亮起；接不上，标记变成虚线。
      if (ready && hits.length && comboLinks(combat.combo)) $("[data-combo]").classList.add(perfect ? "rising" : "at-risk");
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
    if (mode === "heal") return toast("药水要用在自己的心阵上");
    attack(r, c);
  };
  heroView.onPick = (r, c) => {
    if (mode === "heal") heal(r, c);
    else toast("攻击要落在怪物的心阵上");
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
    sfx.play("slash");
    const heroObj = heroEntity();
    const target = monsterEntity();
    if (heroObj && target) world.attackAnim(heroObj, target, broken);
    render();
    await delay(160);
    sfx.play("shatter", event.hits.length);
    floatText("enemy", `-${event.hits.length}`, "dmg");
    enemyView.shake();
    await enemyView.animate(event.hits, "hit", combat.monsterMatrix);
    const comboEvent = result.events.find((e) => e.type === "combo");
    const links = comboEvent ? comboLinks(comboEvent.combo) : 0;
    if (links) {
      sfx.play(comboEvent.chase ? "victory" : "pickup");
      floatText("enemy", comboLabel(links), "combo");
      if (comboEvent.chase) setTimeout(() => floatText("enemy", "追击！", "chase"), 260);
      $("[data-combo]").classList.remove("pulse");
      void $("[data-combo]").offsetWidth;
      $("[data-combo]").classList.add("pulse");
    } else if (result.events.some((e) => e.type === "combo-break")) {
      floatText("enemy", "连击中断", "miss");
    }
    const drained = result.events.find((e) => e.type === "heal" && e.side === "hero");
    if (drained) {
      sfx.play("heal");
      floatText("hero", `+${drained.changes.length}`, "heal");
      await heroView.animate(drained.changes, "heal", combat.heroMatrix);
    }
    if (result.events.some((e) => e.type === "won")) return finish();
    if (combat.phase === "hero") {
      // 追击（连击里程碑）或疾风斩之后：仍是主角回合，换一件可用的普通武器。
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
        sfx.play("heal");
        if (event.changes.length) floatText("enemy", `+${event.changes.length}`, "heal");
        await enemyView.animate(event.changes, "heal", combat.monsterMatrix);
      } else if (event.type === "armor") {
        sfx.play("block");
        floatText("enemy", "护甲", "armor");
        await enemyView.animate(event.changes, "armor", combat.monsterMatrix);
      } else if (event.type === "stunned") {
        sfx.play("block");
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
      won: ["胜利", combat.stats.taken ? `${def.name}倒下了。这一战失去 ${combat.stats.taken} 颗红心。` : `${def.name}倒下了。屿屿毫发无伤。`, "继续"],
      lost: ["战斗失败", "屿屿的红心全部碎了。", "查看结果"],
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
      return toast("药水已用完");
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
  if (overflow > 0 && !narrow) {
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
