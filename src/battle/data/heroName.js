/**
 * 玩家给主角起的名字。
 *
 * 游戏里所有提到主角的地方（界面、战斗日志、章节故事、说明卡）都通过这里取名字，
 * 没有起名（或旧存档没有名字）时退回默认名「屿屿」，逻辑层的单元测试也因此不必关心名字。
 *
 * 长度按“显示宽度”计：中文等全角字符算 2，英文、数字等半角字符算 1，
 * 总宽度不超过 18。也就是说：纯中文最多 9 个字，纯英文最多 18 个字母，混着写则按宽度折算。
 */

/** 默认主角名。 */
export const DEFAULT_HERO_NAME = "屿屿";

/** 名字的最大显示宽度：中文 9 个字（每个宽 2），英文 18 个字母（每个宽 1）。 */
export const NAME_MAX_WIDTH = 18;

/**
 * 全角字符区间（汉字、假名、谚文、全角标点等），落在这些区间里的字符宽度记为 2。
 * 每一项是 [起始码点, 结束码点]。
 */
const WIDE_RANGES = [
  [0x1100, 0x115f], // 谚文字母
  [0x2e80, 0xa4cf], // 中日韩部首、标点、假名、汉字（含扩展 A）
  [0xac00, 0xd7a3], // 谚文音节
  [0xf900, 0xfaff], // 中日韩兼容汉字
  [0xfe30, 0xfe6f], // 中日韩兼容标点
  [0xff00, 0xff60], // 全角 ASCII
  [0xffe0, 0xffe6], // 全角符号
  [0x20000, 0x3fffd], // 汉字扩展 B 及以后
];

/**
 * 允许的字符：各种语言的字母、数字，外加空格、间隔号、下划线、点和连字符。
 * 名字会被拼进页面 HTML，这里同时把 < > & 引号等危险字符挡在门外。
 */
const ALLOWED = /^[\p{L}\p{N}\p{M}·._\- ]+$/u;

/** 单个字符的显示宽度：全角 2，其余 1。 */
export function charWidth(ch) {
  const code = ch.codePointAt(0);
  return WIDE_RANGES.some(([from, to]) => code >= from && code <= to) ? 2 : 1;
}

/** 整个名字的显示宽度（按码点遍历，避免把生僻汉字拆成两半）。 */
export function nameWidth(text) {
  let width = 0;
  for (const ch of text) width += charWidth(ch);
  return width;
}

/**
 * 校验一个输入的名字。
 * 返回 { ok, name, width, error }：ok 为 false 时 error 是给玩家看的中文提示。
 * 首尾空格会被去掉，中间连续的空格合并成一个。
 */
export function validateName(raw) {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  const width = nameWidth(name);
  if (!name) return { ok: false, name, width, error: "请输入名字。" };
  if (!ALLOWED.test(name)) return { ok: false, name, width, error: "名字里只能使用文字、数字和 · . _ - 符号。" };
  if (width > NAME_MAX_WIDTH) return { ok: false, name, width, error: "名字太长了：中文最多 9 个字，英文最多 18 个。" };
  return { ok: true, name, width, error: "" };
}

/** 当前使用的名字，默认值见 DEFAULT_HERO_NAME。 */
let current = DEFAULT_HERO_NAME;

/** 取当前主角名。 */
export function getHeroName() {
  return current;
}

/**
 * 设置主角名。传入不合格的名字（含空字符串）时退回默认名，
 * 这样读到被改坏的存档也不会把奇怪的内容带进页面。返回实际生效的名字。
 */
export function setHeroName(raw) {
  const result = validateName(raw);
  current = result.ok ? result.name : DEFAULT_HERO_NAME;
  return current;
}
