import { describe, expect, it } from 'vitest';
import {
  globalAlignment,
  lcm,
  lcmAll,
  loopTicks,
  nextAlignments,
  pairwiseAlignments
} from './alignment';
import { BAR_TICKS } from './musicTime';

describe('alignment', () => {
  it('lcm 基本性质', () => {
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(7, 8)).toBe(56);
    expect(lcmAll([4, 6, 8])).toBe(24);
  });

  it('三对四：4×四分 与 3×四分 每 3 小节对齐', () => {
    const tracks = [
      { length: 4, subdivision: '4n' as const },
      { length: 3, subdivision: '4n' as const },
      { length: 8, subdivision: '8n' as const }
    ];
    const g = globalAlignment(tracks);
    expect(g.ticks).toBe(3 * BAR_TICKS);
    expect(g.bars).toBe(3);
  });

  it('七步循环：7×八分 对 4/4 网格每 7 小节对齐', () => {
    const tracks = [
      { length: 7, subdivision: '8n' as const }, // 672 ticks
      { length: 16, subdivision: '16n' as const }, // 768 ticks
      { length: 4, subdivision: '4n' as const } // 768 ticks
    ];
    expect(loopTicks(tracks[0])).toBe(672);
    const g = globalAlignment(tracks);
    expect(g.ticks).toBe(5376);
    expect(g.bars).toBe(7);
  });

  it('三连音细分也是整数 tick 且参与 LCM', () => {
    const tracks = [
      { length: 3, subdivision: '2t' as const }, // 768 = 1 小节
      { length: 4, subdivision: '4n' as const } // 768
    ];
    expect(globalAlignment(tracks).ticks).toBe(BAR_TICKS);
  });

  it('两两对齐覆盖所有轨道对', () => {
    const tracks = [
      { length: 4, subdivision: '4n' as const },
      { length: 3, subdivision: '4n' as const },
      { length: 5, subdivision: '8n' as const }
    ];
    const pairs = pairwiseAlignments(tracks);
    expect(pairs).toHaveLength(3);
    // 3×四分(576) 与 5×八分(480)：lcm = 2880
    const p12 = pairs.find((p) => p.aIndex === 1 && p.bIndex === 2)!;
    expect(p12.info.ticks).toBe(2880);
  });

  it('nextAlignments 从当前位置给出未来对齐点', () => {
    const tracks = [{ length: 4, subdivision: '4n' as const }];
    const period = BAR_TICKS;
    expect(nextAlignments(tracks, 0, 3)).toEqual([period, 2 * period, 3 * period]);
    expect(nextAlignments(tracks, period, 2)).toEqual([2 * period, 3 * period]);
  });
});
