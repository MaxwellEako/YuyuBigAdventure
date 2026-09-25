import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

/** 优先使用标准 Playwright Chromium；这台 macOS 开发机也可直接复用 Chrome。 */
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.js",
  timeout: 120000,
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      ...(existsSync(chrome) ? { executablePath: chrome } : {}),
      args: ["--enable-unsafe-swiftshader"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
