/**
 * 输入设备判断：手机、平板这类“粗指针”设备没有悬停、也没有键盘，
 * 说明文字要换成触屏的说法，按键字母提示也要收起来（CSS 里的 .key-hint 同样按这个媒体查询隐藏）。
 */
export const TOUCH_QUERY = "(pointer: coarse)";

/** 当前是不是触屏为主的设备。 */
export function isTouch() {
  return Boolean(window.matchMedia?.(TOUCH_QUERY).matches);
}
