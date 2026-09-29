/**
 * 战斗机制按章节逐步解锁：还没教的机制，界面上不出现，逻辑上也用不了。
 * 这样每一章的第一场战斗只讲一两样新东西，不会一开始就把所有按钮都堆给玩家。
 *
 * 数字是“最早在第几章（章节序号，序章为 0）可以用”。解锁看的是玩家已经走到的最远章节，
 * 所以通关后回头重玩序章，已经学会的机制照样能用。
 *
 *   序章  只有短剑：认识双方的红心矩阵、怪物的下一招、怎样攻击。
 *   第 1 章 拿到钩镰：连击、充能（钩镰要花充能）、追击，以及红心药水。
 *   第 2 章 防御与等待。
 *   第 3 章 撤退（开始有会追击的骑士）。
 */
export const FEATURE_CHAPTER = {
  combo: 1,
  energy: 1,
  potion: 1,
  shield: 2,
  wait: 2,
  retreat: 3,
};

/** 全部机制都已解锁（测试和逻辑层的默认值）。 */
export const ALL_FEATURES = new Set(Object.keys(FEATURE_CHAPTER));

/** 走到第 chapter 章时已经解锁的机制。 */
export function featuresAt(chapter) {
  return new Set(Object.entries(FEATURE_CHAPTER).filter(([, from]) => chapter >= from).map(([name]) => name));
}
