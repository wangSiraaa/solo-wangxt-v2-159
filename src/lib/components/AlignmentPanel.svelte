<script lang="ts">
  import {
    globalAlignment,
    loopTicks,
    nextAlignments,
    pairwiseAlignments
  } from '../engine/alignment';
  import { BAR_TICKS, formatBarsBeats, SUBDIVISION_LABELS, ticksToSeconds } from '../engine/musicTime';
  import { playback } from '../state/playback.svelte';
  import type { Track } from '../state/types';

  let { tracks, bpm }: { tracks: Track[]; bpm: number } = $props();

  let global = $derived(globalAlignment(tracks));
  let pairs = $derived(pairwiseAlignments(tracks));
  let upcoming = $derived(nextAlignments(tracks, playback.playing ? playback.ticks : 0, 4));

  function fmtBars(ticks: number): string {
    const bars = ticks / BAR_TICKS;
    return Number.isInteger(bars) ? `${bars} 小节` : `${bars.toFixed(2)} 小节`;
  }
</script>

<section class="alignment">
  <h2>重新对齐时刻</h2>

  {#if tracks.length === 0}
    <p class="dim">暂无轨道。</p>
  {:else}
    <table>
      <thead>
        <tr><th>轨道</th><th>循环</th><th>长度</th><th>时长</th></tr>
      </thead>
      <tbody>
        {#each tracks as t}
          {@const lt = loopTicks(t)}
          <tr>
            <td>{t.name}</td>
            <td>{t.length} 步 × {SUBDIVISION_LABELS[t.subdivision]}</td>
            <td>{fmtBars(lt)}</td>
            <td>{ticksToSeconds(lt, bpm).toFixed(2)}s</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="global">
      全部轨道每 <strong>{fmtBars(global.ticks)}</strong>
      （{ticksToSeconds(global.ticks, bpm).toFixed(2)}s @ {bpm} BPM）重新对齐一次。
    </p>

    {#if pairs.length > 0}
      <details>
        <summary>两两对齐周期（{pairs.length} 组）</summary>
        <ul>
          {#each pairs as p}
            <li>
              {tracks[p.aIndex].name} × {tracks[p.bIndex].name}：
              每 {fmtBars(p.info.ticks)}（{ticksToSeconds(p.info.ticks, bpm).toFixed(2)}s）
            </li>
          {/each}
        </ul>
      </details>
    {/if}

    <p class="dim">
      接下来的对齐点（小节.拍）：
      {#each upcoming as t, i}
        <span class="chip" class:now={playback.playing && i === 0 && playback.ticks >= t - global.ticks}>
          {formatBarsBeats(t)}
        </span>
      {/each}
      {#if playback.playing}
        <span class="dim">（当前 {formatBarsBeats(playback.ticks)}）</span>
      {/if}
    </p>
  {/if}
</section>

<style>
  .alignment {
    background: var(--panel);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    font-size: 0.82rem;
  }
  h2 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 0.4rem;
  }
  th, td {
    text-align: left;
    padding: 0.15rem 0.5rem 0.15rem 0;
    border-bottom: 1px solid var(--cell);
  }
  th {
    color: var(--dim);
    font-weight: 500;
  }
  .global {
    margin: 0.3rem 0;
  }
  .dim {
    color: var(--dim);
  }
  .chip {
    display: inline-block;
    background: var(--cell);
    border-radius: 4px;
    padding: 0.05rem 0.4rem;
    margin-right: 0.3rem;
    font-variant-numeric: tabular-nums;
  }
  .chip.now {
    background: var(--accent);
    color: #000;
  }
  summary {
    cursor: pointer;
    color: var(--dim);
  }
  ul {
    margin: 0.3rem 0;
    padding-left: 1.2rem;
  }
</style>
