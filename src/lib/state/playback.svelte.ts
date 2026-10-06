/**
 * 播放状态：游标完全由 transport 的 tick 时钟驱动（rAF 只负责读数渲染），
 * 与音频调度共用同一时钟源，保证网格游标与实际发声一致。
 */
import * as Tone from 'tone';
import { SUBDIVISION_TICKS } from '../engine/musicTime';

class PlaybackStore {
  playing = $state(false);
  /** 当前 transport 位置（tick） */
  ticks = $state(0);
  seconds = $state(0);
  /** 每条轨道当前步号（由 ticks 推算） */
  cursors = $state<Record<string, number>>({});
}

export const playback = new PlaybackStore();

let raf = 0;

export function startCursorLoop(getTracks: () => { id: string; subdivision: keyof typeof SUBDIVISION_TICKS; length: number }[]): void {
  stopCursorLoop();
  playback.playing = true;
  const tick = () => {
    const transport = Tone.getTransport();
    playback.ticks = transport.ticks;
    playback.seconds = transport.seconds;
    const cursors: Record<string, number> = {};
    for (const t of getTracks()) {
      const stepTicks = SUBDIVISION_TICKS[t.subdivision];
      cursors[t.id] = Math.floor(transport.ticks / stepTicks) % t.length;
    }
    playback.cursors = cursors;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export function stopCursorLoop(): void {
  cancelAnimationFrame(raf);
  playback.playing = false;
}
