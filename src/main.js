import "./style.css";
import { LEVELS, DIRECTIONS, samePosition } from "./game/levels.js";
import { PuzzleEngine } from "./game/engine.js";
import { IslandWorld } from "./game/world.js";
import { GameAudio } from "./game/audio.js";
import { icon, foxLogo } from "./icons.js";
import { thumbnail } from "./thumbnails.js";
import { readProgress, writeProgress } from "./storage.js";

/** 页面采用原生 DOM；只有少量动态文本，无需为单页游戏引入 UI 框架。 */
document.querySelector("#app").innerHTML = `
  <aside class="rail" aria-label="主导航">
    <button class="brand-mark" data-action="home" aria-label="屿屿大冒险首页">${foxLogo}</button>
    <div class="rail-line"></div>
    <nav class="rail-nav">
      <button class="rail-button active" data-action="home" aria-label="探索小岛" title="探索小岛">${icon("compass")}<span>探索</span></button>
      <button class="rail-button" data-action="map" aria-label="冒险地图" title="冒险地图">${icon("map")}<span>地图</span></button>
      <button class="rail-button" data-action="collection" aria-label="旅途收藏" title="旅途收藏">${icon("trophy")}<span>收藏</span></button>
    </nav>
    <div class="rail-bottom"><span class="vertical-note">A LITTLE ADVENTURE</span><button class="rail-button" data-action="help" aria-label="冒险手册" title="冒险手册">${icon("book")}</button><span class="version">v1.0</span></div>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <a href="./" class="wordmark">屿屿大冒险<span>YUYU'S LITTLE ADVENTURE</span></a>
      <div class="topbar-right"><span class="demo-badge"><i></i> 独立解谜 · 试玩版</span><span class="topbar-divider"></span><button class="icon-button" data-action="sound" aria-label="关闭音效" title="关闭音效" id="sound-button">${icon("volume")}</button><button class="manual-button" data-action="help">冒险手册 ${icon("arrow")}</button></div>
    </header>
    <main>
      <section class="page-intro">
        <div><div class="eyebrow"><span></span> A SMALL WORLD. A BIG LITTLE JOURNEY.</div><h1>小岛，大大的奇遇<span>。</span></h1></div>
        <p>放慢脚步，让好奇心带路。<br><span>五座小岛，藏着五个小小的答案。</span></p>
      </section>
      <section class="game-stage" aria-label="游戏区域">
        <aside class="chapter-panel">
          <div class="chapter-label"><span id="chapter-number">CHAPTER 01</span><span class="chapter-tag" id="chapter-tag">推箱 · 压板</span></div>
          <h2 id="level-title">风起林间</h2>
          <span class="english-name" id="level-english">WHISPERING WOODS</span>
          <p class="chapter-description" id="level-description"></p>
          <div class="quest-header"><h3>本关目标</h3><span id="quest-count">0 / 3</span></div>
          <ol class="quest-list" id="quest-list"></ol>
          <div class="clue" id="clue" hidden></div>
          <div class="chapter-bottom"><div class="companion"><div class="companion-avatar">${foxLogo}</div><div><strong>屿屿已经准备好了</strong><span>走慢一点也没关系。</span></div><span class="tiny-spark">✧</span></div>
          <button class="hint-button" data-action="hint">${icon("hint")}<span>给我一点灵感</span><kbd>H</kbd></button></div>
        </aside>
        <div class="scene-wrap" id="scene-wrap">
          <div class="world-topline"><span class="location-label" id="location-label">${icon("sun")} 落叶森林 <span>·</span> 晴</span><div class="stats"><span class="stat" title="本关记忆碎片">${icon("gem")}<b id="gem-count">0</b><span>/ 3</span></span><span class="stat time-stat" title="探索时间">${icon("clock")}<b id="timer">00:00</b></span><span class="stat steps-stat" title="行动次数">${icon("steps")}<b id="steps">0</b></span></div></div>
          <div id="world" class="world"></div>
          <div class="scene-caption"><span class="live-dot"></span><span id="scene-caption">一段旅程，从好奇开始。</span></div>
          <div class="view-actions"><button class="icon-button" data-action="rotate" aria-label="转动视角" title="转动视角（C）">${icon("rotate")}</button><button class="icon-button fullscreen-button" data-action="fullscreen" aria-label="全屏游玩" title="全屏游玩">${icon("expand")}</button></div>
          <div class="hint-popover" id="hint-popover" hidden><div><strong>${icon("hint")} 林间的小提示</strong><button class="icon-button small" data-action="close-hint" aria-label="关闭提示">${icon("close")}</button></div><p id="hint-text"></p><span id="hint-progress"></span></div>
          <div class="toast" id="toast" role="status" aria-live="polite"></div>
          <div class="touch-controls" aria-label="触屏控制"><div class="dpad"><button data-move="up" aria-label="向上移动">↑</button><button data-move="left" aria-label="向左移动">←</button><button data-move="down" aria-label="向下移动">↓</button><button data-move="right" aria-label="向右移动">→</button></div><button class="touch-interact" data-action="interact" aria-label="与机关交互">E</button></div>
        </div>
        <footer class="control-bar"><div class="control-group"><span class="key-group"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span class="or">/</span><span class="arrow-keys">↑ ← ↓ →</span></span><span>移动</span><i></i><kbd>E</kbd><span id="interact-label">交互</span><i></i><kbd>Z</kbd><span>撤销</span></div><div class="control-actions"><button data-action="undo">${icon("undo")}<span>退一步</span></button><button data-action="reset">${icon("reset")}<span>重新开始</span><kbd>R</kbd></button></div></footer>
      </section>
      <section class="journey" id="journey" aria-labelledby="journey-title"><div class="journey-heading"><h2 id="journey-title">小岛旅行手记 <span>THE JOURNEY</span></h2><span class="journey-progress"><span id="completed-count">0</span> / 5 座小岛已探索 <span class="progress-track"><i id="progress-fill"></i></span></span></div><div class="level-cards" id="level-cards"></div></section>
    </main>
    <footer class="page-footer"><span>${icon("leaf")} 不必急着抵达，解谜的过程也是风景。</span><span>MADE OF PIXELS & A LITTLE CURIOSITY <span class="footer-flower">✳</span></span></footer>
  </div>
  <dialog id="dialog" class="dialog"><button class="dialog-close icon-button" data-action="close-dialog" aria-label="关闭对话框">${icon("close")}</button><div id="dialog-content"></div></dialog>
`;

