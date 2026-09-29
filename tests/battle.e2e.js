import { test, expect } from "@playwright/test";
import { rankPlacements } from "../src/battle/logic/shapes.js";
import { WEAPONS } from "../src/battle/data/weapons.js";

/**
 * 心阵棋局端到端测试：全部通过真实键盘 / 鼠标输入驱动。
 * 只读地使用 window.__heartGambit 来获取 busy 状态与棋格的屏幕坐标。
 */

async function waitIdle(page) {
  await page.waitForFunction(
    () => !window.__heartGambit.busy || document.querySelector(".battle-modal") || document.querySelector(".coach"),
  );
}

/** 依次关掉所有新机制说明弹窗，返回看过的标题。 */
async function dismissCoach(page) {
  const titles = [];
  for (let i = 0; i < 12; i += 1) {
    const ok = page.locator(".coach [data-coach-ok]");
    try {
      await ok.waitFor({ state: "visible", timeout: 800 });
    } catch {
      break;
    }
    titles.push(await page.locator(".coach h3").textContent());
    await ok.click();
  }
  return titles;
}

/** 关闭说明弹窗，直接进入某一章（跳过教学）。 */
async function skipHints(page) {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "heart-gambit-progress-v3",
      JSON.stringify({ unlocked: 1, stars: {}, loadouts: {}, seen: [], hints: false }),
    ),
  );
  await page.reload();
}

async function clickTile(page, r, c) {
  const point = await page.evaluate(
    ([row, col]) => {
      const { world } = window.__heartGambit;
      const v = world.camera.position.clone().set(col - 3.5, 0.05, row - 3.5);
      v.project(world.camera);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
    },
    [r, c],
  );
  await page.mouse.click(point.x, point.y);
}

/** 从界面读出怪物心阵和可用武器，挑伤害最高的落点：先悬停检查预览，再点击出招。 */
async function fight(page, { screenshot } = {}) {
  const modal = page.locator(".battle-modal");
  await expect(modal).toBeVisible();
  for (let turn = 0; turn < 60; turn += 1) {
    const result = page.locator(".battle-result:not([hidden])");
    if (await result.count()) {
      const title = await result.locator("h2").textContent();
      await result.locator("[data-continue]").click();
      await expect(modal).toHaveCount(0);
      await waitIdle(page);
      return title;
    }
    if (await page.locator(".coach").count()) {
      await dismissCoach(page);
      continue;
    }
    if (await page.locator(".battle-modal.locked").count()) {
      await page.waitForTimeout(120);
      continue;
    }
    const view = await page.evaluate(() => {
      const cells = [...document.querySelectorAll(".matrix-enemy .cell:not(.outside)")];
      const rows = Math.max(...cells.map((c) => +c.dataset.r)) + 1;
      const cols = Math.max(...cells.map((c) => +c.dataset.c)) + 1;
      const matrix = Array.from({ length: rows }, () => Array(cols).fill(-1));
      for (const c of cells)
        matrix[+c.dataset.r][+c.dataset.c] = c.classList.contains("void")
          ? -1
          : c.classList.contains("empty")
            ? 0
            : c.classList.contains("armor")
              ? 2
              : 1;
      const ready = [...document.querySelectorAll("[data-weapon]:not(.cooling)")].map((b) => b.dataset.weapon);
      return { matrix, ready };
    });
    let best = null;
    for (const id of view.ready) {
      const weapon = WEAPONS[id];
      const top = rankPlacements(view.matrix, weapon.shape, weapon)[0];
      if (top && (!best || top.hits.length > best.top.hits.length)) best = { id, top };
    }
    await page.locator(`[data-weapon="${best.id}"]`).click();
    const cell = page.locator(`.matrix-enemy .cell[data-r="${best.top.r}"][data-c="${best.top.c}"]`);
    await cell.hover();
    await expect(page.locator(".matrix-enemy .cell.pv-hit, .matrix-enemy .cell.pv-crack")).toHaveCount(
      best.top.hits.length,
    );
    if (screenshot && turn === 0) await page.screenshot({ path: screenshot });
    await cell.click();
    await page.waitForTimeout(150);
  }
  throw new Error("战斗没有在 60 个回合内结束");
}

