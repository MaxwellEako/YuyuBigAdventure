import { test, expect } from "@playwright/test";
import { LEVELS } from "../src/game/levels.js";
import { solveLevel } from "./solver.js";

const keys = {
  up: "ArrowUp",
  right: "ArrowRight",
  down: "ArrowDown",
  left: "ArrowLeft",
  interact: "e",
};

/** 测试从键盘输入驱动游戏，不直接改游戏状态，也不通过调试接口跳关。 */
test("真实 WebGL 页面连续通关五座岛，并在刷新后保留成绩", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForFunction(() => window.__YUYU__?.world?.player);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".level-card.locked")).toHaveCount(4);
  await page.screenshot({
    path: ".playwright/desktop-final.png",
    fullPage: true,
  });
  for (let index = 0; index < LEVELS.length; index++) {
    const solution = solveLevel(LEVELS[index]);
    await expect(page.locator("#level-title")).toHaveText(LEVELS[index].name);
    for (const action of solution.actions) {
      await page.waitForFunction(() => !window.__YUYU__.world.busy);
      await page.keyboard.press(keys[action]);
    }
    await expect
      .poll(() => page.evaluate(() => window.__YUYU__.engine.state.won))
      .toBe(true);
    await expect(page.locator("#dialog")).toBeVisible();
    await expect(page.locator("#gem-count")).toHaveText("3");
    await expect(page.locator("#steps")).toHaveText(
      String(solution.actions.length),
    );
    await page.screenshot({
      path: `.playwright/complete-${index + 1}.png`,
      fullPage: true,
    });
    if (index < LEVELS.length - 1)
      await page.locator('[data-action="next"]').click();
    else await page.locator('#dialog [data-action="collection"]').click();
  }
  await expect(page.locator("#dialog-content")).toContainText(
    "珍藏 15 枚记忆碎片",
  );
  await page.locator("#dialog .dialog-close").click();
  await page.reload();
  await expect(page.locator("#completed-count")).toHaveText("5");
  await expect(page.locator(".level-card.locked")).toHaveCount(0);
  await page.locator('[data-level="4"]').click();
  await expect(page.locator("#level-title")).toHaveText("昼夜之间");
  await page.keyboard.press("e");
  await expect(page.locator("#scene-wrap")).toHaveClass(/night/);
  await page.screenshot({
    path: ".playwright/night-island.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("提示、手册、音效、视角、撤销和重置都可使用", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__YUYU__?.world?.player);
  await page.locator('[data-level="1"]').click();
  await expect(page.locator("#level-title")).toHaveText("风起林间");
  await expect(page.locator("#toast")).toContainText("先解开");
  await page.keyboard.press("h");
  await expect(page.locator("#hint-popover")).toBeVisible();
  await expect(page.locator("#hint-progress")).toContainText("1 / 3");
  await page.keyboard.press("h");
  await expect(page.locator("#hint-progress")).toContainText("2 / 3");
  await page.locator('[data-action="close-hint"]').click();
  await page.locator(".manual-button").click();
  await expect(page.locator("#dialog")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#steps")).toHaveText("0");
  await page.keyboard.press("Escape");
  await page.locator("#sound-button").click();
  await expect(page.locator("#sound-button")).toHaveAttribute(
    "aria-label",
    "开启音效",
  );
  await expect(page.locator('[data-action="pixel"]')).toHaveCount(0);
  await page.keyboard.press("c");
  expect(await page.evaluate(() => window.__YUYU__.world.angle)).toBeCloseTo(
    Math.PI / 2,
  );
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => !window.__YUYU__.world.busy);
  await expect(page.locator("#steps")).toHaveText("1");
  await page.keyboard.press("z");
  await expect(page.locator("#steps")).toHaveText("0");
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => !window.__YUYU__.world.busy);
  await page.keyboard.press("r");
  await expect(page.locator("#steps")).toHaveText("0");
});

test("手机没有横向溢出，触屏方向键、交互和提示正常", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForFunction(() => window.__YUYU__?.world?.player);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator(".touch-controls")).toBeVisible();
  await page.locator('[data-move="right"]').click();
  await page.waitForFunction(() => !window.__YUYU__.world.busy);
  await expect(page.locator("#steps")).toHaveText("1");
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator("#steps")).toHaveText("0");
  await page.locator('[data-action="hint"]').click();
  await expect(page.locator("#hint-popover")).toBeVisible();
  await page.locator('[data-action="close-hint"]').click();
  await page.screenshot({
    path: ".playwright/mobile-final.png",
    fullPage: true,
  });
});