const $ = (selector) => document.querySelector(selector);
const audio = new GameAudio();
let progress = readProgress();
let levelIndex = 0;
let engine;
let world;
let elapsed = 0;
let started = false;
let hintCount = 0;
let toastTimeout;
let winTimeout;
const dialog = $("#dialog");
// 对话框属于游戏区域，进入局部全屏后仍能显示通关反馈和手册。
$(".game-stage").append(dialog);
const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const unlocked = (index) => index === 0 || Boolean(progress[index - 1]);

/** 对可访问状态逐项更新，避免移动时重建整个页面，打断焦点或屏幕阅读器。 */
function updateUI() {
  const { state, level } = engine;
  $("#gem-count").textContent = state.collected.length;
  $("#steps").textContent = state.steps;
  const tasks = [
    engine.solved,
    state.collected.length === level.crystals.length,
    state.won,
  ];
  $("#quest-count").textContent = `${tasks.filter(Boolean).length} / 3`;
  $("#quest-list").innerHTML = level.tasks
    .map(
      (task, index) =>
        `<li class="${tasks[index] ? "done" : ""}"><span class="quest-check">${tasks[index] ? icon("check") : ""}</span><span>${task}</span></li>`,
    )
    .join("");
  $("#scene-wrap").classList.toggle("night", Boolean(state.phase));
  const location = ["落叶森林", "日光遗迹", "回声庭院", "薄荷冰原", "暮光群岛"][
    levelIndex
  ];
  $("#location-label").innerHTML =
    `${icon(state.phase ? "moon" : "sun")} ${location} <span>·</span> ${state.phase ? "夜" : "晴"}`;
  if (level.type === "sequence")
    $("#clue").innerHTML =
      `<span>石碑上的歌谣</span><strong>${level.clue}</strong><small>已奏响 ${state.sequence.length} / 4 个音符</small>`;
  $("#scene-caption").textContent = state.won
    ? "小岛记住了你的脚步。"
    : engine.solved
      ? "机关已唤醒，带着碎片走向石门吧。"
      : engine.level.tasks[0];
}

