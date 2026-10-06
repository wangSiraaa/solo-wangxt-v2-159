/**
 * 可复现概率序列。
 *
 * 不用有状态的 PRNG 流（那样 seek / 重新调度后序列就对不上了），
 * 而是对 (seed, 循环遍数 pass, 步号 step) 做整数哈希，得到 [0,1) 的确定值。
 * 同一 seed 下，第 p 遍循环的第 i 步永远得到同一个数 —— 与何时开始播放、
 * 是否中途改 tempo、是否重新调度全部无关。
 */

function mix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

function hash2(a: number, b: number): number {
  return mix32((mix32(a | 0) ^ Math.imul(b | 0, 0x9e3779b1)) | 0);
}

/** 返回 [0, 1) 的确定伪随机值 */
export function probValue(seed: number, pass: number, step: number): number {
  return hash2(hash2(seed, pass), step) / 4294967296;
}

/** 该步在本次循环中是否触发 */
export function shouldTrigger(seed: number, pass: number, step: number, probability: number): boolean {
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  return probValue(seed, pass, step) < probability;
}
