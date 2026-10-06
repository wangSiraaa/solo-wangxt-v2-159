/**
 * 样本引擎：所有内置鼓音色由 Tone.js 合成器本地合成（无任何网络加载）。
 * 用户可通过文件选择器导入本地音频文件，Blob 存 IndexedDB，工程里只留引用。
 */
import * as Tone from 'tone';
import type { SampleRef } from '../state/types';
import { getSample, putSample } from '../state/db';

export const BUILTIN_LABELS: Record<string, string> = {
  kick: '底鼓',
  snare: '军鼓',
  hat: '踩镲',
  clap: '拍手',
  tom: '嗵鼓',
  rim: '边击'
};

let master: Tone.Gain | null = null;
const synths = new Map<string, Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth>();
const fileBuffers = new Map<string, AudioBuffer>();
/** 引用在 IndexedDB 中缺失的样本 hash（UI 用来打"缺失"标记） */
export const missingSampleHashes = new Set<string>();

function ensureMaster(): Tone.Gain {
  if (!master) {
    const limiter = new Tone.Limiter(-1);
    limiter.toDestination();
    master = new Tone.Gain(0.9).connect(limiter);
  }
  return master;
}

function ensureSynth(id: string) {
  if (synths.has(id)) return synths.get(id)!;
  const out = ensureMaster();
  let node: Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth;
  switch (id) {
    case 'kick':
      node = new Tone.MembraneSynth({
        pitchDecay: 0.04,
        octaves: 7,
        envelope: { attack: 0.001, decay: 0.35, sustain: 0.01, release: 0.4 }
      });
      break;
    case 'snare':
      node = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0 }
      });
      break;
    case 'hat':
      node = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5
      });
      break;
    case 'clap': {
      const filter = new Tone.Filter(1500, 'bandpass').connect(out);
      node = new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.003, decay: 0.25, sustain: 0 }
      }).connect(filter);
      break;
    }
    case 'tom':
      node = new Tone.MembraneSynth({
        pitchDecay: 0.08,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 }
      });
      break;
    default: // rim
      node = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.03, release: 0.01 },
        harmonicity: 8.4,
        modulationIndex: 40,
        resonance: 2500,
        octaves: 1
      });
  }
  if (id !== 'clap') node.connect(out);
  synths.set(id, node);
  return node;
}

const SYNTH_NOTES: Record<string, string> = {
  kick: 'C1',
  snare: 'C4',
  hat: 'G5',
  clap: 'C4',
  tom: 'G1',
  rim: 'C6'
};

/** 在精确的 AudioContext 时刻触发一个样本 */
export function triggerSample(sample: SampleRef, time: number, velocity: number): void {
  if (sample.kind === 'builtin') {
    const synth = ensureSynth(sample.id);
    if (synth instanceof Tone.NoiseSynth) {
      synth.triggerAttackRelease('16n', time, velocity);
    } else {
      synth.triggerAttackRelease(SYNTH_NOTES[sample.id] ?? 'C2', 0.2, time, velocity);
    }
    return;
  }
  const buf = fileBuffers.get(sample.hash);
  if (!buf) {
    missingSampleHashes.add(sample.hash);
    return;
  }
  const gain = new Tone.Gain(velocity).connect(ensureMaster());
  const src = new Tone.ToneBufferSource(buf).connect(gain);
  src.start(time);
  src.onended = () => {
    src.dispose();
    gain.dispose();
  };
}

/** 导入本地音频文件：解码 + 计算 hash + Blob 存 IndexedDB，返回引用 */
export async function importSampleFile(file: File): Promise<SampleRef> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);

  const ctx = Tone.getContext().rawContext;
  const audio = await ctx.decodeAudioData(bytes.slice(0));
  fileBuffers.set(hash, audio);
  missingSampleHashes.delete(hash);

  await putSample({ hash, name: file.name, size: file.size, blob: new Blob([bytes]) });
  return { kind: 'file', name: file.name, hash, size: file.size };
}

/** 工程加载后调用：把 file 类引用从 IndexedDB 解码进内存；缺失的记录下来 */
export async function ensureSamplesLoaded(refs: SampleRef[]): Promise<void> {
  for (const ref of refs) {
    if (ref.kind !== 'file' || fileBuffers.has(ref.hash)) continue;
    const rec = await getSample(ref.hash);
    if (!rec) {
      missingSampleHashes.add(ref.hash);
      continue;
    }
    try {
      const buf = await Tone.getContext().rawContext.decodeAudioData(await rec.blob.arrayBuffer());
      fileBuffers.set(ref.hash, buf);
      missingSampleHashes.delete(ref.hash);
    } catch {
      missingSampleHashes.add(ref.hash);
    }
  }
}

export function isSampleMissing(ref: SampleRef): boolean {
  return ref.kind === 'file' && missingSampleHashes.has(ref.hash);
}