function renderCards() {
  $("#level-cards").innerHTML = LEVELS.map((level, index) => {
    const available = unlocked(index);
    const complete = Boolean(progress[index]);
    return `<button class="level-card ${index === levelIndex ? "selected" : ""} ${!available ? "locked" : ""} ${complete ? "complete" : ""}" data-level="${index}" aria-label="${index + 1}. ${level.name}，${available ? (complete ? "已通关，可重玩" : "可探索") : "需要先完成上一关"}" aria-current="${index === levelIndex ? "step" : "false"}"><span class="thumbnail-wrap" style="--island-tint:${level.color}18">${thumbnail(level)}</span><span class="card-copy"><span class="card-number">ISLAND ${String(index + 1).padStart(2, "0")}<span class="difficulty">${"▮".repeat(level.difficulty)}${"<i>▮</i>".repeat(3 - level.difficulty)}</span></span><strong>${level.name}</strong><span class="card-mechanic">${level.mechanic}</span><span class="card-state">${complete ? `${icon("check")} 已留下足迹` : index === levelIndex ? "<i></i> 正在探索" : available ? "等待出发" : `${icon("lock")} 尚未抵达`}</span></span></button>`;
  }).join("");
  const count = Object.keys(progress).length;
  $("#completed-count").textContent = count;
  $("#progress-fill").style.width = `${(count / LEVELS.length) * 100}%`;
}

function loadLevel(index) {
  clearTimeout(winTimeout);
  levelIndex = index;
  engine = new PuzzleEngine(LEVELS[index]);
  $(".game-stage").dataset.puzzle = engine.level.type;
  elapsed = 0;
  started = false;
  hintCount = 0;
  $("#timer").textContent = "00:00";
  $("#chapter-number").textContent =
    `CHAPTER ${String(index + 1).padStart(2, "0")}`;
  $("#chapter-tag").textContent = engine.level.mechanic;
  $("#level-title").textContent = engine.level.name;
  $("#level-english").textContent = engine.level.english;
  $("#level-description").textContent = engine.level.description;
  $("#interact-label").textContent =
    engine.level.type === "phase" ? "切换昼夜" : "交互";
  $("#clue").hidden = engine.level.type !== "sequence";
  $("#hint-popover").hidden = true;
  $("#toast").classList.remove("show");
  world?.load(engine);
  updateUI();
  renderCards();
}

function toast(message) {
  clearTimeout(toastTimeout);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimeout = setTimeout(() => $("#toast").classList.remove("show"), 3600);
}

function showDialog(content) {
  $("#dialog-content").innerHTML = content;
  if (!dialog.open) dialog.showModal();
}

/** 通关存档记录真实步数和时间；重玩只覆盖更少步数的成绩。 */
function completeLevel() {
  audio.play("win");
  const old = progress[levelIndex];
  if (
    !old ||
    engine.state.steps < old.steps ||
    (engine.state.steps === old.steps && elapsed < old.seconds)
  ) {
    progress[levelIndex] = {
      steps: engine.state.steps,
      seconds: Math.floor(elapsed),
    };
  }
  const saved = writeProgress(progress);
  renderCards();
  const finished = levelIndex === LEVELS.length - 1;
  winTimeout = setTimeout(
    () => {
      showDialog(
        `<div class="win-illustration">${foxLogo}<span>✧</span><span>✧</span><span>✦</span></div><div class="eyebrow centered">${finished ? "EVERY ISLAND HAS A STORY" : "A LITTLE WONDER, FOUND"}</div><h2>${finished ? "小小世界，圆满冒险。" : "这座小岛，记住你了。"}</h2><p>${finished ? "五座小岛，十五枚记忆。谢谢你陪屿屿走到这里。" : `你解开了「${engine.level.name}」的秘密。下一座小岛在等你。`}</p><div class="win-stats"><span>${icon("gem")}<strong>3 / 3</strong><small>记忆碎片</small></span><span>${icon("steps")}<strong>${engine.state.steps}</strong><small>探索脚步</small></span><span>${icon("clock")}<strong>${formatTime(elapsed)}</strong><small>小岛时光</small></span></div><button class="primary-button" data-action="${finished ? "collection" : "next"}">${finished ? "翻开旅行手记" : "向下一座小岛出发"} ${icon("arrow")}</button><button class="text-button" data-action="close-dialog">再看看这座小岛</button>${saved ? "" : '<p class="save-warning">浏览器禁止了本地存储，成绩仅保留在当前页面。</p>'}`,
      );
    },
    Math.max(420, world?.path.length * 120 + 100 || 420),
  );
}

