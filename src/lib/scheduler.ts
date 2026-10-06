// 调度窗口的纯函数核心：给定 [fromTick, toTick] 区间，
// 产出每个轨道在该区间内“应该发声”的步进事件（绝对 tick）。
//
// 引擎把返回的 tick 用同一个 Transport 换算成音频秒；
// 游标用同一个 Transport 读取当前 tick。两者来自同一时钟、同一整数轴，
// 因此“实际音频事件”与“网格游标”天然一致（不依赖任何 setInterval 计时）。
import type { Project, Track } from './types';
import { rollHit } from './rng';

export interface ScheduledStep {
  trackId: string;
  track: Track;
  stepIndex: number;
  /** 第几圈（0 起） */
  iteration: number;
  /** 绝对 tick（整数） */
  tick: number;
  velocity: number;
}

export function audibleTracks(project: Project): Track[] {
  const solos = project.tracks.filter((t) => t.solo);
  return project.tracks.filter((t) => !t.muted && (solos.length === 0 || t.solo));
}

/**
 * 单轨在区间内的事件位置（不做开关/概率判断）。
 * 区间左闭右开 [fromTick, toTick)，保证前瞻窗口逐段拼接时不重不漏。
 * 步位 = round(col * loop / columns)，与网格绘制完全相同的取整规则。
 */
export function stepTicksInWindow(track: Track, fromTick: number, toTick: number): Array<{
  iteration: number;
  stepIndex: number;
  tick: number;
}> {
  const out: Array<{ iteration: number; stepIndex: number; tick: number }> = [];
  const columns = track.steps.length;
  if (columns === 0 || track.loopTicks <= 0 || toTick <= fromTick) return out;
  const stepWidth = track.loopTicks / columns;
  const span = Math.max(1, Math.round(stepWidth));

  let iteration = Math.floor(fromTick / track.loopTicks);
  let col = Math.ceil((fromTick - iteration * track.loopTicks) / stepWidth);
  if (col >= columns) {
    iteration += 1;
    col = 0;
  }

  // 安全上界：区间内最多 ceil(窗口/步宽)+1 步
  const maxSteps = Math.ceil((toTick - fromTick) / span) + 2;
  for (let n = 0; n < maxSteps; n++) {
    const tick = iteration * track.loopTicks + Math.round(col * stepWidth);
    if (tick >= toTick) break;
    if (tick >= fromTick) out.push({ iteration, stepIndex: col, tick });
    col += 1;
    if (col >= columns) {
      col = 0;
      iteration += 1;
    }
  }
  return out;
}

/** 整个工程在窗口内通过开关 + 概率抽签的事件（音频真正要触发的集合） */
export function eventsInWindow(project: Project, fromTick: number, toTick: number): ScheduledStep[] {
  const events: ScheduledStep[] = [];
  for (const track of audibleTracks(project)) {
    for (const pos of stepTicksInWindow(track, fromTick, toTick)) {
      const step = track.steps[pos.stepIndex];
      if (!step.on) continue;
      if (!rollHit(project.seed, track.id, pos.iteration, pos.stepIndex, step.probability)) continue;
      events.push({
        trackId: track.id,
        track,
        stepIndex: pos.stepIndex,
        iteration: pos.iteration,
        tick: pos.tick,
        velocity: step.velocity
      });
    }
  }
  return events;
}
