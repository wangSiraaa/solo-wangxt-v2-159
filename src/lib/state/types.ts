import type { Subdivision } from '../engine/musicTime';

/** 样本引用：导出工程时只带引用，不带音频数据 */
export type SampleRef =
  | { kind: 'builtin'; id: BuiltinSampleId }
  | { kind: 'file'; name: string; hash: string; size: number };

export const BUILTIN_SAMPLE_IDS = ['kick', 'snare', 'hat', 'clap', 'tom', 'rim'] as const;
export type BuiltinSampleId = (typeof BUILTIN_SAMPLE_IDS)[number];

export function isBuiltinSampleId(v: unknown): v is BuiltinSampleId {
  return typeof v === 'string' && (BUILTIN_SAMPLE_IDS as readonly string[]).includes(v);
}

export interface StepState {
  on: boolean;
  /** 0..1 */
  velocity: number;
  /** 0..1，该步触发概率 */
  probability: number;
}

export interface Track {
  id: string;
  name: string;
  subdivision: Subdivision;
  /** 循环步数 */
  length: number;
  steps: StepState[];
  mute: boolean;
  solo: boolean;
  /** 概率序列种子 */
  seed: number;
  sample: SampleRef;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  bpm: number;
  tracks: Track[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export interface StoredProject extends Project {
  updatedAt: number;
}

export interface StoredSample {
  hash: string;
  name: string;
  size: number;
  blob: Blob;
}

export function makeStep(): StepState {
  return { on: false, velocity: 0.9, probability: 1 };
}

export function makeSteps(n: number): StepState[] {
  return Array.from({ length: n }, makeStep);
}

export function makeTrack(name: string, partial: Partial<Track> = {}): Track {
  const length = partial.length ?? 16;
  return {
    id: crypto.randomUUID(),
    name,
    subdivision: '16n',
    length,
    mute: false,
    solo: false,
    seed: 1,
    sample: { kind: 'builtin', id: 'kick' },
    ...partial,
    steps: partial.steps ?? makeSteps(length)
  };
}

export function makeProject(name: string): Project {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name,
    bpm: 120,
    tracks: []
  };
}
