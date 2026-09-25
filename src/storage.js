const STORAGE_KEY = "yuyu-adventure-v1";

/** 本地存档可能被手动修改或被浏览器禁用，失败时降级为当前会话，不中断游戏。 */
export function readProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || typeof data !== "object") return {};
    return Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) =>
          /^[0-4]$/.test(key) &&
          Number.isInteger(value?.steps) &&
          value.steps >= 0 &&
          Number.isFinite(value?.seconds) &&
          value.seconds >= 0,
      ),
    );
  } catch {
    return {};
  }
}

export function writeProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
