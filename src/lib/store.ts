// 应用状态层（Svelte store）。所有编辑先落到这里，再同步给音频引擎。
import { writable, derived, get } from 'svelte/store';
import * as Tone from 'tone';
import type { Project, SampleMeta, Step, Subdivision, Track, VoiceName } from './types';
import { PRESETS, makeStep, makeTrack, subdiv, uid } from './factory';
import { loopTicksFor, stepTicks } from './time';
import { engine } from './engine';
import {
  deleteProject as idbDeleteProject,
  listProjects,
  loadMostRecentProject,
  saveProject,
  listSamples,
  getSample,
  putSample,
  deleteSample as idbDeleteSample,
  downloadProjectFile,
  parseProjectFile,
  importEmbeddedSamples,
  sha256Hex
} from './storage';

interface AppState {
  project: Project;
  dirty: boolean;
  playing: boolean;
  /** 当前 tick 位置（rAF 更新；只读引擎时钟） */
  tick: number;
  /** 最近触发的步（闪烁）：trackId -> { step, at } */
  flashes: Record<string, { step: number; at: number }>;
  samples: SampleMeta[];
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  toast: string | null;
}

const initial: AppState = {
  project: PRESETS[0].build(),
  dirty: false,
  playing: false,
  tick: 0,
  flashes: {},
  samples: [],
  saveState: 'idle',
  toast: null
};

