import {
  makeProject,
  makeStep,
  makeTrack,
  type Project,
  type StepState,
  type Track
} from './types';

function steps(n: number, on: number[], opts: Partial<StepState> = {}): StepState[] {
  return Array.from({ length: n }, (_, i) => ({
    ...makeStep(),
    ...opts,
    on: on.includes(i)
  }));
}

/** 三对四：4 步四分音符 对 3 步四分音符，每 3 小节重新对齐 */
export function presetThreeAgainstFour(): Project {
  const p = makeProject('三对四 (3:4)');
  p.bpm = 100;
  p.tracks = [
    makeTrack('底鼓 · 4步/四分', {
      subdivision: '4n',
      length: 4,
      steps: steps(4, [0, 1, 2, 3], { velocity: 1 }),
      sample: { kind: 'builtin', id: 'kick' }
    }),
    makeTrack('军鼓 · 3步/四分', {
      subdivision: '4n',
      length: 3,
      steps: steps(3, [0, 1, 2], { velocity: 0.85 }),
      sample: { kind: 'builtin', id: 'snare' }
    }),
    makeTrack('踩镲 · 8步/八分', {
      subdivision: '8n',
      length: 8,
      steps: steps(8, [0, 1, 2, 3, 4, 5, 6, 7]).map((s, i) => ({
        ...s,
        velocity: i % 2 === 0 ? 0.7 : 0.4
      })),
      sample: { kind: 'builtin', id: 'hat' }
    })
  ];
  return p;
}

/** 七步循环：7 步八分音符（3.5 拍）对 4/4 网格，每 7 小节重新对齐 */
export function presetSevenStep(): Project {
  const p = makeProject('七步循环 (7×八分)');
  p.bpm = 120;
  p.tracks = [
    makeTrack('底鼓 · 7步/八分', {
      subdivision: '8n',
      length: 7,
      steps: steps(7, [0, 3, 5], { velocity: 1 }),
      sample: { kind: 'builtin', id: 'kick' }
    }),
    makeTrack('军鼓 · 4步/四分', {
      subdivision: '4n',
      length: 4,
      steps: steps(4, [1, 3], { velocity: 0.9 }),
      sample: { kind: 'builtin', id: 'snare' }
    }),
    makeTrack('踩镲 · 16步/十六分', {
      subdivision: '16n',
      length: 16,
      steps: steps(16, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]).map((s, i) => ({
        ...s,
        velocity: i % 4 === 0 ? 0.8 : 0.45,
        // 展示概率：部分弱位 50% 概率
        probability: i % 4 === 2 ? 0.5 : 1
      })),
      seed: 7,
      sample: { kind: 'builtin', id: 'hat' }
    })
  ];
  return p;
}

/** 极高速度：240 BPM + 三十二分音符，检验调度精度 */
export function presetHighSpeed(): Project {
  const p = makeProject('极速 (240 BPM · 32分)');
  p.bpm = 240;
  p.tracks = [
    makeTrack('底鼓 · 8步/八分', {
      subdivision: '8n',
      length: 8,
      steps: steps(8, [0, 4], { velocity: 1 }),
      sample: { kind: 'builtin', id: 'kick' }
    }),
    makeTrack('军鼓 · 8步/八分', {
      subdivision: '8n',
      length: 8,
      steps: steps(8, [2, 6], { velocity: 0.9 }),
      sample: { kind: 'builtin', id: 'snare' }
    }),
    makeTrack('踩镲 · 16步/三十二分', {
      subdivision: '32n',
      length: 16,
      steps: steps(16, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]).map((s, i) => ({
        ...s,
        velocity: i % 4 === 0 ? 0.75 : 0.4
      })),
      sample: { kind: 'builtin', id: 'hat' }
    }),
    makeTrack('边击 · 5步/十六分', {
      subdivision: '16n',
      length: 5,
      steps: steps(5, [0, 2, 4], { velocity: 0.8, probability: 0.8 }),
      seed: 42,
      sample: { kind: 'builtin', id: 'rim' }
    })
  ];
  return p;
}

export const PRESETS: { label: string; make: () => Project }[] = [
  { label: '三对四 (3:4)', make: presetThreeAgainstFour },
  { label: '七步循环 (7×八分)', make: presetSevenStep },
  { label: '极速 (240 BPM)', make: presetHighSpeed }
];