/** 一次动作只走一次状态机；渲染、声音和 UI 消费同一个结果，避免表现不一致。 */
function applyAction(result, type = "move") {
  if (!result.changed) {
    if (result.message) toast(result.message);
    return;
  }
  started = true;
  world?.sync(Boolean(result.undo), result.path ?? []);
  updateUI();
  if (result.collected?.length) {
    audio.play("collect");
    toast(`拾起一枚记忆碎片 · ${engine.state.collected.length} / 3`);
  } else if (result.note !== undefined && !result.wrong)
    audio.note(result.note);
  else
    audio.play(
      result.wrong
        ? "wrong"
        : result.pushed
          ? "push"
          : type === "move"
            ? "step"
            : "interact",
    );
  if (result.message) toast(result.message);
  if (result.won) completeLevel();
}

/** 键盘和触屏使用屏幕方向；点选地块已有棋盘坐标，不能再跟随镜头旋转一次。 */
function move(direction, { screenRelative = true } = {}) {
  if (dialog.open || world?.busy || document.hidden || !world) return;
  const worldDirection = screenRelative
    ? world.toWorldDirection(direction)
    : direction;
  applyAction(engine.move(worldDirection));
}

function interact(target) {
  if (dialog.open || world?.busy || !world) return;
  applyAction(engine.interact(target), "interact");
}

function helpDialog() {
  showDialog(
    `<div class="dialog-symbol">${icon("book")}</div><div class="eyebrow centered">A TRAVELER'S HANDBOOK</div><h2>冒险，从迈出一步开始。</h2><p>帮屿屿解开每座小岛的机关，找齐三枚金色碎片，再走进石门。没有倒计时，也不用担心失败。</p><div class="help-grid"><span><kbd>W A S D</kbd><kbd>↑ ← ↓ →</kbd><strong>按屏幕方向移动</strong></span><span><kbd>E</kbd><strong>与相邻机关交互 / 切换昼夜</strong></span><span><kbd>Z</kbd><strong>撤销上一步，包括推箱与机关</strong></span><span><kbd>R</kbd><strong>重新开始当前关卡</strong></span><span><kbd>H</kbd><strong>逐步查看提示，不必着急</strong></span><span><kbd>C</kbd><strong>转动视角，方向键自动跟随镜头</strong></span></div><p class="help-note">也可以点击相邻地块移动，点击身旁的镜子或石碑交互。手机上使用屏幕方向键。通关后会自动保存成绩并解锁下一关。</p><button class="primary-button" data-action="close-dialog">知道了，去探索 ${icon("arrow")}</button>`,
  );
}

function collectionDialog() {
  const entries = Object.entries(progress);
  showDialog(
    `<div class="dialog-symbol">${icon("trophy")}</div><div class="eyebrow centered">LITTLE MOMENTS, KEPT</div><h2>每一步，都算数。</h2><p>已经探索 ${entries.length} 座小岛，珍藏 ${entries.length * 3} 枚记忆碎片。</p><div class="collection-list">${LEVELS.map((level, index) => `<div><span class="collection-number">0${index + 1}</span><strong>${level.name}</strong><span>${progress[index] ? `${progress[index].steps} 步 · ${formatTime(progress[index].seconds)} ${icon("check")}` : "等待你的足迹"}</span></div>`).join("")}</div><p class="help-note">成绩保存在这台设备的浏览器中。再次完成小岛，会保留行动次数更少的记录。</p><button class="primary-button" data-action="close-dialog">继续我的旅行 ${icon("arrow")}</button>`,
  );
}

