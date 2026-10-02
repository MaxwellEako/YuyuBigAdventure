/**
 * 试玩记录：玩家每进入一个章节，把「名字 + 章节 + 当时的整份存档」发到试玩记录服务（server/save-service.mjs）。
 *
 * 只发不收：游戏从不从服务读回存档，本机存档照常读写，发送失败也不影响游戏。
 * 本地开发（vite dev，含端到端测试）和开发者模式不发送，免得混进试玩数据。
 */
const ENDPOINT = import.meta.env.VITE_PLAY_LOG_URL ?? "https://43.136.52.167:8443/v1/record";

export function recordChapterStart({ name, level, index, progress }) {
  if (import.meta.env.DEV || !ENDPOINT || !name) return;
  try {
    // text/plain 不触发 CORS 预检，一次请求就够；keepalive 让页面切走时请求也能发完。
    fetch(ENDPOINT, {
      method: "POST",
      mode: "cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ name, levelKey: level.key, levelIndex: index, progress }),
    }).catch(() => {});
  } catch {
    /* 旧浏览器不支持 keepalive 等情况：不记就是了 */
  }
}
