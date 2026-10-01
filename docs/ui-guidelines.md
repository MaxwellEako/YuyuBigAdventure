# 界面设计规范

做新界面、改旧界面时按这份清单检查。能自动检查的项由 `tools/ui-audit.mjs` 覆盖（电脑 1440×900、手机 390×844、矮屏手机 375×667 三种尺寸，逐个打开所有界面）：

```sh
npx vite --port 5199 &
node tools/ui-audit.mjs   # 有问题时退出码为 1
```

## 参考来源

- [Vercel · Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)：本项目实际查阅过，下文引用的原句都出自这里。
- Material Design 3 · Dialogs（可滚动对话框：标题与操作按钮固定，只有正文滚动）。
- Apple Human Interface Guidelines · Sheets / Modality（底部弹出的面板、关闭按钮位置、安全区）。
- WAI-ARIA Authoring Practices · Dialog (Modal) Pattern（焦点、Esc 关闭、背景不可操作）。

## 弹窗

1. **标题栏固定，正文滚动，操作按钮固定。** 标题栏（`.panel-head`）吸顶，最后一行操作按钮（`.panel-actions`）吸底，滚动时始终看得到标题、关闭按钮和“确定 / 取消”。统一样式在 `style.css` 末尾的“弹窗的统一结构”一节，新弹窗只要沿用 `panel-head` + 正文 + `panel-actions` 的结构，就自动符合。
2. **高度不超过可见区域。** 内容多时在弹窗里面滚动，不把弹窗撑出屏幕。手机上的构筑、玩法说明、章节选择、铁砧是整页式界面，由整页滚动，标题栏贴着屏幕顶端吸住。
3. **滚动不传到背后。** 弹窗、抽屉设置 `overscroll-behavior: contain`。原文：*"Set `overscroll-behavior: contain` intentionally e.g., in modals/drawers."*
4. **关闭方式齐全。** 右上角关闭按钮 + Esc（电脑），需要确认的危险操作（重置、重来）用明确的按钮文字。

## 滚动与溢出

5. **内容没超出就不能滚。** 只用 `overflow: auto`，不用 `overflow: scroll`；也不要出现“只多出几像素就能滚”的情况，多出来的那一点要么收紧间距放下，要么确实是长内容。原文：*"Only render useful scrollbars; fix overflow issues to prevent unwanted scrollbars."*
6. **不横向溢出。** 任何尺寸下页面宽度都不超过屏幕。
7. **长短内容都要能排。** 原文：*"Layouts handle short, average, & very long content."* 用开发者模式（满配：全部武器、技能、强化）检查最长的情况，用新档检查最短的情况。

## 布局稳定

8. **数值和状态变化时布局不跳。** 会出现又消失的东西（−N、护甲数、按钮、标记）提前占好位置，只切换可见性；固定高度的卡片在换装前后高度不变。
9. **优先用 flex / grid 排版，少用脚本量尺寸。** 原文：*"Prefer flex/grid/intrinsic layout over measuring in JS."*

## 触屏

10. **点按区域：手机上不小于 44px；视觉上小于 24px 的元素，用 `::after` 把点按区域扩到至少 24px。** 原文：*"if the visual target is < 24px, expand its hit target to ≥ 24px. On mobile, the minimum size is 44px."*
11. **让开刘海和底部横条：** 用 `env(safe-area-inset-*)`（项目里是 `--safe-top` 等变量）。

## 文案

12. **机制说明只讲一般情况**，不提具体的武器、技能或强化名字。
13. **关键词统一标记：** 文案里写 `[连击]`、`[追击]` 等，用 `rich()` 渲染成带专属图标的强调色，同一个词在所有界面长得一样。
