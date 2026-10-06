/**
 * 调度器：全应用唯一的时钟是 Tone.Transport（底层是 AudioContext 时钟 +
 * lookahead 调度）。每条轨道一个 scheduleRepeat，间隔用 tick 表示
 * （"192i" 记法），所以改 BPM 后所有轨道依然按音乐时间对齐，
 * 不存在多个 setInterval 各自漂移的问题。
 *
 * 游标不走独立定时器：UI 的 rAF 每帧直接读 transport.ticks 换算步号，
 * 与音频事件共用同一时钟源，天然一致。
 */
import * as Tone from 'tone';
import { SUBDIVISION_TICKS } from './musicTime';
import { shouldTrigger } from './rng';
import { triggerSample } from './samples';
import type { Project, Track } from '../state/types';

export class Scheduler {
  private eventIds = new Map<string, number>();
  /** 每条轨道已走过的步数（用于推算循环遍数 pass） */
  private stepCounters = new Map<string, number>();
  private getProject: () => Project;
  playing = false;

  constructor(getProject: () => Project) {
    this.getProject = getProject;
  }

  /** 必须由用户手势触发（播放按钮点击） */
  async start(): Promise<void> {
    await Tone.start(); // 解锁 AudioContext，绝不自动播放
    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.bpm.value = this.getProject().bpm;
    transport.position = 0;
    this.clearAll();
    for (const track of this.getProject().tracks) {
      this.scheduleTrack(track, 0);
    }
    transport.start();
    this.playing = true;
  }

  stop(): void {
    Tone.getTransport().stop();
    this.playing = false;
  }

  setBpm(bpm: number): void {
    if (this.playing) {
      Tone.getTransport().bpm.value = bpm;
    }
  }

  /**
   * 结构变更（步数 / 细分 / 增删轨道）后重新调度。
   * 播放中也能无缝衔接：从当前 transport 位置的下一个步边界重新挂事件，
   * 步计数器按 tick 位置重建，概率序列（seed, pass, step）保持连续。
   */
  reschedule(): void {
    if (!this.playing) return;
    const nowTicks = Tone.getTransport().ticks;
    this.clearAll();
    for (const track of this.getProject().tracks) {
      this.scheduleTrack(track, nowTicks);
    }
  }

  private clearAll(): void {
    const transport = Tone.getTransport();
    for (const id of this.eventIds.values()) transport.clear(id);
    this.eventIds.clear();
    this.stepCounters.clear();
  }

  private scheduleTrack(track: Track, fromTicks: number): void {
    const stepTicks = SUBDIVISION_TICKS[track.subdivision];
    // 下一个步边界（严格大于 fromTicks，避免重触发当前步）
    const startStep = Math.floor(fromTicks / stepTicks) + 1;
    const startTicks = startStep * stepTicks;
    this.stepCounters.set(track.id, startStep);

    const id = Tone.getTransport().scheduleRepeat(
      (time) => this.onStep(track.id, time),
      `${stepTicks}i`,
      `${startTicks}i`
    );
    this.eventIds.set(track.id, id);
  }

  private onStep(trackId: string, time: number): void {
    const project = this.getProject();
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track || track.length === 0) return;

    const counter = this.stepCounters.get(trackId) ?? 0;
    this.stepCounters.set(trackId, counter + 1);
    const stepIndex = counter % track.length;
    const pass = Math.floor(counter / track.length);

    const step = track.steps[stepIndex];
    if (!step?.on) return;

    // 静音 / 独奏：有独奏轨道时只有独奏轨发声，否则静音轨不发声
    const anySolo = project.tracks.some((t) => t.solo);
    if (anySolo ? !track.solo : track.mute) return;

    if (!shouldTrigger(track.seed, pass, stepIndex, step.probability)) return;

    triggerSample(track.sample, time, step.velocity);
  }
}
