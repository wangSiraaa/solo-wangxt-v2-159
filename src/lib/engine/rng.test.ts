import { describe, expect, it } from 'vitest';
import { probValue, shouldTrigger } from './rng';

describe('rng（可复现概率序列）', () => {
  it('同一 (seed, pass, step) 永远得到同一值', () => {
    for (const [seed, pass, step] of [[1, 0, 0], [7, 3, 5], [42, 100, 15]] as const) {
      expect(probValue(seed, pass, step)).toBe(probValue(seed, pass, step));
    }
  });

  it('值域为 [0, 1)', () => {
    for (let i = 0; i < 5000; i++) {
      const v = probValue(i % 97, Math.floor(i / 16), i % 16);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('不同 seed 产生不同序列', () => {
    const a = Array.from({ length: 32 }, (_, i) => probValue(1, 0, i));
    const b = Array.from({ length: 32 }, (_, i) => probValue(2, 0, i));
    expect(a).not.toEqual(b);
  });

  it('完整播放两遍的触发序列一致（可复现）', () => {
    const seq = (seed: number) =>
      Array.from({ length: 4 * 16 }, (_, c) =>
        shouldTrigger(seed, Math.floor(c / 16), c % 16, 0.5)
      );
    expect(seq(7)).toEqual(seq(7));
  });

  it('概率 0 永不触发，概率 1 永远触发', () => {
    for (let i = 0; i < 100; i++) {
      expect(shouldTrigger(1, 0, i, 0)).toBe(false);
      expect(shouldTrigger(1, 0, i, 1)).toBe(true);
    }
  });

  it('0.5 概率下触发率大致在合理区间', () => {
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      if (shouldTrigger(3, Math.floor(i / 16), i % 16, 0.5)) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.45);
    expect(hits / n).toBeLessThan(0.55);
  });
});
