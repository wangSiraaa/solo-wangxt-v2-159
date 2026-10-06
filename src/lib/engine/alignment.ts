/**
 * 轨道循环对齐（重新对齐时刻）计算。
 * 全部在整数 tick 域内做 LCM，无浮点误差。
 */
import { BAR_TICKS, SUBDIVISION_TICKS, ticksToSeconds, type Subdivision } from './musicTime';

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return (a / gcd(a, b)) * b;
}

export function lcmAll(nums: number[]): number {
  return nums.reduce((acc, n) => lcm(acc, n), 1);
}

export interface LoopLike {
  length: number;
  subdivision: Subdivision;
}

/** 一条轨道完整循环一次的 tick 数 */
export function loopTicks(track: LoopLike): number {
  return track.length * SUBDIVISION_TICKS[track.subdivision];
}

export interface AlignmentInfo {
  ticks: number;
  bars: number; // 以小节为单位（可为分数的上取整展示由调用方决定）
  secondsAt: (bpm: number) => number;
}

export function makeAlignment(ticks: number): AlignmentInfo {
  return {
    ticks,
    bars: ticks / BAR_TICKS,
    secondsAt: (bpm: number) => ticksToSeconds(ticks, bpm)
  };
}

/** 全部轨道重新对齐的周期 */
export function globalAlignment(tracks: LoopLike[]): AlignmentInfo {
  return makeAlignment(lcmAll(tracks.map(loopTicks)));
}

export interface PairAlignment {
  aIndex: number;
  bIndex: number;
  info: AlignmentInfo;
}

/** 任意两条轨道两两重新对齐的周期 */
export function pairwiseAlignments(tracks: LoopLike[]): PairAlignment[] {
  const out: PairAlignment[] = [];
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      out.push({
        aIndex: i,
        bIndex: j,
        info: makeAlignment(lcm(loopTicks(tracks[i]), loopTicks(tracks[j])))
      });
    }
  }
  return out;
}

/** 从当前位置（tick）起，接下来的几次全局对齐点（tick） */
export function nextAlignments(tracks: LoopLike[], fromTicks: number, count: number): number[] {
  const period = lcmAll(tracks.map(loopTicks));
  if (period <= 0) return [];
  const first = Math.max(period, Math.ceil((fromTicks + 1) / period) * period);
  return Array.from({ length: count }, (_, i) => first + i * period);
}
