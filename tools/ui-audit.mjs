/**
 * UI 审查（开发工具，不进游戏包）：在电脑、手机、矮屏手机上依次打开每个界面，检查常见的设计范式问题。
 * 规则与出处见 docs/ui-guidelines.md。先启动开发服务器，再运行：
 *   npx vite --port 5199 &
 *   node tools/ui-audit.mjs            # 可用环境变量 UI_AUDIT_URL、CHROMIUM_PATH 覆盖地址与浏览器
 *
 * 检查项：
 *  1. 能滚动但其实没必要（只多出几像素就能滚，或 overflow: scroll 却没有溢出）
 *  2. 弹窗 / 面板比可见区域高（手机上的整页式界面除外，它们由整页滚动）
 *  3. 页面横向溢出
 *  4. 弹窗标题栏在滚动后看不见（应固定）
 *  5. 触屏上可点元素小于 24px，且没有用 ::after 扩大点按区域
 */
import { chromium } from "playwright-core";
const URL = process.env.UI_AUDIT_URL ?? "http://127.0.0.1:5199/";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const VIEWS = { pc: { width: 1440, height: 900 }, phone: { width: 390, height: 844 }, short: { width: 375, height: 667 } };
const report = [];

async function open(page, cmd, prep) {
  await page.evaluate(async ({ cmd, prep }) => {
    const g = window.__heartGambit;
    if (prep === "level") { g.startLevel(5, { intro: false }); await new Promise((r) => setTimeout(r, 700)); }
    if (prep === "intro") { g.startLevel(5, { intro: true }); await new Promise((r) => setTimeout(r, 700)); return; }
    if (prep === "prologue") { g.startLevel(0, { intro: true }); await new Promise((r) => setTimeout(r, 700)); return; }
    if (!cmd) return;
    const b = document.createElement("button");
    b.dataset.cmd = cmd;
    b.hidden = true;
    document.body.appendChild(b);
    b.click();
    b.remove();
  }, { cmd, prep });
  await page.waitForTimeout(600);
}

