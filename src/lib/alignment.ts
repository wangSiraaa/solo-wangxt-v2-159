// 对齐分析：不同循环长度的轨道何时同时回到各自起点。
// 全部是整数 tick 的纯计算，与播放时钟无关，可离线查看。
import type { Project, Track } from './types';
import { PPQ, alignmentCycleTicks, gcd, ticksToSeconds } from './time';

export interface AlignmentPoint {
  tick: number;
  seconds: number;
  /** 各轨道在此刻已经转完的圈数（从 0 开始；此点上全部同时回起点） */
  iterations: Record<string, number>;
}

export interface TrackPhaseInfo {
  trackId: string;
  name: string;
  loopTicks: number;
  loopBeats: number;
  loopSeconds: number;
  /** 在一个总对齐周期内转多少圈 */
  cyclesInPeriod: number;
  color: string;
}

export interface AlignmentReport {
  cycleTicks: number;
  cycleBeats: number;
  cycleSeconds: number;
  /** 依次“共同回到起点”的时刻，第一个是 t=0 */
  points: AlignmentPoint[];
  tracks: TrackPhaseInfo[];
  /** 最小对齐粒度（所有循环长度的 gcd，tick） */
  gridTicks: number;
}

export function analyzeAlignment(project: Project, maxPoints = 12): AlignmentReport {
  const loops = project.tracks.map((t) => t.loopTicks);
  const cycleTicks = alignmentCycleTicks(loops);
  const gridTicks = loops.reduce((a, b) => gcd(a, b), loops[0] ?? 1);

  const tracks: TrackPhaseInfo[] = project.tracks.map((t) => ({
    trackId: t.id,
    name: t.name,
    loopTicks: t.loopTicks,
    loopBeats: t.loopTicks / PPQ,
    loopSeconds: ticksToSeconds(t.loopTicks, project.bpm),
    cyclesInPeriod: cycleTicks / t.loopTicks,
    color: t.color
  }));

  const points: AlignmentPoint[] = [];
  let n = 0;
  while (true) {
    const tick = n * cycleTicks;
    const iterations: Record<string, number> = {};
    for (const t of project.tracks) iterations[t.id] = tick / t.loopTicks;
    points.push({ tick, seconds: ticksToSeconds(tick, project.bpm), iterations });
    n += 1;
    if (n >= maxPoints) break;
  }

  return {
    cycleTicks,
    cycleBeats: cycleTicks / PPQ,
    cycleSeconds: ticksToSeconds(cycleTicks, project.bpm),
    points,
    tracks,
    gridTicks
  };
}

/**
 * 某一全局 tick 上每个轨道落在自身网格的第几步/第几圈，
 * 供游标行同时显示各轨道的相位。
 */
export function trackPhaseAt(track: Track, tick: number): { iteration: number; stepIndex: number; phase: number } {
  const columns = track.steps.length || 1;
  const iteration = Math.floor(tick / track.loopTicks);
  const within = tick - iteration * track.loopTicks;
  const stepWidth = track.loopTicks / columns;
  const stepIndex = Math.min(columns - 1, Math.floor(within / stepWidth));
  return { iteration, stepIndex, phase: within / track.loopTicks };
}

/** 在一个周期内每个轨道“回到起点”的全部时刻（用于时间轴上画标记） */
export function loopBoundaryTicks(track: Track, cycleTicks: number): number[] {
  const out: number[] = [];
  for (let tick = 0; tick <= cycleTicks; tick += track.loopTicks) out.push(tick);
  return out;
}

/** 人类可读的拍数，如 12、3.5 */
export function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? `${beats}` : beats.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