/** 实例合批后的鼠标拾取、低动态偏好与局部全屏也需要穿过真实 UI 验证。 */
test("点选地形、减少动态效果与全屏通关兼容", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForFunction(() => window.__YUYU__?.world?.player);
  const targetPosition = () =>
    page.evaluate(() => {
      const world = window.__YUYU__.world;
      const point = world.camera.position
        .clone()
        .set(2 - world.center[0], 0.065, 4 - world.center[1])
        .project(world.camera);
      const rect = world.renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + ((point.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - point.y) * rect.height) / 2,
      };
    });
  for (let turns = 0; turns < 4; turns++) {
    for (let rotation = 0; rotation < turns; rotation++)
      await page.keyboard.press("c");
    const target = await targetPosition();
    await page.mouse.click(target.x, target.y);
    await expect(page.locator("#steps")).toHaveText("1");
    expect(
      await page.evaluate(() => window.__YUYU__.engine.state.player),
    ).toEqual([2, 4]);
    expect(await page.evaluate(() => window.__YUYU__.world.busy)).toBe(false);
    await page.keyboard.press("r");
  }
  const bounds = await page.evaluate(() => ({
    panel: document.querySelector(".chapter-panel").getBoundingClientRect()
      .bottom,
    button: document.querySelector(".hint-button").getBoundingClientRect()
      .bottom,
  }));
  expect(bounds.button).toBeLessThan(bounds.panel);
  await page.locator('[data-action="fullscreen"]').click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  for (const action of solveLevel(LEVELS[0]).actions)
    await page.keyboard.press(keys[action]);
  await expect(page.locator("#dialog")).toBeVisible();
  await expect(page.locator("#dialog-content")).toContainText(
    "这座小岛，记住你了",
  );
  await page.locator("#dialog .dialog-close").click();
  await page.locator('[data-action="fullscreen"]').click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
});

/**
 * 从实际相机投影验证“屏幕方向”，不拿输入转换函数自己的结果充当期望值。
 * 每个朝向都覆盖四个方向；按键后撤销回到同一空旷位置，保证每次都能走一步。
 */
for (const mobile of [false, true]) {
  test(`${mobile ? "触屏方向键" : "方向键与 WASD"}在四个轻斜镜头朝向下都与屏幕主方向一致`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForFunction(() => window.__YUYU__?.world?.player);
    const inputs = [
      ["up", "ArrowUp", "w"],
      ["right", "ArrowRight", "d"],
      ["down", "ArrowDown", "s"],
      ["left", "ArrowLeft", "a"],
    ];
    const projectedPosition = () =>
      page.evaluate(() => {
        const world = window.__YUYU__.world;
        const point = world.player.position.clone().project(world.camera);
        // 换算成屏幕像素再比较方向，避免画布长宽比扭曲水平与垂直位移的比例。
        const rect = world.renderer.domElement.getBoundingClientRect();
        return {
          x: (point.x * rect.width) / 2,
          y: (point.y * rect.height) / 2,
        };
      });
    for (let rotation = 0; rotation < 4; rotation++) {
      for (const [direction, ...keyboardKeys] of inputs) {
        for (const input of mobile ? [direction] : keyboardKeys) {
          const before = await projectedPosition();
          if (mobile) await page.locator(`[data-move="${input}"]`).click();
          else await page.keyboard.press(input);
          await expect(page.locator("#steps")).toHaveText("1");
          const after = await projectedPosition();
          const delta = { x: after.x - before.x, y: after.y - before.y };
          const horizontal = direction === "left" || direction === "right";
          const sign = direction === "up" || direction === "right" ? 1 : -1;
          const primary = delta[horizontal ? "x" : "y"] * sign;
          const secondary = Math.abs(delta[horizontal ? "y" : "x"]);
          // 允许轻微侧倾，但目标方向位移必须占主导；同时防止退回完全正面的死板视角。
          expect(secondary).toBeGreaterThan(0.1);
          expect(primary).toBeGreaterThan(secondary * 2);
          await page.keyboard.press("z");
          await expect(page.locator("#steps")).toHaveText("0");
        }
      }
      await page.locator('[data-action="rotate"]').click();
    }
    expect(await page.evaluate(() => window.__YUYU__.world.angle)).toBe(0);
  });
}

/** 高清屏不再被降采样再用最近邻拉伸，检查实际 WebGL 上下文和绘图缓冲区。 */
test("高清屏开启抗锯齿，移除像素化样式和画质开关", async ({ browser }) => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  try {
    await page.goto("/");
    await page.waitForFunction(() => window.__YUYU__?.world?.player);
    const quality = await page.evaluate(() => {
      const renderer = window.__YUYU__.world.renderer;
      const canvas = renderer.domElement;
      return {
        antialias: renderer.getContext().getContextAttributes().antialias,
        ratio: renderer.getPixelRatio(),
        imageRendering: getComputedStyle(canvas).imageRendering,
        width: canvas.width,
        cssWidth: canvas.clientWidth,
      };
    });
    expect(quality.antialias).toBe(true);
    expect(quality.ratio).toBe(2);
    expect(quality.imageRendering).toBe("auto");
    expect(quality.width).toBe(quality.cssWidth * 2);
    await expect(page.locator('[data-action="pixel"]')).toHaveCount(0);
    await page.screenshot({
      path: ".playwright/antialiased-retina.png",
      fullPage: true,
    });
  } finally {
    await page.close();
  }
});
