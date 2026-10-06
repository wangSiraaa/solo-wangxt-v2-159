<script lang="ts">
  import type { Track } from '../lib/types';
  import { app } from '../lib/store';
  import { rollHit } from '../lib/rng';
  import { ticksToSeconds } from '../lib/time';

  let {
    track,
    index,
    onClose
  }: { track: Track; index: number; onClose: () => void } = $props();

  const step = $derived(track.steps[index]);
  const width = $derived(track.loopTicks / track.steps.length);
  const offsetTicks = $derived(Math.round(index * width));
  const offsetSeconds = $derived(ticksToSeconds(offsetTicks, $app.project.bpm));

  // 固定种子下该步未来 16 圈的抽签结果——与播放时实际触发完全相同
  const preview = $derived.by(() => {
    const out: { iteration: number; hit: boolean; atSec: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const tick = i * track.loopTicks + offsetTicks;
      out.push({
        iteration: i,
        hit: rollHit($app.project.seed, track.id, i, index, step.probability),
        atSec: ticksToSeconds(tick, $app.project.bpm)
      });
    }
    return out;
  });

  function setVelocity(v: number) {
    app.setStepField(track.id, index, 'velocity', v);
  }
  function setProbability(v: number) {
    app.setStepField(track.id, index, 'probability', v);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={onClose}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="步进编辑" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <header>
      <strong>{track.name}</strong>
      <span class="idx">第 {index + 1} 步</span>
      <button class="x" onclick={onClose}>✕</button>
    </header>

    <div class="row">
      <label for="step-on"><input id="step-on" type="checkbox" checked={step.on} onchange={() => app.toggleStep(track.id, index)} /> 启用此步</label>
      <span class="muted">圈内在 {offsetSeconds.toFixed(4)} s · tick {offsetTicks}</span>
    </div>

    <div class="row">
      <label for="step-vel">力度 <b>{step.velocity.toFixed(2)}</b></label>
      <input id="step-vel" type="range" min="0.05" max="1" step="0.01" value={step.velocity} oninput={(e) => setVelocity(Number(e.currentTarget.value))} />
    </div>

    <div class="row">
      <label for="step-prob">概率 <b>{(step.probability * 100).toFixed(0)}%</b></label>
      <input id="step-prob" type="range" min="0" max="1" step="0.01" value={step.probability} oninput={(e) => setProbability(Number(e.currentTarget.value))} />
      <div class="presets">
        {#each [0.25, 0.5, 0.75] as p (p)}
          <button onclick={() => setProbability(p)}>{p * 100}%</button>
        {/each}
      </div>
    </div>

    <div class="preview">
      <div class="muted">种子 <code>{$app.project.seed}</code> 下，此步未来 16 圈的命中（与实际播放一致）：</div>
      <div class="rolls">
        {#each preview as r (r.iteration)}
          <span
            class="roll"
            class:hit={r.hit}
            title={`第 ${r.iteration + 1} 圈 · ${r.atSec.toFixed(3)}s · ${r.hit ? '命中' : '落空'}`}
          >
            {r.iteration + 1}
          </span>
        {/each}
      </div>
    </div>
  </div>
</div>

<style lang="css">
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(5, 7, 10, 0.62);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
    border: none;
    padding: 0;
    width: 100%;
  }
  .dialog {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 16px 18px;
    width: 460px;
    max-width: 94vw;
  }
  .dialog header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .idx {
    color: var(--muted);
  }
  .x {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0;
    flex-wrap: wrap;
  }
  .row label {
    min-width: 120px;
  }
  .row input[type='range'] {
    flex: 1;
    min-width: 160px;
  }
  .muted {
    color: var(--muted);
    font-size: 11px;
  }
  code {
    background: var(--panel2);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .presets button {
    padding: 2px 8px;
    font-size: 11px;
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  .preview {
    margin-top: 14px;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  .rolls {
    display: flex;
    gap: 5px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .roll {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: var(--panel2);
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 11px;
  }
  .roll.hit {
    background: var(--accent2);
    border-color: var(--accent2);
    color: #04210f;
    font-weight: 700;
  }
</style>
