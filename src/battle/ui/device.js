/**
 * 输入设备判断：手机、平板这类“粗指针”设备没有悬停、也没有键盘，
 * 说明文字要换成触屏的说法，按键字母提示也要收起来（CSS 里的 .key-hint 同样按这个媒体查询隐藏）。
 */
export const TOUCH_QUERY = "(pointer: coarse)";

/** 当前是不是触屏为主的设备。 */
export function isTouch() {
  return Boolean(window.matchMedia?.(TOUCH_QUERY).matches);
}

/**
 * 战斗窗口的排布方式，布局与说明文字共用这一个判断：
 *  - landscape：手机横屏，心阵在左、招式在右；
 *  - stacked：手机竖屏，怪物心阵在上、主角心阵在下；
 *  - wide：平板与电脑，两块心阵左右并排。
 */
export function battleLayout() {
  if (innerHeight < 520 && innerWidth > innerHeight) return "landscape";
  if (innerWidth < 760) return "stacked";
  return "wide";
}
