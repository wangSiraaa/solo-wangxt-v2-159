<script lang="ts">
  import { projectStore } from '../state/project.svelte';
  import { playback } from '../state/playback.svelte';
  import { formatBarsBeats, formatSeconds } from '../engine/musicTime';

  let { onTogglePlay }: { onTogglePlay: () => void } = $props();

  let bpm = $derived(projectStore.project.bpm);
</script>

<div class="transport">
  <button class="play" class:playing={playback.playing} onclick={onTogglePlay}>
    {playback.playing ? '■ 停止' : '▶ 播放'}
  </button>

  <label class="bpm">
    BPM
    <input
      type="number"
      min="30"
      max="300"
      value={bpm}
      onchange={(e) => projectStore.setBpm(Number(e.currentTarget.value))}
    />
    <input
      type="range"
      min="30"
      max="300"
      value={bpm}
      oninput={(e) => projectStore.setBpm(Number(e.currentTarget.value))}
    />
  </label>

  <div class="position" title="小节.拍 / 秒">
    <span class="bars">{playback.playing ? formatBarsBeats(playback.ticks) : '—'}</span>
    <span class="secs">{playback.playing ? formatSeconds(playback.seconds) : ''}</span>
  </div>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 0.8rem;
    background: var(--panel);
    border-radius: 8px;
  }
  .play {
    min-width: 6rem;
    font-weight: 600;
  }
  .play.playing {
    background: var(--accent);
    color: #000;
  }
  .bpm {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .bpm input[type='number'] {
    width: 4rem;
  }
  .position {
    margin-left: auto;
    display: flex;
    gap: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--dim);
  }
  .bars {
    color: var(--text);
    font-weight: 600;
  }
</style>
