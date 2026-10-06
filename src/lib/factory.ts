import type { Project, Step, Subdivision, Track, VoiceName } from './types';
import { SUBDIVISIONS, loopTicksFor, stepTicks } from './time';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function subdiv(num: number, den: number): Subdivision {
  const found = SUBDIVISIONS.find((s) => s.num === num && s.den === den);
  return found ? { num, den, label: found.label } : { num, den, label: `${num}/${den}` };
}

export function makeStep(on = false, velocity = 0.9, probability = 1): Step {
  return { on, velocity, probability };
}

const PALETTE = ['#e5484d', '#3e63dd', '#30a46c', '#f5a623', '#8e4ec6', '#12a594', '#e54666'];

let colorIdx = 0;
export function makeTrack(partial: Partial<Track> & Pick<Track, 'name' | 'loopTicks' | 'subdiv'>): Track {
  const { steps, ...rest } = partial;
  const columns = Math.max(1, Math.round(partial.loopTicks / stepTicks(partial.subdiv.num, partial.subdiv.den)));
  const color = partial.color ?? PALETTE[colorIdx++ % PALETTE.length];
  return {
    id: uid('tr'),
    sound: { kind: 'synth', voice: 'kick' },
    muted: false,
    solo: false,
    gain: 0.9,
    pan: 0,
    color,
    ...rest,
    steps: steps ?? Array.from({ length: columns }, () => makeStep())
  };
}

interface TrackSpec {
  name: string;
  voice: VoiceName;
  /** 步数与细分（num/den）共同决定循环长度 */
  steps: number;
  num: number;
  den: number;
  /** 要点亮的步（索引），可带 {v: 力度, p: 概率} */
  hits: ReadonlyArray<number | { i: number; v?: number; p?: number }>;
  gain?: number;
  color?: string;
}

function buildTrack(spec: TrackSpec): Track {
  const loopTicks = loopTicksFor(spec.steps, spec.num, spec.den);
  const track = makeTrack({
    name: spec.name,
    loopTicks,
    subdiv: subdiv(spec.num, spec.den),
    sound: { kind: 'synth', voice: spec.voice },
    gain: spec.gain ?? 0.9,
    color: spec.color
  });
  for (const h of spec.hits) {
    const i = typeof h === 'number' ? h : h.i;
    const step = track.steps[i];
    step.on = true;
    if (typeof h !== 'number') {
      if (h.v !== undefined) step.velocity = h.v;
      if (h.p !== undefined) step.probability = h.p;
    }
  }
  return track;
}

function makeProject(name: string, bpm: number, tracks: Track[], seed = 20260222): Project {
  return {
    id: uid('proj'),
    name,
    bpm,
    seed,
    tracks,
    updatedAt: Date.now()
  };
}

/**
 * 样例 1：三拍对四拍。
 * 3/4 鼓组（每小节 3 拍）与 4/4 鼓组同时起跑，
 * 3 和 4 拍后它们在第 12 拍处重新对齐（可在“对齐视图”查看）。
 */
export function presetThreeAgainstFour(): Project {
  // 3/4 轨道：16 分网格，每小节 12 步
  const waltz = buildTrack({
    name: '3/4 · 底鼓+军鼓',
    voice: 'kick',
    steps: 12,
    num: 1,
    den: 16,
    hits: [0, 4, 8],
    color: '#e5484d'
  });
  const waltzSnare = buildTrack({
    name: '3/4 · 军鼓',
    voice: 'snare',
    steps: 12,
    num: 1,
    den: 16,
    hits: [{ i: 4, v: 0.7 }, { i: 10, v: 0.7 }],
    gain: 0.8,
    color: '#f5a623'
  });
  // 4/4 轨道：16 分网格，每小节 16 步
  const four = buildTrack({
    name: '4/4 · 四踩底鼓',
    voice: 'kick',
    steps: 16,
    num: 1,
    den: 16,
    hits: [0, 4, 8, 12],
    color: '#3e63dd'
  });
  const fourHat = buildTrack({
    name: '4/4 · 八分镲',
    voice: 'hatClosed',
    steps: 16,
    num: 1,
    den: 16,
    hits: Array.from({ length: 8 }, (_, k) => k * 2),
    gain: 0.55,
    color: '#30a46c'
  });
  return makeProject('三拍对四拍 (3/4 vs 4/4)', 112, [waltz, waltzSnare, four, fourHat]);
}

