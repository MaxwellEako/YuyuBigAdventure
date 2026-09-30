import { validateName, NAME_MAX_WIDTH } from "../data/heroName.js";

/**
 * 起名界面：一个输入框 + 实时的长度计数与错误提示。
 * 只负责界面本身，起好名字之后做什么由调用方通过 onSubmit 决定。
 */

/**
 * 起名面板的 HTML。
 * @param {string} current 输入框里预填的名字（改名时填当前名字，首次起名为空）
 * @param {boolean} cancelable 是否显示「取消」按钮（首次起名必须填，不能取消）
 * @param {string} kickerHtml 面板顶部的小标题，由调用方按统一风格生成
 */
export function nameEntryHtml({ current = "", cancelable = false, kickerHtml = "" }) {
  return `<form class="panel name-panel" data-name-form novalidate autocomplete="off">
    <header class="panel-head"><div>${kickerHtml}<h2>输入名字</h2></div></header>
    <p class="body">该名字将作为主角的名字，用于章节故事、战斗记录与各项说明。</p>
    <label class="name-field">
      <span class="t-meta">Name · 名字</span>
      <input type="text" name="hero-name" value="${current}" spellcheck="false" autocapitalize="off" aria-describedby="name-hint" />
    </label>
    <p class="name-hint" id="name-hint" role="status" aria-live="polite">
      <span data-name-error></span>
      <span class="t-meta" data-name-count>0 / ${NAME_MAX_WIDTH}</span>
    </p>
    <p class="name-rule t-meta">中文最多 9 个字 · 英文最多 18 个字母</p>
    <div class="panel-actions">
      ${cancelable ? '<button type="button" class="ghost" data-cmd="back">取消</button>' : ""}
      <button type="submit" class="primary" data-name-submit>确认<span aria-hidden="true">→</span></button>
    </div>
  </form>`;
}

/**
 * 给起名面板接上交互：输入时实时校验，合格才允许提交（按钮或回车）。
 * 输入过程中不会强行截断内容，避免打断中文输入法的候选词。
 * @param {ParentNode} root 包含起名面板的容器
 * @param {(name: string) => void} onSubmit 校验通过后的回调，参数是整理好的名字
 */
export function bindNameEntry(root, onSubmit) {
  const form = root.querySelector("[data-name-form]");
  const input = form.querySelector("input");
  const submit = form.querySelector("[data-name-submit]");
  const error = form.querySelector("[data-name-error]");
  const count = form.querySelector("[data-name-count]");

  /** 按当前输入刷新计数、错误提示和按钮状态；返回校验结果。 */
  const refresh = () => {
    const result = validateName(input.value);
    count.textContent = `${result.width} / ${NAME_MAX_WIDTH}`;
    count.classList.toggle("over", result.width > NAME_MAX_WIDTH);
    // 还没输入时不急着报“请输入名字”，只在有内容却不合格时提示。
    error.textContent = input.value.trim() && !result.ok ? result.error : "";
    submit.disabled = !result.ok;
    return result;
  };

  input.addEventListener("input", refresh);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = refresh();
    if (result.ok) onSubmit(result.name);
  });

  refresh();
  // 等面板的入场动画开始后再聚焦，手机上会顺势弹出键盘。
  setTimeout(() => {
    input.focus();
    input.select();
  }, 30);
}