function createAppStore() {
  const store = writable<AppState>(initial);
  const { subscribe, update } = store;
  const state = (): AppState => get(store);

  let rafId = 0;

  function rafLoop() {
    if (engine.isPlaying) {
      const tick = engine.currentTick();
      const now = performance.now();
      update((s) => {
        // 清理超过 140ms 的闪烁（节流执行）
        let flashes = s.flashes;
        let changed = false;
        for (const [id, f] of Object.entries(flashes)) {
          if (now - f.at >= 140) {
            if (!changed) flashes = { ...flashes };
            delete flashes[id];
            changed = true;
          }
        }
        return tick === s.tick && !changed ? s : { ...s, tick, flashes };
      });
    }
    rafId = requestAnimationFrame(rafLoop);
  }

  engine.onTrigger = (info) => {
    update((s) => ({
      ...s,
      flashes: { ...s.flashes, [info.trackId]: { step: info.stepIndex, at: performance.now() } }
    }));
  };

  /** 所有结构性编辑的唯一入口：克隆 → 修改 → 同步引擎（不重置播放位置） */
  function mutate(fn: (p: Project) => void) {
    update((s) => {
      const project = structuredClone(s.project);
      fn(project);
      project.updatedAt = Date.now();
      engine.updateProject(project);
      return { ...s, project, dirty: true };
    });
  }

  async function loadIntoEngine(project: Project) {
    engine.loadProject(project);
    // 已授权音频（用户点过播放）后，把采样重新解码挂回
    const ids = new Set<string>();
    for (const t of project.tracks) if (t.sound.kind === 'sample') ids.add(t.sound.sampleId);
    for (const id of ids) {
      const stored = await getSample(id);
      if (stored) {
        const buf = await Tone.getContext().rawContext.decodeAudioData(await stored.blob.arrayBuffer());
        await engine.addSample(id, buf);
      }
    }
  }

  return {
    subscribe,
    init: async () => {
      let project: Project | undefined;
      try {
        project = await loadMostRecentProject();
      } catch {
        project = undefined;
      }
      if (!project) project = PRESETS[0].build();
      engine.loadProject(project);
      const samples = await listSamples().catch(() => []);
      update(() => ({ ...initial, project: project as Project, samples }));
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(rafLoop);
    },
    loadPreset: (id: string) => {
      const preset = PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const project = preset.build();
      engine.loadProject(project);
      update((s) => ({ ...s, project, dirty: true, tick: 0, flashes: {}, playing: false }));
    },
    play: async () => {
      await engine.init();
      await engine.play();
      update((s) => ({ ...s, playing: true }));
    },
    pause: () => {
      engine.pause();
      update((s) => ({ ...s, playing: false }));
    },
    stop: () => {
      engine.stop();
      update((s) => ({ ...s, playing: false, tick: 0, flashes: {} }));
    },
    setBpm: (bpm: number) => mutate((p) => void (p.bpm = Math.min(400, Math.max(20, Math.round(bpm * 10)) / 10))),
    setSeed: (seed: number) => mutate((p) => void (p.seed = (seed | 0) >>> 0)),
    randomizeSeed: () => mutate((p) => void (p.seed = (Math.floor(Math.random() * 2 ** 31) | 0) >>> 0)),

    // ---- 轨道编辑 ----
    toggleStep: (trackId: string, index: number) =>
      mutate((p) => {
        const step = p.tracks.find((x) => x.id === trackId)?.steps[index];
        if (step) step.on = !step.on;
      }),
    setStepField: <K extends keyof Step>(trackId: string, index: number, field: K, value: Step[K]) =>
      mutate((p) => {
        const step = p.tracks.find((x) => x.id === trackId)?.steps[index];
        if (step) step[field] = value;
      }),
    toggleMute: (trackId: string) =>
      mutate((p) => {
        const t = p.tracks.find((x) => x.id === trackId);
        if (t) t.muted = !t.muted;
      }),
    toggleSolo: (trackId: string) =>
      mutate((p) => {
        const t = p.tracks.find((x) => x.id === trackId);
        if (t) t.solo = !t.solo;
      }),
    setTrackGain: (trackId: string, gain: number) =>
      mutate((p) => {
        const t = p.tracks.find((x) => x.id === trackId);
        if (t) t.gain = gain;
      }),
    setTrackName: (trackId: string, name: string) =>
      mutate((p) => {
        const t = p.tracks.find((x) => x.id === trackId);
        if (t) t.name = name;
      }),
    setVoice: (trackId: string, voice: VoiceName) =>
      mutate((p) => {
        const t = p.tracks.find((x) => x.id === trackId);
        if (t) t.sound = { kind: 'synth', voice };
      }),
    /** 改循环长度 / 细分：保留已有步数据，超出的裁剪，不足的补空步 */
    setTrackGrid: (trackId: string, columns: number, sd: Subdivision) =>
      mutate((p) => {
        const t = p.tracks.find((x) => x.id === trackId);
        if (!t) return;
        t.subdiv = sd;
        t.loopTicks = loopTicksFor(columns, sd.num, sd.den);
        const old = t.steps;
        const next: Step[] = [];
        for (let i = 0; i < columns; i++) next.push(old[i] ? structuredClone(old[i]) : makeStep());
        t.steps = next;
      }),
    removeTrack: (trackId: string) =>
      mutate((p) => {
        p.tracks = p.tracks.filter((t) => t.id !== trackId);
      }),
    addTrack: (voice: VoiceName = 'hatClosed') =>
      mutate((p) => {
        const sd = subdiv(1, 16);
        const track = makeTrack({
          name: `轨道 ${p.tracks.length + 1}`,
          loopTicks: loopTicksFor(16, 1, 16),
          subdiv: sd,
          sound: { kind: 'synth', voice }
        });
        p.tracks.push(track);
      }),

    // ---- 持久化 ----
    save: async () => {
      update((s) => ({ ...s, saveState: 'saving' }));
      try {
        await saveProject(state().project);
        update((s) => ({ ...s, saveState: 'saved', dirty: false }));
        setTimeout(() => update((s) => (s.saveState === 'saved' ? { ...s, saveState: 'idle' } : s)), 1500);
      } catch {
        update((s) => ({ ...s, saveState: 'error' }));
      }
    },
    listSaved: () => listProjects(),
    openSaved: async (id: string) => {
      const list = await listProjects();
      const p = list.find((x) => x.id === id);
      if (!p) return;
      await loadIntoEngine(p);
      update((s) => ({ ...s, project: p, dirty: false, tick: 0, flashes: {}, playing: false }));
    },
    deleteSaved: async (id: string) => idbDeleteProject(id),
    exportFile: async (embedSamples: boolean) => downloadProjectFile(state().project, embedSamples),
    importFile: async (file: File) => {
      const parsed = parseProjectFile(JSON.parse(await file.text()));
      await importEmbeddedSamples(parsed).catch((e: Error) =>
        update((s) => ({ ...s, toast: `采样导入校验失败：${e.message}` }))
      );
      engine.loadProject(parsed.project);
      await loadIntoEngine(parsed.project);
      const samples = await listSamples().catch(() => []);
      update((s) => ({
        ...s,
        project: parsed.project,
        samples,
        dirty: true,
        tick: 0,
        flashes: {},
        playing: false,
        toast: '工程已导入（采样以引用方式关联；缺失的本地采样会在轨道上标记）'
      }));
    },
    dismissToast: () => update((s) => ({ ...s, toast: null })),

    // ---- 采样导入（本地文件 → 解码 → IndexedDB；全程不联网） ----
    importSample: async (file: File) => {
      await engine.init(); // 用户手势中，确保音频上下文可解码
      const bytes = await file.arrayBuffer();
      const digest = await sha256Hex(bytes.slice(0));
      const buffer = await Tone.getContext().rawContext.decodeAudioData(bytes.slice(0));
      const meta: SampleMeta = {
        id: uid('smp'),
        name: file.name,
        sha256: digest,
        size: file.size,
        type: file.type,
        importedAt: Date.now()
      };
      await putSample(meta, file);
      await engine.addSample(meta.id, buffer);
      update((s) => ({ ...s, samples: [...s.samples, meta], toast: `采样「${meta.name}」已存入浏览器本地` }));
    },
    removeSample: async (id: string) => {
      await idbDeleteSample(id);
      update((s) => ({ ...s, samples: s.samples.filter((m) => m.id !== id) }));
    },
    assignSample: (trackId: string, sampleId: string | null) =>
      mutate((p) => {
        const t = p.tracks.find((x) => x.id === trackId);
        if (!t) return;
        t.sound = sampleId === null ? { kind: 'synth', voice: 'kick' } : { kind: 'sample', sampleId };
      })
  };
}

export const app = createAppStore();

/** 可听性派生：有独奏时只听独奏轨，且静音轨无声 */
export const audibleTrackIds = derived(app, ($app) => {
  const solos = $app.project.tracks.filter((t) => t.solo);
  const set = new Set<string>();
  for (const t of $app.project.tracks) {
    if (t.muted) continue;
    if (solos.length === 0 || t.solo) set.add(t.id);
  }
  return set;
});

export { stepTicks };
export type { Track };
