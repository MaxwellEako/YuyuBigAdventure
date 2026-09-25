import { defineConfig } from "vite";

export default defineConfig({
  // 相对路径：部署到 GitHub Pages 的 /仓库名/ 子路径下也能正确加载资源。
  base: "./",
});
