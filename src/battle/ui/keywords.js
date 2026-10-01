import { icon, heartSvg } from "./icons.js";

/**
 * 游戏关键词：小图标 + 加粗 + 强调色。同一个词在说明、提示和界面里长得一样，
 * 玩家看几次就能记住它指什么。tone：accent 系统词（IKB），heart 红心相关，ink 墨黑。
 */
const GLOSSARY = {
  红心: { svg: () => heartSvg("heart"), tone: "heart" },
  红心矩阵: { svg: () => heartSvg("heart"), tone: "heart" },
  护甲心: { svg: () => heartSvg("armor"), tone: "ink" },
  护甲片: { icon: "armor", tone: "ink" },
  武器: { icon: "sword" },
  武器槽: { icon: "sword" },
  背包: { icon: "bag" },
  构筑: { icon: "bag" },
  技能: { icon: "skill" },
  冷却: { icon: "cd" },
  连击: { icon: "combo" },
  充能: { icon: "energy" },
  追击: { icon: "chase" },
  完美命中: { icon: "perfect" },
  防御: { icon: "shield" },
  药水: { icon: "potion", tone: "heart" },
  钥匙: { icon: "key" },
  铁栅门: { icon: "lock", tone: "ink" },
  铁砧: { icon: "anvil" },
  宝箱: { icon: "chest" },
  迷雾: { icon: "fog", tone: "ink" },
  出口: { icon: "exit" },
  旋转: { icon: "rotate" },
  镜像: { icon: "mirror" },
  延长: { icon: "extend" },
  精准: { icon: "perfect" },
  破甲: { icon: "pierce" },
  招架: { icon: "parry" },
  死灭: { icon: "doom" },
  贯通: { icon: "line" },
  巨化: { icon: "giant" },
  震地: { icon: "quake" },
  打断: { icon: "stagger" },
  重击: { icon: "stagger", tone: "ink" },
};

export function kw(label, key = label) {
  const entry = GLOSSARY[key] ?? {};
  const glyph = entry.svg ? entry.svg() : entry.icon ? icon(entry.icon, "kw-icon") : "";
  return `<b class="kw ${entry.tone ?? "accent"}">${glyph}${label}</b>`;
}

/**
 * 把文案里的 [关键词] 或 [显示文字|关键词] 换成关键词标记。
 * 关键词整体不换行；紧跟在后面的中文标点和它绑在一起，避免标点被挤到下一行的行首。
 */
export function rich(text) {
  return String(text).replace(/\[([^\]|]+)(?:\|([^\]]+))?\]([，。、；：！？）」]?)/g, (_, label, key, punct) =>
    punct ? `<span class="kw-keep">${kw(label, key ?? label)}${punct}</span>` : kw(label, key ?? label),
  );
}
