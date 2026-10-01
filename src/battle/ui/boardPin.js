/**
 * 棋盘指引标记：钉在某只怪物头顶的一个小标签（上下轻轻跳动的箭头 + 一句提示），
 * 用来告诉新玩家“点这里”。它是普通的页面元素，每画一帧就按怪物在屏幕上的位置挪一次，
 * 所以镜头转动、缩放时也始终贴着怪物；说明卡可以像指向界面按钮一样指向它（选择器 .board-pin）。
 *
 * 用法：const dispose = pinMonster(world, monster.uid, "点击怪物，发起战斗");
 *       不再需要时调用 dispose()，标记连同每帧的回调一起移除。
 */
export function pinMonster(world, uid, text) {
  const pin = document.createElement("div");
  pin.className = "board-pin";
  pin.setAttribute("aria-hidden", "true");
  pin.innerHTML = `<span class="board-pin-text">${text}</span><i class="board-pin-arrow"></i>`;
  document.body.appendChild(pin);

  // 每帧把标记的底边中点对准怪物的血量铭牌；怪物看不见（迷雾、镜头背后）时藏起来。
  const follow = () => {
    const point = world.monsterScreenPoint(uid);
    pin.hidden = !point;
    if (point) pin.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px)`;
  };
  follow();
  const stop = world.onFrame(follow);

  return () => {
    stop();
    pin.remove();
  };
}
