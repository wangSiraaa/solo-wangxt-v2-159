<script lang="ts">
  import { projectStore } from '../state/project.svelte';
  import { playback } from '../state/playback.svelte';
  import type { Track } from '../state/types';

  let { track, mode }: { track: Track; mode: 'gate' | 'velocity' | 'probability' } = $props();

  let dragging = false;

  function applyValue(e: PointerEvent, i: number) {
    const el = (e.currentTarget as HTMLElement).closest('.cell') as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    if (mode === 'velocity') projectStore.setVelocity(track.id, i, v);
    else projectStore.setProbability(track.id, i, v);
  }

  function onPointerDown(e: PointerEvent, i: number) {
    if (mode === 'gate') {
      projectStore.toggleStep(track.id, i);
    } else {
      dragging = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      applyValue(e, i);
    }
  }

  function onPointerMove(e: PointerEvent, i: number) {
    if (dragging && mode !== 'gate') applyValue(e, i);
  }

  function onPointerUp() {
    dragging = false;
  }

  function hint(i: number): string {
    const s = track.steps[i];
    return `第 ${i + 1} 步 · 力度 ${(s.velocity * 100).toFixed(0)}% · 概率 ${(s.probability * 100).toFixed(0)}%`;
  }
</script>

<div
  class="grid"
  style:grid-template-columns="repeat({track.length}, minmax(1.1rem, 1fr))"
  role="grid"
>
  {#each track.steps as step, i}
    <div
      class="cell"
      class:on={step.on}
      class:cursor={playback.playing && playback.cursors[track.id] === i}
      class:beat-start={i === 0}
      role="gridcell"
      tabindex="-1"
      title={hint(i)}
      onpointerdown={(e) => onPointerDown(e, i)}
      onpointermove={(e) => onPointerMove(e, i)}
      onpointerup={onPointerUp}
    >
      {#if step.on}
        <div class="vel" style:height="{step.velocity * 100}%"></div>
      {/if}
      {#if step.probability < 1}
        <div class="prob" style:width="{step.probability * 100}%"></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    gap: 3px;
    flex: 1;
    align-content: stretch;
    min-height: 4.5rem;
    user-select: none;
    touch-action: none;
  }
  .cell {
    position: relative;
    background: var(--cell);
    border-radius: 3px;
    cursor: pointer;
    overflow: hidden;
    min-height: 1.1rem;
  }
  .cell.beat-start {
    outline: 1px solid var(--dim);
  }
  .cell.on {
    background: var(--cell-on);
  }
  .cell.cursor {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .vel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--accent);
    opacity: 0.85;
    pointer-events: none;
  }
  .prob {
    position: absolute;
    top: 0;
    left: 0;
    height: 3px;
    background: var(--accent2);
    pointer-events: none;
  }
</style>