function check() {
  const out = [];
  const vh = innerHeight;
  const vw = innerWidth;
  const name = (el) => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  if (document.documentElement.scrollWidth > vw + 1) out.push(`横向溢出：页面宽 ${document.documentElement.scrollWidth} > ${vw}`);
  const doc = document.scrollingElement;
  if (doc.scrollHeight > doc.clientHeight + 1) out.push(`整页可以上下滚动：${doc.scrollHeight} > ${doc.clientHeight}`);
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const scrollY = /(auto|scroll)/.test(cs.overflowY);
    const extra = el.scrollHeight - el.clientHeight;
    if (scrollY && extra > 0 && extra <= 24) out.push(`多出 ${extra}px 就能滚动：${name(el)}`);
    if (cs.overflowY === "scroll" && extra <= 0) out.push(`overflow: scroll 却没有溢出：${name(el)}`);
  }
  // 手机上的整页式界面（构筑、玩法说明、章节选择、铁砧）本来就由整页滚动，不算超出。
  const fullPage = (el) => innerWidth <= 600 && el.closest(".screen-armory, .screen-help, .screen-levels, .screen-forge");
  for (const el of document.querySelectorAll(".screen .panel, .coach-card, #hero-hud, #goal-hud, .battle-card")) {
    if (!visible(el) || fullPage(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > vh + 1 || r.top < -1) out.push(`超出可见区域：${name(el)} top ${Math.round(r.top)} bottom ${Math.round(r.bottom)} / ${vh}`);
  }
  // 面板的第一个、最后一个子元素不应贴着面板的上下边框（内边距丢了）。
  for (const el of document.querySelectorAll(".screen .panel")) {
    if (!visible(el) || fullPage(el)) continue;
    const box = el.getBoundingClientRect();
    const kids = [...el.children].filter(visible);
    if (!kids.length) continue;
    const top = kids[0].getBoundingClientRect().top - box.top;
    const bottom = box.bottom - kids[kids.length - 1].getBoundingClientRect().bottom;
    // 吸顶标题栏、吸底按钮栏自带内边距，看的是它们里面的内容。
    const innerTop = kids[0].matches(".panel-head") ? kids[0].firstElementChild.getBoundingClientRect().top - box.top : top;
    if (innerTop < 12) out.push(`内容贴着面板上边框（${Math.round(innerTop)}px）：${name(el)}`);
    if (el.scrollHeight <= el.clientHeight + 1 && bottom < 12 && !kids.at(-1).matches(".panel-actions")) out.push(`内容贴着面板下边框（${Math.round(bottom)}px）：${name(el)}`);
  }
  // 可滚动的弹窗：滚到底以后标题栏还在不在
  const panel = [...document.querySelectorAll(".screen .panel")].find(visible);
  const scroller = panel && fullPage(panel) ? document.querySelector(".screen") : panel;
  if (panel && fullPage(panel) && scroller.scrollHeight > scroller.clientHeight + 1) {
    const head = panel.querySelector(".panel-head");
    scroller.scrollTop = scroller.scrollHeight;
    if (head && head.getBoundingClientRect().top < -1) out.push(`整页式界面的标题栏随内容滚走：${name(panel)}`);
    scroller.scrollTop = 0;
  } else if (panel && panel.scrollHeight > panel.clientHeight + 1) {
    const head = panel.querySelector(".panel-head");
    const before = head?.getBoundingClientRect().top;
    panel.scrollTop = panel.scrollHeight;
    const after = head?.getBoundingClientRect().top;
    if (head && after < panel.getBoundingClientRect().top - 1) out.push(`弹窗标题栏随内容滚走：${name(panel)}`);
    panel.scrollTop = 0;
  }
  if (matchMedia("(pointer: coarse)").matches) {
    for (const el of document.querySelectorAll("button, [role=button], a, [data-cmd]")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      const expanded = after.content !== "none" && after.position === "absolute";
      if ((r.width < 24 || r.height < 24) && !expanded) out.push(`点按区域太小 ${Math.round(r.width)}×${Math.round(r.height)}：${name(el)} “${el.textContent.trim().slice(0, 8)}”`);
    }
  }
  return [...new Set(out)];
}

const SCREENS = [
  ["标题页", null, null],
  ["章节选择", "levels", null],
  ["玩法说明", "help", null],
  ["起名", "rename", null],
  ["重置确认", "reset", null],
  ["章节开场", null, "intro"],
  ["序章开场", null, "prologue"],
  ["棋盘", null, "level"],
  ["菜单", "menu", "level"],
  ["构筑", "armory", "level"],
  ["强化说明", "upgradeHelp", "level"],
  ["重来确认", "restart", "level"],
  ["武器抽屉", "sheetHero", "level"],
  ["目标抽屉", "sheetGoal", "level"],
];

for (const [view, vp] of Object.entries(VIEWS)) {
  const touch = view !== "pc";
  for (const [label, cmd, prep] of SCREENS) {
    const page = await browser.newPage({ viewport: vp, hasTouch: touch, isMobile: touch });
    page.on("pageerror", (e) => report.push(`[${view}] ${label} 脚本错误：${e.message}`));
    await page.goto(URL);
    await page.evaluate(() => localStorage.setItem("heart-gambit-progress-v3", JSON.stringify({ v: 4, unlocked: 11, stars: {}, profile: null, forged: {}, seen: [], hints: false, name: "xrephmos_admin" })));
    await page.reload();
    await page.waitForFunction(() => window.__heartGambit);
    await page.waitForTimeout(400);
    await open(page, cmd, prep);
    for (const issue of await page.evaluate(check)) report.push(`[${view}] ${label}：${issue}`);
    await page.close();
  }
}
console.log(report.join("\n") || "没有发现问题");
await browser.close();
// 有问题时以非零状态退出，方便放进检查流程。
process.exitCode = report.length ? 1 : 0;
