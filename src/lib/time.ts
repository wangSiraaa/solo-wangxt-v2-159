// 统一的音乐时间轴。
//
// 不使用浮点拍数累加（会随时间漂移），全部基于整数 tick：
//   Tone.Transport PPQ = 192，即 1 个四分音符 = 192 tick。
// 秒数只在最后一步（调度 / 游标显示）才换算，且公式单一：
//   seconds(tick) = tick / 192 * (60 / bpm)
//
// 这样“三拍对四拍”（3/4 与 4/4）、七步循环、极高速度
// 都共用同一条整数时间轴，不存在多个 setInterval 各自计时导致的错拍。

export const PPQ = 192;

/** 常用细分单位（每步 = num/den 个“全音符”；全音符 = 4 个四分音符拍） */
export interface SubdivisionSpec {
  num: number;
  den: number;
  label: string;
}

export const SUBDIVISIONS: readonly SubdivisionSpec[] = [
  { num: 1, den: 1, label: '1/1 全音符 (4 拍/步)' },
  { num: 1, den: 2, label: '1/2 二分音符 (2 拍/步)' },
  { num: 1, den: 4, label: '1/4 四分音符 (1 拍/步)' },
  { num: 1, den: 6, label: '1/6 四分三连音 (2/3 拍/步)' },
  { num: 1, den: 8, label: '1/8 八分音符 (半拍/步)' },
  { num: 1, den: 12, label: '1/12 八分三连音 (1/3 拍/步)' },
  { num: 1, den: 16, label: '1/16 十六分音符 (1/4 拍/步)' },
  { num: 1, den: 24, label: '1/24 十六分三连音 (1/6 拍/步)' },
  { num: 1, den: 32, label: '1/32 三十二分音符 (1/8 拍/步)' },
  { num: 1, den: 48, label: '1/48 卅二分三连音 (1/12 拍/步)' }
] as const;

/** 小节 → tick（beatsPerBar 以四分音符拍计，允许 3、4、7 等任意整数） */
export function barToTicks(beatsPerBar: number): number {
  return PPQ * beatsPerBar;
}

/**
 * 循环长度（tick）。
 * 细分 num/den 以“全音符”为 1（如 1/16 音符 = 全音符 /16 = 四分拍 /4），
 * 因此一步 = PPQ * 4 * num / den 个 tick。全部整数 tick，避免浮点漂移。
 */
export function loopTicksFor(steps: number, num: number, den: number): number {
  return Math.round((steps * PPQ * 4 * num) / den);
}

/** 一个细分网格的步宽（tick） */
export function stepTicks(num: number, den: number): number {
  return Math.round((PPQ * 4 * num) / den);
}

/** 一个循环包含多少个编辑网格列（步数） */
export function stepsForGrid(loopTicks: number, num: number, den: number): number {
  const st = stepTicks(num, den);
  return Math.round(loopTicks / st);
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

export function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

/**
 * 所有轨道重新同时回到各自起点的“总对齐周期”（tick）。
 * 例如 3 拍 = 576 tick 与 4 拍 = 768 tick：lcm = 2304 tick = 12 拍，
 * 即 3/4 轨道转 4 圈、4/4 轨道转 3 圈后重新对齐。
 */
export function alignmentCycleTicks(loops: number[]): number {
  return loops.reduce((acc, l) => lcm(acc, l), 1);
}

/** tick → 播放秒（单一换算入口，避免各处公式不一致） */
export function ticksToSeconds(ticks: number, bpm: number): number {
  return (ticks / PPQ) * (60 / bpm);
}

/** 播放秒 → tick */
export function secondsToTicks(seconds: number, bpm: number): number {
  return (seconds * PPQ * bpm) / 60;
}

/** tick → { 小节, 拍, tick内拍 }，按全局对齐周期显示重对齐时刻 */
export function ticksToMusicalPosition(ticks: number, beatsPerBar = 4) {
  const barTicks = PPQ * beatsPerBar;
  const bar = Math.floor(ticks / barTicks);
  const within = ticks - bar * barTicks;
  const beat = Math.floor(within / PPQ);
  const tickInBeat = within - beat * PPQ;
  return { bar: bar + 1, beat: beat + 1, tick: tickInBeat };
}

/** 轨道在全局时间轴上每次重新对齐（回到第 0 步）的时刻（tick） */
export function trackRealignmentTicks(loopTicks: number, horizonTicks: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= horizonTicks; t += loopTicks) out.push(t);
  return out;
}

/**
 * 每个轨道在 [0, horizonTicks) 内所有步进事件的绝对 tick，
 * 标注圈号 iteration（概率抽签与对齐显示都要用）。
 */
export interface PlannedEvent {
  trackId: string;
  /** 绝对 tick */
  tick: number;
  /** 轨道内第几步 */
  stepIndex: number;
  /** 第几圈（从 0 开始；重新对齐即 iteration 进位的视觉依据） */
  iteration: number;
}

export function planTrackEvents(
  trackId: string,
  loopTicks: number,
  columns: number,
  horizonTicks: number
): PlannedEvent[] {
  const events: PlannedEvent[] = [];
  if (columns <= 0 || loopTicks <= 0) return events;
  const st = loopTicks / columns; // 每步 tick（尽量保留分数精度）
  for (let tick = 0, iteration = 0; tick < horizonTicks; iteration++) {
    for (let col = 0; col < columns; col++) {
      const absTick = iteration * loopTicks + Math.round(col * st);
      if (absTick >= horizonTicks) return events;
      events.push({ trackId, tick: absTick, stepIndex: col, iteration });
    }
    tick = (iteration + 1) * loopTicks;
    if (tick >= horizonTicks) break;
  }
  return events;
}

/** 未来 N 秒对应的 tick 调度前瞻窗口 */
export function lookaheadTicks(bpm: number, seconds: number): number {
  return Math.ceil(secondsToTicks(seconds, bpm));
}