test("用真实键鼠通关序章：说明弹窗、移动、悬停预览、出招、结算", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".title-card h1")).toHaveText("心阵棋局");
  await page.screenshot({ path: ".playwright/battle-title.png" });

  await page.getByRole("button", { name: "开始冒险" }).click();
  await expect(page.locator(".screen-intro h2")).toHaveText("序章");
  await page.keyboard.press("Enter");
  await expect(page.locator("#screen")).toBeHidden();
  expect(await dismissCoach(page)).toEqual(["移动"]);

  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press("ArrowUp");
    await waitIdle(page);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".playwright/battle-board.png" });
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".battle-modal")).toBeVisible();
  const seen = await dismissCoach(page);
  expect(seen).toContain("红心矩阵");
  expect(seen).toContain("形状攻击");
  expect(await fight(page, { screenshot: ".playwright/battle-preview.png" })).toBe("胜利");

  await clickTile(page, 0, 3);
  await expect(page.locator(".screen-complete h2")).toHaveText("序章");
  await expect(page.locator(".screen-complete .stars i.on")).not.toHaveCount(0);
  await page.screenshot({ path: ".playwright/battle-complete.png" });

  await page.reload();
  await expect(page.getByRole("button", { name: /继续冒险 · 第 1 章/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("L 钩镰可以越出边界：锚点放在矩阵外，只消除擦到的那一格", async ({ page }) => {
  await skipHints(page);
  await page.getByRole("button", { name: /开始冒险|继续冒险/ }).click();
  await page.keyboard.press("Enter");
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("ArrowUp");
    await waitIdle(page);
  }
  await expect(page.locator(".battle-modal")).toBeVisible();
  await page.keyboard.press("2");
  const outside = page.locator('.matrix-enemy .cell[data-r="-1"][data-c="1"]');
  await outside.hover();
  await expect(page.locator(".matrix-enemy .cell.pv-off")).toHaveCount(2);
  await expect(page.locator(".matrix-enemy .cell.pv-hit")).toHaveCount(1);
  await expect(page.locator('.matrix-enemy .cell[data-r="0"][data-c="1"]')).toHaveClass(/pv-hit/);
  await outside.click();
  await expect(page.locator("[data-enemy-hp] .num")).toHaveText("7");
});

test("手机竖屏：棋盘与战斗窗口不出现横向滚动", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await skipHints(page);
  await page.getByRole("button", { name: /开始冒险|继续冒险/ }).click();
  await page.getByRole("button", { name: /开始序章/ }).click();
  await expect(page.locator(".dpad")).toBeVisible();
  for (let i = 0; i < 3; i += 1) {
    await page.locator('.dpad [data-dir="up"]').click();
    await waitIdle(page);
  }
  await page.screenshot({ path: ".playwright/battle-mobile-board.png" });
  await page.locator('.dpad [data-dir="up"]').click();
  await expect(page.locator(".battle-modal")).toBeVisible();
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.querySelector(".battle-modal").scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: ".playwright/battle-mobile-fight.png" });
});

test("重置进度：先确认再清空，取消不丢进度，音乐音效开关保留", async ({ page }) => {
  const saved = { v: 4, unlocked: 6, stars: { prologue: 3, "first-blot": 2 }, profile: { weapons: ["dagger", "hook", "slash"], skills: [], upgrades: { dagger: { extend: true } }, equipped: ["dagger", "hook"], equippedSkills: [], slots: 2 }, forged: {}, seen: ["move"], hints: false, audio: { music: false, sfx: true } };
  await page.goto("/");
  await page.evaluate((data) => localStorage.setItem("heart-gambit-progress-v3", JSON.stringify(data)), saved);
  await page.reload();
  await expect(page.getByRole("button", { name: /继续冒险 · 第 5 章/ })).toBeVisible();

  // 取消：进度原样保留。
  await page.getByRole("button", { name: "重置进度" }).click();
  await expect(page.locator(".reset-panel h2")).toHaveText("重置进度");
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("button", { name: /继续冒险 · 第 5 章/ })).toBeVisible();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("heart-gambit-progress-v3"))).unlocked).toBe(6);

  // 在章节里从玩法说明打开重置再取消，关掉说明后还能正常移动。
  await page.getByRole("button", { name: /继续冒险/ }).click();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__heartGambit.playing);
  await page.keyboard.press("h");
  await page.locator(".help [data-cmd=reset]").click();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.locator(".panel.help")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__heartGambit.playing)).toBe(true);

  // 确认：清空进度，回到标题，音频开关保留。
  await page.keyboard.press("h");
  await page.locator(".help [data-cmd=reset]").click();
  await page.getByRole("button", { name: "确认重置" }).click();
  await expect(page.getByRole("button", { name: "开始冒险" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重置进度" })).toHaveCount(0);
  const after = JSON.parse(await page.evaluate(() => localStorage.getItem("heart-gambit-progress-v3")));
  expect(after.unlocked).toBe(1);
  expect(after.stars).toEqual({});
  expect(after.profile).toBeNull();
  expect(after.seen).toEqual([]);
  expect(after.audio).toEqual({ music: false, sfx: true });
  await page.screenshot({ path: ".playwright/battle-after-reset.png" });
});
