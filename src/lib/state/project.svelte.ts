import { isSubdivision } from '../engine/musicTime';
import { ensureSamplesLoaded } from '../engine/samples';
import { presetThreeAgainstFour } from './presets';
import {
  isBuiltinSampleId,
  makeProject,
  makeStep,
  makeTrack,
  type Project,
  type SampleRef,
  type Track
} from './types';

const MAX_STEPS = 64;

class ProjectStore {
  project = $state<Project>(presetThreeAgainstFour());
  /** 结构变更计数（步数/细分/增删轨道），调度器据此重挂事件 */
  structuralVersion = $state(0);
  /** 每条轨道的编辑模式：触发 / 力度 / 概率 */
  editModes = $state<Record<string, 'gate' | 'velocity' | 'probability'>>({});

  private bump() {
    this.structuralVersion++;
  }

  private track(id: string): Track | undefined {
    return this.project.tracks.find((t) => t.id === id);
  }

  setBpm(bpm: number) {
    this.project.bpm = Math.min(300, Math.max(30, Math.round(bpm)));
  }

  setName(name: string) {
    this.project.name = name;
  }

  toggleStep(trackId: string, i: number) {
    const t = this.track(trackId);
    const s = t?.steps[i];
    if (s) s.on = !s.on;
  }

  setVelocity(trackId: string, i: number, v: number) {
    const t = this.track(trackId);
    const s = t?.steps[i];
    if (!s) return;
    s.velocity = clamp01(v);
    s.on = true;
  }

  setProbability(trackId: string, i: number, v: number) {
    const t = this.track(trackId);
    const s = t?.steps[i];
    if (!s) return;
    s.probability = clamp01(v);
    s.on = true;
  }

  setSubdivision(trackId: string, sub: Track['subdivision']) {
    const t = this.track(trackId);
    if (!t) return;
    t.subdivision = sub;
    this.bump();
  }

  setLength(trackId: string, len: number) {
    const t = this.track(trackId);
    if (!t) return;
    const n = Math.min(MAX_STEPS, Math.max(1, Math.round(len)));
    if (n === t.length) return;
    t.length = n;
    while (t.steps.length < n) t.steps.push(makeStep());
    t.steps.length = n;
    this.bump();
  }

  setSeed(trackId: string, seed: number) {
    const t = this.track(trackId);
    if (t) t.seed = Math.max(0, Math.round(seed));
  }

  setSample(trackId: string, sample: SampleRef) {
    const t = this.track(trackId);
    if (t) t.sample = sample;
  }

  toggleMute(trackId: string) {
    const t = this.track(trackId);
    if (t) t.mute = !t.mute;
  }

  toggleSolo(trackId: string) {
    const t = this.track(trackId);
    if (t) t.solo = !t.solo;
  }

  setEditMode(trackId: string, mode: 'gate' | 'velocity' | 'probability') {
    this.editModes[trackId] = mode;
  }

  addTrack() {
    const n = this.project.tracks.length + 1;
    this.project.tracks.push(makeTrack(`轨道 ${n}`));
    this.bump();
  }

  removeTrack(trackId: string) {
    this.project.tracks = this.project.tracks.filter((t) => t.id !== trackId);
    this.bump();
  }

  /** 载入工程（预设 / IndexedDB / 导入文件共用），并预载引用的样本 */
  async load(project: Project) {
    this.project = normalizeProject(project);
    this.bump();
    await ensureSamplesLoaded(this.project.tracks.map((t) => t.sample));
  }

  newProject() {
    this.project = makeProject('未命名工程');
    this.bump();
  }

  /** 导出：纯 JSON，样本只带引用（builtin id 或文件 hash），不含音频数据 */
  exportJson(): string {
    return JSON.stringify({ ...this.project, exportedAt: new Date().toISOString() }, null, 2);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 导入/读取时做防御性规范化，坏数据不炸界面 */
export function normalizeProject(raw: unknown): Project {
  const p = (raw ?? {}) as Partial<Project>;
  const base = makeProject(typeof p.name === 'string' && p.name ? p.name : '未命名工程');
  if (typeof p.id === 'string' && p.id) base.id = p.id;
  if (typeof p.bpm === 'number' && Number.isFinite(p.bpm)) {
    base.bpm = Math.min(300, Math.max(30, p.bpm));
  }
  if (Array.isArray(p.tracks)) {
    base.tracks = p.tracks.map((t, i) => normalizeTrack(t, i)).filter((t): t is Track => !!t);
  }
  return base;
}

function normalizeTrack(raw: unknown, index: number): Track | null {
  const t = (raw ?? {}) as Partial<Track>;
  const length = Math.min(
    MAX_STEPS,
    Math.max(1, Math.round(typeof t.length === 'number' ? t.length : 16))
  );
  const track = makeTrack(typeof t.name === 'string' && t.name ? t.name : `轨道 ${index + 1}`, {
    length
  });
  if (typeof t.id === 'string' && t.id) track.id = t.id;
  if (isSubdivision(t.subdivision)) track.subdivision = t.subdivision;
  track.mute = t.mute === true;
  track.solo = t.solo === true;
  if (typeof t.seed === 'number' && Number.isFinite(t.seed)) track.seed = Math.max(0, Math.round(t.seed));
  track.sample = normalizeSample(t.sample);
  if (Array.isArray(t.steps)) {
    for (let i = 0; i < Math.min(t.steps.length, length); i++) {
      const s = t.steps[i] as Partial<(typeof t.steps)[number]> | undefined;
      if (!s) continue;
      track.steps[i] = {
        on: s.on === true,
        velocity: typeof s.velocity === 'number' ? clamp01(s.velocity) : 0.9,
        probability: typeof s.probability === 'number' ? clamp01(s.probability) : 1
      };
    }
  }
  return track;
}

function normalizeSample(raw: unknown): SampleRef {
  const s = (raw ?? {}) as Record<string, unknown>;
  if (s.kind === 'builtin' && isBuiltinSampleId(s.id)) {
    return { kind: 'builtin', id: s.id };
  }
  if (
    s.kind === 'file' &&
    typeof s.name === 'string' &&
    typeof s.hash === 'string' &&
    typeof s.size === 'number'
  ) {
    return { kind: 'file', name: s.name, hash: s.hash, size: s.size };
  }
  return { kind: 'builtin', id: 'kick' };
}

export const projectStore = new ProjectStore();
