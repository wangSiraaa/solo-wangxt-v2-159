// 本地鼓合成：全部由 Tone.js 合成器节点在浏览器内生成，
// 不联网下载任何音色。用户也可以导入自己的采样（IndexedDB），
// 但默认工程只依赖这些合成声部。
import * as Tone from 'tone';
import type { VoiceName } from './types';

type VoicePlayer = (time: number, velocity: number) => void;

function midi(n: number): number {
  return Tone.Frequency(n, 'midi').toFrequency();
}

/**
 * 为每个声部建立独立合成链：voice -> pan -> gain -> destination。
 * 轨道级别的 pan/gain 在 engine 中通过 Tone.Channel 实现，
 * 这里的触发器只负责在精确 time 上发出声音。
 */
export class DrumSynth {
  readonly output: Tone.Gain;
  private voices = new Map<VoiceName, VoicePlayer>();
  private noise: Tone.Noise;
  private started = false;

  constructor() {
    this.output = new Tone.Gain(0.9);
    this.noise = new Tone.Noise('white');
    this.noise.volume.value = -100;
    this.buildKick();
    this.buildSnare();
    this.buildHatClosed();
    this.buildHatOpen();
    this.buildClap();
    this.buildTom();
    this.buildRim();
  }

  /** Tone.start() 之后调用：噪声源只需启动一次 */
  ensureStarted(): void {
    if (!this.started) {
      this.noise.start();
      this.started = true;
    }
  }

  trigger(voice: VoiceName, time: number, velocity: number): void {
    const v = this.voices.get(voice);
    if (v) v(time, Math.min(1, Math.max(0, velocity)));
  }

  /** 给噪声包络共用的噪声源做一个临时增益分支 */
  private noiseHit(
    time: number,
    duration: number,
    peak: number,
    filterFreq: number,
    filterType: BiquadFilterType = 'highpass'
  ): void {
    const filt = new Tone.Filter(filterFreq, filterType);
    const env = new Tone.Gain(0);
    this.noise.connect(filt);
    filt.connect(env);
    env.connect(this.output);
    const g = env.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(0, time);
    g.linearRampToValueAtTime(peak, time + 0.002);
    g.exponentialRampToValueAtTime(0.0001, time + duration);
    // 用墙钟定时器在声音结束后断开并回收节点。
    // 不能挂在 Transport 上：暂停/停止后 Transport 回调不再执行，会泄漏节点。
    const delayMs = Math.max(0, (time - Tone.getContext().rawContext.currentTime + duration + 0.05) * 1000);
    setTimeout(() => {
      try {
        this.noise.disconnect(filt);
        filt.dispose();
        env.dispose();
      } catch {
        // 上下文可能已关闭，忽略
      }
    }, delayMs + 20);
  }

  private buildKick(): void {
    const osc = new Tone.Oscillator(midi(36), 'sine');
    const click = new Tone.Oscillator(midi(60), 'square');
    const env = new Tone.Gain(0);
    const clickEnv = new Tone.Gain(0);
    osc.connect(env);
    click.connect(clickEnv);
    clickEnv.connect(env);
    env.connect(this.output);
    osc.start();
    click.start();
    this.voices.set('kick', (time, vel) => {
      const peak = 0.9 * vel;
      const f = osc.frequency;
      f.cancelScheduledValues(time);
      f.setValueAtTime(midi(48), time);
      f.exponentialRampToValueAtTime(midi(36), time + 0.12);
      const g = env.gain;
      g.cancelScheduledValues(time);
      g.setValueAtTime(0, time);
      g.linearRampToValueAtTime(peak, time + 0.003);
      g.exponentialRampToValueAtTime(0.0001, time + 0.32);
      const cg = clickEnv.gain;
      cg.cancelScheduledValues(time);
      cg.setValueAtTime(0.25 * vel, time);
      cg.exponentialRampToValueAtTime(0.0001, time + 0.02);
    });
  }

  private buildSnare(): void {
    this.voices.set('snare', (time, vel) => {
      this.noiseHit(time, 0.18, 0.55 * vel, 1800);
      const osc = new Tone.Oscillator(midi(38), 'triangle');
      const env = new Tone.Gain(0);
      osc.connect(env);
      env.connect(this.output);
      osc.start(time).stop(time + 0.2);
      const g = env.gain;
      g.setValueAtTime(0.4 * vel, time);
      g.exponentialRampToValueAtTime(0.0001, time + 0.16);
    });
  }

  private buildHatClosed(): void {
    this.voices.set('hatClosed', (time, vel) => {
      this.noiseHit(time, 0.05, 0.32 * vel, 7000);
    });
  }

  private buildHatOpen(): void {
    this.voices.set('hatOpen', (time, vel) => {
      this.noiseHit(time, 0.4, 0.3 * vel, 6000);
    });
  }

  private buildClap(): void {
    this.voices.set('clap', (time, vel) => {
      // 经典三连击 clap
      [0, 0.012, 0.024].forEach((off, i) => {
        this.noiseHit(time + off, i === 2 ? 0.18 : 0.03, 0.4 * vel, 1200, 'bandpass');
      });
    });
  }

  private buildTom(): void {
    this.voices.set('tom', (time, vel) => {
      const osc = new Tone.Oscillator(midi(45), 'sine');
      const env = new Tone.Gain(0);
      osc.connect(env);
      env.connect(this.output);
      osc.start(time).stop(time + 0.4);
      osc.frequency.setValueAtTime(midi(50), time);
      osc.frequency.exponentialRampToValueAtTime(midi(42), time + 0.25);
      const g = env.gain;
      g.setValueAtTime(0.6 * vel, time);
      g.exponentialRampToValueAtTime(0.0001, time + 0.35);
    });
  }

  private buildRim(): void {
    this.voices.set('rim', (time, vel) => {
      this.noiseHit(time, 0.025, 0.4 * vel, 3000, 'bandpass');
      const osc = new Tone.Oscillator(midi(72), 'square');
      const env = new Tone.Gain(0);
      osc.connect(env);
      env.connect(this.output);
      osc.start(time).stop(time + 0.05);
      const g = env.gain;
      g.setValueAtTime(0.25 * vel, time);
      g.exponentialRampToValueAtTime(0.0001, time + 0.04);
    });
  }

  dispose(): void {
    this.output.dispose();
  }
}

export const VOICE_LABELS: Record<VoiceName, string> = {
  kick: '底鼓',
  snare: '军鼓',
  hatClosed: '闭镲',
  hatOpen: '开镲',
  clap: '拍手',
  tom: '通鼓',
  rim: '边击'
};

export const VOICE_NAMES: VoiceName[] = ['kick', 'snare', 'hatClosed', 'hatOpen', 'clap', 'tom', 'rim'];