/**
 * 样例 2：七步循环。
 * 7 个八分音步构成 3.5 拍（7/8 小节）的奇数循环，与常规 4 拍（4/4）叠加，
 * lcm(3.5, 4) = 28 拍后重新对齐：七步循环转 8 圈、4/4 转 7 圈。
 * 其中几步使用概率触发，演示可复现的概率序列。
 */
export function presetSevenStep(): Project {
  const seven = buildTrack({
    name: '7 步循环 · 底鼓',
    voice: 'kick',
    steps: 7,
    num: 1,
    den: 8,
    hits: [0, 3, { i: 6, v: 0.6, p: 0.5 }],
    color: '#8e4ec6'
  });
  const sevenSnare = buildTrack({
    name: '7 步循环 · 军鼓(概率)',
    voice: 'snare',
    steps: 7,
    num: 1,
    den: 8,
    hits: [
      { i: 2, p: 0.7 },
      { i: 5, v: 0.6 }
    ],
    gain: 0.85,
    color: '#e54666'
  });
  const straight = buildTrack({
    name: '16 步参考 · 镲',
    voice: 'hatClosed',
    steps: 16,
    num: 1,
    den: 16,
    hits: Array.from({ length: 16 }, (_, k) => k),
    gain: 0.4,
    color: '#30a46c'
  });
  const straightKick = buildTrack({
    name: '16 步参考 · 底鼓',
    voice: 'kick',
    steps: 16,
    num: 1,
    den: 16,
    hits: [0, 8],
    gain: 0.8,
    color: '#3e63dd'
  });
  return makeProject('七步循环 (7/8 vs 4/4)', 128, [seven, sevenSnare, straight, straightKick], 777);
}

/**
 * 样例 3：极高速度（240 BPM）。
 * 用十六分三连音细分（1/24 音符 = 1/6 拍，48 tick/步），
 * 4 拍循环共 24 步；另有一条慢速 3 拍循环检查游标在高速下仍与真实事件对齐。
 */
export function presetExtremeTempo(): Project {
  // 1/24 细分：一拍 6 步，4 拍 = 24 列
  const blast = buildTrack({
    name: '240BPM · 十六分三连音底鼓',
    voice: 'kick',
    steps: 24,
    num: 1,
    den: 24,
    hits: Array.from({ length: 12 }, (_, k) => k * 2),
    gain: 0.7,
    color: '#e5484d'
  });
  const snare = buildTrack({
    name: '240BPM · 重拍军鼓',
    voice: 'snare',
    steps: 24,
    num: 1,
    den: 24,
    hits: [0, 6, 12, 18],
    gain: 0.85,
    color: '#f5a623'
  });
  const slow = buildTrack({
    name: '慢速 3 拍长音 (tom)',
    voice: 'tom',
    steps: 3,
    num: 1,
    den: 4,
    hits: [0],
    gain: 0.9,
    color: '#12a594'
  });
  return makeProject('极高速度 (240 BPM)', 240, [blast, snare, slow], 9001);
}

export function blankProject(): Project {
  const kick = buildTrack({
    name: '4/4 底鼓',
    voice: 'kick',
    steps: 16,
    num: 1,
    den: 16,
    hits: [0, 4, 8, 12]
  });
  return makeProject('未命名工程', 120, [kick]);
}

export const PRESETS = [
  { id: 'three-vs-four', label: '三拍对四拍', build: presetThreeAgainstFour },
  { id: 'seven-step', label: '七步循环', build: presetSevenStep },
  { id: 'extreme', label: '极高速度', build: presetExtremeTempo },
  { id: 'blank', label: '空白工程', build: blankProject }
] as const;
