import { defineConfig } from "vite";
import { resolve } from "node:path";

/** 两个入口：原有的解谜岛（index.html）与心阵棋局（battle.html）。 */
export default defineConfig({
  // 相对路径：部署到 GitHub Pages 的 /仓库名/ 子路径下也能正确加载资源。
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        battle: resolve(import.meta.dirname, "battle.html"),
      },
    },
  },
});
