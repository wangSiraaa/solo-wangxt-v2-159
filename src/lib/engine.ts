// 音频调度引擎。
//
// 关键约束：绝不能用多个 setInterval 各自计时（会逐渐错拍）。
// 这里只有一个时钟——Tone.Transport（Web Audio 硬件时钟驱动），
// 所有轨道、所有循环长度都被翻译到同一条整数 tick 时间轴上。
//
// 调度方式是经典的“前瞻调度”：
//   Transport.scheduleRepeat 每 25ms 在音频时钟上唤醒一次，
//   把未来 100ms 窗口内所有轨道的步进事件一次性排到精确的音频时间。
// 视觉游标不参与计时，只在 requestAnimationFrame 中“读取”Transport
// 的当前位置，所以游标永远与真实音频事件对齐。
import * as Tone from 'tone';
import type { Project, Track } from './types';
import { PPQ, ticksToSeconds } from './time';
import { eventsInWindow } from './scheduler';
import { DrumSynth } from './drums';

const LOOKAHEAD_SEC = 0.1; // 前瞻窗口
const INTERVAL_SEC = 0.025; // 调度频率（在 Transport 时钟上，不是 setInterval）

export interface TriggerInfo {
  trackId: string;
  stepIndex: number;
  iteration: number;
  velocity: number;
  /** 该事件的音频时间（秒），UI 可用它与游标核对 */
  audioTime: number;
}

interface TrackRuntime {
  channel: Tone.Channel;
  /** 用户采样（同一采样可被重叠触发，因此每次触发都新建 source 节点） */
  buffer: AudioBuffer | null;
}

export class AudioEngine {
  private synth: DrumSynth | null = null;
  private master: Tone.Gain | null = null;
  private runtimes = new Map<string, TrackRuntime>();
  private project: Project | null = null;
  private repeatId: number | null = null;
  /** 已调度到的 tick 边界（整数） */
  private scheduledUntilTick = 0;
  private playing = false;
  private samples = new Map<string, AudioBuffer>();

  /** UI 回调：事件被真正排入音频队列时触发（用于步进灯闪烁） */
  onTrigger: ((info: TriggerInfo) => void) | null = null;

  get isPlaying(): boolean {
    return this.playing;
  }

  /** 必须在用户手势中调用（浏览器自动播放策略）。应用不会自动启动播放。 */
  async init(): Promise<void> {
    if (this.synth) {
      await Tone.start();
      return;
    }
    await Tone.start();
    // 尽早暴露底层音频上下文（节点创建之前），便于浏览器端测试核对音频事件时刻
    if (typeof window !== 'undefined') {
      (window as unknown as { __polydrumCtx?: AudioContext }).__polydrumCtx =
        Tone.getContext().rawContext as AudioContext;
    }
    const transport = Tone.getTransport();
    transport.PPQ; // 固定 192，与 lib/time.ts 的 PPQ 一致
    // 前瞻调度参数设在共享音频上下文上（v14 中不属于 Transport）
    const ctx = Tone.getContext() as unknown as { lookAhead: number; updateInterval: number };
    ctx.lookAhead = LOOKAHEAD_SEC;
    ctx.updateInterval = INTERVAL_SEC;

    this.master = new Tone.Gain(0.9).toDestination();
    this.synth = new DrumSynth();
    this.synth.output.connect(this.master);
    this.synth.ensureStarted();
    this.buildRuntimes();

    // 单一调度器：按音频时钟固定频率运行，暂停/变速时随 Transport 一起停/变
    this.repeatId = transport.scheduleRepeat((time) => this.scheduleWindow(time), INTERVAL_SEC);
  }

  /** 载入/切换工程：设置 BPM 并按需重建通道，归零位置。可在 init 之前调用。 */
  loadProject(project: Project): void {
    this.project = structuredClone(project);
    const transport = Tone.getTransport();
    transport.bpm.value = project.bpm;
    transport.stop();
    transport.seconds = 0;
    this.playing = false;
    this.scheduledUntilTick = 0;
    this.buildRuntimes();
  }

  /** 根据当前 project 重建通道；init 完成前跳过（init 后会再调用） */
  private buildRuntimes(): void {
    if (!this.project || !this.master) return;
    for (const rt of this.runtimes.values()) rt.channel.dispose();
    this.runtimes.clear();
    for (const track of this.project.tracks) {
      const channel = new Tone.Channel(track.gain, track.pan).connect(this.master);
      channel.mute = !this.isAudible(track);
      const buffer = track.sound.kind === 'sample' ? (this.samples.get(track.sound.sampleId) ?? null) : null;
      this.runtimes.set(track.id, { channel, buffer });
    }
  }

  /** 播放过程中编辑工程后，替换工程数据（同步通道，不中断播放） */
  updateProject(project: Project): void {
    this.project = structuredClone(project);
    Tone.getTransport().bpm.value = project.bpm;
    for (const track of this.project.tracks) {
      let rt = this.runtimes.get(track.id);
      if (!rt && this.master) {
        rt = { channel: new Tone.Channel(track.gain, track.pan).connect(this.master), buffer: null };
        this.runtimes.set(track.id, rt);
      }
      if (rt) {
        rt.channel.volume.value = Tone.gainToDb(Math.max(0.0001, track.gain));
        rt.channel.pan.value = track.pan;
        // 双重保险：调度层已跳过不可听轨，通道层再静音一次
        rt.channel.mute = !this.isAudible(track);
        if (track.sound.kind === 'sample') {
          rt.buffer = this.samples.get(track.sound.sampleId) ?? null;
        } else {
          rt.buffer = null;
        }
      }
    }
    // 删除已移除轨道
    for (const [id, rt] of this.runtimes) {
      if (!this.project.tracks.some((t) => t.id === id)) {
        rt.channel.dispose();
        this.runtimes.delete(id);
      }
    }
  }

