/**
 * 统一的音乐时间换算核心。
 *
 * 全应用只认一种音乐时间单位：tick（整数，PPQ = 192，与 Tone.Transport 默认一致）。
 * 秒数只在边界处（显示、调度回调）通过 BPM 换算一次，任何地方不允许
 * 自己维护"第几步过了几秒"之类的浮点累加器 —— 那是错拍的来源。
 */

export const PPQ = 192;
/** 固定 4/4：一小节的 tick 数 */
export const BAR_TICKS = PPQ * 4;

export const SUBDIVISIONS = [
  '1m', '2n', '2t', '4n', '4t', '8n', '8t', '16n', '16t', '32n', '32t'
] as const;
export type Subdivision = (typeof SUBDIVISIONS)[number];

/** 每个细分单位占多少 tick（整数，三连音也整除） */
export const SUBDIVISION_TICKS: Record<Subdivision, number> = {
  '1m': 768,
  '2n': 384,
  '2t': 256,
  '4n': 192,
  '4t': 128,
  '8n': 96,
  '8t': 64,
  '16n': 48,
  '16t': 32,
  '32n': 24,
  '32t': 16
};

export const SUBDIVISION_LABELS: Record<Subdivision, string> = {
  '1m': '全音符',
  '2n': '二分', '2t': '二分三连音',
  '4n': '四分', '4t': '四分三连音',
  '8n': '八分', '8t': '八分三连音',
  '16n': '十六分', '16t': '十六分三连音',
  '32n': '三十二分', '32t': '三十二分三连音'
};

export function isSubdivision(v: unknown): v is Subdivision {
  return typeof v === 'string' && (SUBDIVISIONS as readonly string[]).includes(v);
}

/* ---------- 音乐时间 ↔ 秒（唯一换算点） ---------- */

export function ticksToBeats(ticks: number): number {
  return ticks / PPQ;
}
export function beatsToTicks(beats: number): number {
  return beats * PPQ;
}
export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}
export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}
export function ticksToSeconds(ticks: number, bpm: number): number {
  return beatsToSeconds(ticksToBeats(ticks), bpm);
}
export function secondsToTicks(seconds: number, bpm: number): number {
  return beatsToTicks(secondsToBeats(seconds, bpm));
}

/** 把 tick 格式化成 "小节.拍"（1 起计），如 769 tick → "2.1" */
export function formatBarsBeats(ticks: number): string {
  const bar = Math.floor(ticks / BAR_TICKS) + 1;
  const beat = Math.floor((ticks % BAR_TICKS) / PPQ) + 1;
  return `${bar}.${beat}`;
}

export function formatSeconds(sec: number): string {
  return sec.toFixed(2) + 's';
}