/** 所有按钮共用事件委托；HTML 中每一个操作均对应实际功能。 */
document.addEventListener("click", async (event) => {
  const moveButton = event.target.closest("[data-move]");
  if (moveButton) {
    move(moveButton.dataset.move);
    moveButton.blur();
    return;
  }
  const levelButton = event.target.closest("[data-level]");
  if (levelButton) {
    const index = Number(levelButton.dataset.level);
    if (!unlocked(index)) {
      toast("先解开前一座小岛的秘密，就能开启这段旅程。");
      return;
    }
    if (index !== levelIndex) loadLevel(index);
    levelButton.blur();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  audio.unlock();
  if (action === "close-dialog") dialog.close();
  if (action === "help") helpDialog();
  if (action === "collection") collectionDialog();
  if (action === "home") {
    dialog.close();
    $(".game-stage").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (action === "map") {
    $("#journey").scrollIntoView({ behavior: "smooth", block: "center" });
    $(".level-card.selected").focus({ preventScroll: true });
    toast("五座小岛依次解锁，已经抵达的小岛可以随时重玩。");
  }
  if (action === "hint") {
    hintCount = Math.min(hintCount + 1, engine.level.hints.length);
    $("#hint-text").textContent = engine.level.hints[hintCount - 1];
    $("#hint-progress").textContent =
      `灵感 ${hintCount} / ${engine.level.hints.length} · ${hintCount < 3 ? "再点一次，得到更具体的提示" : "试着走走看，也可以随时撤销"}`;
    $("#hint-popover").hidden = false;
  }
  if (action === "close-hint") $("#hint-popover").hidden = true;
  if (action === "interact") interact();
  if (action === "undo" && !world?.busy) {
    clearTimeout(winTimeout);
    applyAction(engine.undo(), "undo");
  }
  if (action === "reset") {
    loadLevel(levelIndex);
    toast("小岛恢复原样，重新出发吧。");
  }
  if (action === "next") {
    dialog.close();
    loadLevel(Math.min(levelIndex + 1, LEVELS.length - 1));
  }
  if (action === "rotate") world?.rotate();
  if (action === "sound") {
    audio.enabled = !audio.enabled;
    button.innerHTML = icon(audio.enabled ? "volume" : "muted");
    button.setAttribute("aria-label", audio.enabled ? "关闭音效" : "开启音效");
    button.title = audio.enabled ? "关闭音效" : "开启音效";
    if (audio.enabled) audio.play("interact");
  }
  if (action === "fullscreen") {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($(".game-stage").requestFullscreen)
        await $(".game-stage").requestFullscreen();
      else toast("这个浏览器暂不支持全屏，可以横屏游玩。");
    } catch {
      toast("浏览器没有进入全屏，仍然可以正常游玩。");
    }
  }
  if (!dialog.open && action !== "map") button.blur();
});

/** 按键重复由浏览器负责，动画期间拒绝新移动，防止逻辑位置跑在画面前面。 */
document.addEventListener("keydown", (event) => {
  if (
    dialog.open ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
  )
    return;
  const key = event.key.toLowerCase();
  const movement = {
    w: "up",
    arrowup: "up",
    d: "right",
    arrowright: "right",
    s: "down",
    arrowdown: "down",
    a: "left",
    arrowleft: "left",
  };
  if (movement[key]) {
    event.preventDefault();
    move(movement[key]);
    return;
  }
  const actions = {
    e: "interact",
    z: "undo",
    r: "reset",
    h: "hint",
    c: "rotate",
  };
  if (actions[key] && !event.repeat) {
    event.preventDefault();
    $(`[data-action="${actions[key]}"]`).click();
  }
});

// 点击对话框外侧关闭；原生 dialog 同时提供焦点限制、Escape 和可访问语义。
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  }
});
let lastClock = performance.now();
setInterval(() => {
  const now = performance.now();
  if (started && !engine.state.won && !document.hidden && !dialog.open)
    elapsed += Math.min((now - lastClock) / 1000, 1);
  lastClock = now;
  $("#timer").textContent = formatTime(elapsed);
}, 250);

loadLevel(0);
try {
  world = new IslandWorld($("#world"), (tile) => {
    if (!world || world.busy || dialog.open) return;
    const direction = Object.entries(DIRECTIONS).find(([, delta]) =>
      samePosition(
        engine.state.player.map((value, index) => value + delta[index]),
        tile,
      ),
    );
    const fixtures = [
      ...(engine.level.mirrors ?? []),
      ...(engine.level.runes ?? []),
    ];
    if (fixtures.some((fixture) => samePosition(fixture.pos, tile)))
      interact(tile);
    else if (direction) move(direction[0], { screenRelative: false });
    else toast("点击身边的相邻地块，或用方向键一步一步探索。");
  });
  world.load(engine);
} catch (error) {
  console.error("3D 场景初始化失败", error);
  $("#world").innerHTML =
    `<div class="webgl-error"><strong>小岛暂时无法显示</strong><p>请使用支持 WebGL 2 的浏览器，并开启硬件加速后刷新。</p><button class="primary-button" onclick="location.reload()">重新加载</button></div>`;
}

// 开发模式提供只读入口，自动化测试从真实状态断言，不给生产环境提供跳关按钮。
if (import.meta.env.DEV)
  window.__YUYU__ = {
    get engine() {
      return engine;
    },
    get world() {
      return world;
    },
    get levelIndex() {
      return levelIndex;
    },
  };
if (import.meta.hot) import.meta.hot.dispose(() => world?.dispose());
