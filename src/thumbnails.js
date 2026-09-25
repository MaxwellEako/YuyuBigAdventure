import { noise } from "./game/voxel.js";

/** 把实际关卡地图绘成轻量等距预览；缩略图与游戏共用地图，而非静态截图。 */
export function thumbnail(level) {
  const width = Math.max(...level.map.map((row) => row.length));
  const colors =
    level.type === "ice"
      ? ["#bed1ce", "#cee0da"]
      : level.type === "phase"
        ? ["#b6b0bf", "#c5c1c8"]
        : ["#aebd8e", "#c0c79a"];
  let shapes = "";
  level.map.forEach((row, z) =>
    [...row].forEach((tile, x) => {
      if (tile === " " || tile === "~") return;
      const sx = 95 + (x - z - (width - 9) / 2) * 7.8;
      const sy = 19 + (x + z) * 3.8;
      const top = colors[noise(x, z) > 0.5 ? 1 : 0];
      shapes += `<path d="M${sx - 7.8} ${sy}l7.8 3.8v9l-7.8-3.8Z" fill="#a49a7f"/><path d="M${sx + 7.8} ${sy}l-7.8 3.8v9l7.8-3.8Z" fill="#918b73"/><path d="M${sx} ${sy - 3.8}l7.8 3.8-7.8 3.8-7.8-3.8Z" fill="${tile === "i" ? "#acd1d6" : top}"/>`;
      if (tile === "#") {
        const color =
          level.type === "ice"
            ? "#c6d8d0"
            : noise(x, z) > 0.5
              ? "#d7a16c"
              : "#7c9468";
        shapes += `<path d="M${sx - 1} ${sy - 13}h2v14h-2Z" fill="#7e755c"/><path d="M${sx - 5} ${sy - 19}h10v10h-10Z" fill="${color}"/><path d="M${sx - 3} ${sy - 22}h6v3h-6Z" fill="${color}"/>`;
      }
    }),
  );
  return `<svg viewBox="0 0 190 116" aria-hidden="true" class="island-thumbnail">${shapes}</svg>`;
}
