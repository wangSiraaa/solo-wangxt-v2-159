import { describe, expect, it } from 'vitest';
import {
  beatsToSeconds,
  formatBarsBeats,
  PPQ,
  secondsToTicks,
  SUBDIVISION_TICKS,
  ticksToBeats,
  ticksToSeconds
} from './musicTime';

describe('musicTime', () => {
  it('拍 ↔ 秒换算（唯一换算公式）', () => {
    expect(beatsToSeconds(1, 120)).toBeCloseTo(0.5);
    expect(beatsToSeconds(4, 60)).toBeCloseTo(4);
    expect(ticksToSeconds(PPQ, 120)).toBeCloseTo(0.5);
  });

  it('秒 → tick 与 tick → 秒互逆', () => {
    for (const bpm of [60, 100, 120, 240]) {
      const ticks = 1234;
      expect(secondsToTicks(ticksToSeconds(ticks, bpm), bpm)).toBeCloseTo(ticks, 6);
    }
  });

  it('细分单位 tick 表（PPQ=192，三连音整除）', () => {
    expect(SUBDIVISION_TICKS['4n']).toBe(192);
    expect(SUBDIVISION_TICKS['8n']).toBe(96);
    expect(SUBDIVISION_TICKS['16n']).toBe(48);
    expect(SUBDIVISION_TICKS['8t']).toBe(64);
    expect(SUBDIVISION_TICKS['1m']).toBe(768);
    for (const v of Object.values(SUBDIVISION_TICKS)) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('ticksToBeats', () => {
    expect(ticksToBeats(PPQ)).toBe(1);
    expect(ticksToBeats(PPQ * 4)).toBe(4);
  });

  it('formatBarsBeats', () => {
    expect(formatBarsBeats(0)).toBe('1.1');
    expect(formatBarsBeats(768)).toBe('2.1');
    expect(formatBarsBeats(768 + 192)).toBe('2.2');
  });
});
