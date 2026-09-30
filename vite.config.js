import { defineConfig } from "vite";

export default defineConfig({
  // 相对路径：部署到 GitHub Pages 的 /仓库名/ 子路径下也能正确加载资源。
  base: "./",
  build: {
    // 兼容到 iOS 14 / Safari 14 以及同时期的桌面浏览器：较新的语法（如 ??=）在构建时会被转写。
    target: ["es2020", "safari14", "ios14", "chrome90", "firefox90", "edge90"],
    cssTarget: ["safari14", "ios14", "chrome90", "firefox90", "edge90"],
  },
});
