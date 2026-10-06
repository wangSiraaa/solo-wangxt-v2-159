// 固定种子的可复现随机数。
// mulberry32：轻量、确定性强；抽签序列由 (seed, trackId, iteration, stepIndex)
// 派生，保证：
//   1. 同一种子下每次播放的概率命中完全相同（可复现）；
//   2. 改变一个轨道不会改变其他轨道的抽签结果；
//   3. 不依赖 Math.random，也不依赖“已经播放过多少”这种可变状态。

/** 字符串经 FNV-1a 混入种子，得到 32 位无符号整数 */
export function hashSeed(seed: number, salt: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG，返回 [0,1) 的伪随机数 */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 第 iteration 圈、第 step 步是否命中。
 * 纯函数：同样的参数永远得到同样的结果。
 */
export function rollHit(
  seed: number,
  trackSalt: string,
  iteration: number,
  stepIndex: number,
  probability: number
): boolean {
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  const h = hashSeed(seed, `${trackSalt}|${iteration}|${stepIndex}`);
  return mulberry32(h)() < probability;
}

/**
 * 生成一个轨道整圈的命中结果（供 UI 预览“本圈哪些概率步会响”）。
 * 每次重置/重新对齐时 iteration 归零，画面与实际触发一致。
 */
export function rollCycle(
  seed: number,
  trackSalt: string,
  iteration: number,
  probabilities: number[]
): boolean[] {
  return probabilities.map((p, i) => rollHit(seed, trackSalt, iteration, i, p));
}