  setBpm(bpm: number): void {
    if (this.project) this.project.bpm = bpm;
    Tone.getTransport().bpm.value = bpm;
  }

  async play(): Promise<void> {
    await this.init();
    if (!this.project) return;
    const transport = Tone.getTransport();
    // 从停止位置启动时重置调度水位，保证概率序列从第 0 圈重新开始
    if (transport.seconds === 0) this.scheduledUntilTick = 0;
    transport.start();
    this.playing = true;
    this.synth?.ensureStarted();
  }

  pause(): void {
    Tone.getTransport().pause();
    this.playing = false;
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0;
    this.playing = false;
    this.scheduledUntilTick = 0;
  }

  /** 当前播放位置（tick，整数）。UI 游标只读它，不自行计时 */
  currentTick(): number {
    if (!this.project) return 0;
    const t = Tone.getTransport();
    return Math.max(0, Math.floor(t.toTicks(t.seconds)));
  }

  currentSeconds(): number {
    return this.project ? Tone.getTransport().seconds : 0;
  }

  getSoloCount(): number {
    return this.project ? this.project.tracks.filter((t) => t.solo).length : 0;
  }

  isAudible(track: Track): boolean {
    if (track.muted) return false;
    const solos = this.getSoloCount();
    return solos === 0 || track.solo;
  }

  /**
   * 唯一的调度循环回调。time 是 Web Audio 硬件时钟上的精确秒数，
   * 由 Transport 在节拍上提前调度——不是墙钟 setInterval。
   */
  private scheduleWindow(time: number): void {
    const project = this.project;
    if (!project) return;
    const transport = Tone.getTransport();

    const nowTick = Math.floor(transport.toTicks(time));
    const horizonTick = Math.floor(transport.toTicks(time + LOOKAHEAD_SEC));

    // 正常情况下 100ms 前瞻 + 25ms 间隔使水位始终领先 now。
    // 若标签页被后台挂起导致水位落后，过去时刻的事件已无法精确排布，
    // 这里从 now 重新对齐（丢弃过期事件，绝不追赶式突发触发）。
    if (this.scheduledUntilTick < nowTick) {
      this.scheduledUntilTick = nowTick;
    }

    const fromTick = this.scheduledUntilTick;
    // 窗口 [fromTick, toTick)；水位推进到 toTick，下一窗从同一点开始，不跳 tick
    const toTick = Math.max(horizonTick, fromTick);

    // 事件集合由纯函数计算（与测试、与网格绘制共用同一套 tick 取整规则）
    const events = eventsInWindow(project, fromTick, toTick);
    for (const ev of events) {
      const rt = this.runtimes.get(ev.trackId);
      if (!rt) continue;
      const audioTime = transport.toSeconds(ev.tick);
      this.fire(ev.track, rt, ev.velocity, audioTime);
      // 视觉事件绑定到同一个音频时间，游标走到该 tick 时灯才闪
      if (this.onTrigger) {
        const info: TriggerInfo = {
          trackId: ev.trackId,
          stepIndex: ev.stepIndex,
          iteration: ev.iteration,
          velocity: ev.velocity,
          audioTime
        };
        Tone.getDraw().schedule(() => this.onTrigger?.(info), audioTime);
      }
    }

    this.scheduledUntilTick = toTick;
  }

  private fire(track: Track, rt: TrackRuntime, velocity: number, audioTime: number): void {
    const vel = Math.min(1, velocity * track.gain);
    if (track.sound.kind === 'sample' && rt.buffer) {
      // 每次触发新建 BufferSource：同一采样可重叠发声，力度直接写 gain。
      // source.start 使用同一个 Web Audio 硬件时钟，因此与合成声部严格同步。
      const raw = Tone.getContext().rawContext as AudioContext;
      const source = raw.createBufferSource();
      source.buffer = rt.buffer;
      const gain = raw.createGain();
      gain.gain.setValueAtTime(vel, audioTime);
      source.connect(gain);
      Tone.connect(gain, rt.channel);
      source.start(audioTime);
    } else if (track.sound.kind === 'synth' && this.synth) {
      this.synth.trigger(track.sound.voice, audioTime, vel);
    }
  }

  // ---- 采样（用户从本地导入，存 IndexedDB；引擎只接收解码后的 buffer） ----

  async addSample(id: string, buffer: AudioBuffer): Promise<void> {
    this.samples.set(id, buffer);
    if (!this.project) return;
    for (const track of this.project.tracks) {
      if (track.sound.kind === 'sample' && track.sound.sampleId === id) {
        const rt = this.runtimes.get(track.id);
        if (rt) rt.buffer = buffer;
      }
    }
  }

  hasSample(id: string): boolean {
    return this.samples.has(id);
  }

  /** tick → 秒（单一换算公式的引擎侧入口，便于 UI 核对对齐时刻） */
  tickToSeconds(tick: number): number {
    return this.project ? ticksToSeconds(tick, this.project.bpm) : ticksToSeconds(tick, 120);
  }

  getPpq(): number {
    return PPQ;
  }

  dispose(): void {
    if (this.repeatId !== null) Tone.getTransport().clear(this.repeatId);
    for (const rt of this.runtimes.values()) rt.channel.dispose();
    this.runtimes.clear();
    this.synth?.dispose();
    this.master?.dispose();
    this.synth = null;
    this.master = null;
  }
}

export const engine = new AudioEngine();
