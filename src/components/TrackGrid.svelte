<script lang="ts">
  import type { Track } from '../lib/types';
  import { app } from '../lib/store';
  import { PPQ, alignmentCycleTicks, ticksToSeconds } from '../lib/time';
  import { rollHit } from '../lib/rng';
  import TrackHeader from './TrackHeader.svelte';
  import StepEditor from './StepEditor.svelte';

  // 编辑模式：cycle = 按统一 tick 尺度显示整个重新对齐周期（看错位）
  //          single = 每轨各自一行一循环（密集编辑）
  let mode = $state<'cycle' | 'single'>('single');
  let pxPerBeat = $state(46);
  let selected = $state<{ trackId: string; index: number } | null>(null);
  let viewportW = $state(typeof window !== 'undefined' ? window.innerWidth : 1280);
  $effect(() => {
    const onResize = () => (viewportW = window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  const cycleTicks = $derived(
    $app.project.tracks.length ? alignmentCycleTicks($app.project.tracks.map((t) => t.loopTicks)) : PPQ * 4
  );

  // 整周期内的四分拍刻度
  const rulerBeats = $derived.by(() => {
    const arr: { tick: number; beat: number; bar: boolean }[] = [];
    for (let tick = 0; tick <= cycleTicks; tick += PPQ) {
      arr.push({ tick, beat: tick / PPQ + 1, bar: tick % (PPQ * 4) === 0 });
    }
    return arr;
  });

  // 周期内各圈重复的步单元
  interface CellView {
    index: number;
    iteration: number;
    absTick: number;
    x: number;
    w: number;
  }
  function cycleCells(track: Track): CellView[] {
    const reps = Math.round(cycleTicks / track.loopTicks);
    const colW = (track.loopTicks / track.steps.length / PPQ) * pxPerBeat;
    const cells: CellView[] = [];
    for (let it = 0; it < reps; it++) {
      for (let i = 0; i < track.steps.length; i++) {
        const absTick = it * track.loopTicks + Math.round((i * track.loopTicks) / track.steps.length);
        cells.push({ index: i, iteration: it, absTick, x: (absTick / PPQ) * pxPerBeat, w: colW - 1.5 });
      }
    }
    return cells;
  }

  function cycleWidth(tick: number): number {
    return (tick / PPQ) * pxPerBeat;
  }

  function stepIsLive(track: Track, iteration: number, index: number): boolean {
    const s = track.steps[index];
    return s.on && rollHit($app.project.seed, track.id, iteration, index, s.probability);
  }

  // 逐轨模式：列宽随步数收缩，保证多列也能在一行展示
  function singleColW(track: Track): number {
    const available = Math.min(1180, Math.max(560, viewportW - 420));
    return Math.min(46, available / track.steps.length);
  }
  // 每拍列数（用于强调节拍首步）
  function beatGroup(track: Track): number {
    const stepBeats = track.loopTicks / track.steps.length / PPQ;
    return Math.max(1, Math.round(1 / stepBeats));
  }
</script>

<div class="toolbar">
  <div class="seg">
    <button class:on={mode === 'single'} onclick={() => (mode = 'single')}>逐轨编辑</button>
    <button class:on={mode === 'cycle'} onclick={() => (mode = 'cycle')}>对齐周期视图</button>
  </div>
  {#if mode === 'cycle'}
    <label class="zoom">
      缩放
      <input type="range" min="16" max="140" step="1" bind:value={pxPerBeat} />
      <span>{pxPerBeat}px/拍</span>
    </label>
    <span class="cycle-info">
      全部轨道每 <b>{cycleTicks / PPQ}</b> 拍重新同时回到起点（≈ {ticksToSeconds(cycleTicks, $app.project.bpm).toFixed(2)} s）
    </span>
  {/if}
  <button class="add" onclick={() => app.addTrack()}>+ 添加轨道</button>
</div>

{#if mode === 'cycle'}
  <div class="cycle-scroll">
    <div class="cycle" style={`width:${cycleWidth(cycleTicks) + 8}px`}>
      <!-- 全局拍号标尺 -->
      <div class="ruler" style={`height:26px`}>
        {#each rulerBeats as b (b.tick)}
          <div class="tickmark" class:bar={b.bar} style={`left:${cycleWidth(b.tick)}px`}>
            {b.bar ? `${b.beat}` : '·'}
          </div>
        {/each}
      </div>

      <div class="rows">
        {#each $app.project.tracks as track (track.id)}
          {@const reps = Math.round(cycleTicks / track.loopTicks)}
          <div class="crow" style={`--tc:${track.color}`}>
            <div class="clabel">{track.name}<br /><span>{reps} 圈</span></div>
            <div class="ctrack" style={`height:34px;width:${cycleWidth(cycleTicks)}px`}>
              <!-- 循环边界 -->
              {#each Array.from({ length: reps + 1 }, (_, it) => it) as it (it)}
                <div class="boundary" style={`left:${cycleWidth(it * track.loopTicks)}px`}></div>
              {/each}
              <!-- 整周期起点/终点：所有轨道同时回起点的“重新对齐”时刻 -->
              <div class="realign" style="left:0"></div>
              <div class="realign" style={`left:${cycleWidth(cycleTicks)}px`}></div>
              {#each cycleCells(track) as c (c.iteration + '-' + c.index)}
                {@const step = track.steps[c.index]}
                <button
                  class="ccell"
                  class:on={step.on}
                  class:live={stepIsLive(track, c.iteration, c.index)}
                  class:flash={$app.flashes[track.id]?.step === c.index &&
                    $app.tick >= c.absTick &&
                    $app.tick < c.absTick + track.loopTicks / track.steps.length}
                  style={`left:${c.x}px;width:${Math.max(2, c.w)}px;opacity:${step.on ? 0.35 + 0.65 * step.velocity : 1};${step.probability < 1 && step.on ? `border-style:dashed;` : ''}`}
                  title={`第 ${c.iteration + 1} 圈 · 步 ${c.index + 1} · ${(step.probability * 100).toFixed(0)}%`}
                  onclick={() => app.toggleStep(track.id, c.index)}
                  ondblclick={() => (selected = { trackId: track.id, index: c.index })}
                ></button>
              {/each}
            </div>
          </div>
        {/each}

        <!-- 全局游标：只读取引擎 tick，在统一时间轴上横穿所有行 -->
        {#if $app.playing}
          <div class="playhead-global" style={`left:${150 + cycleWidth($app.tick % cycleTicks)}px`}></div>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <div class="single-list">
    {#each $app.project.tracks as track (track.id)}
      {@const colW = singleColW(track)}
      <section class="track-row" style={`--tc:${track.color}`}>
        <TrackHeader {track} />
        <div class="grid-wrap">
          <div class="sgrid" style={`--col:${Math.max(18, colW)}px`}>
            {#each track.steps as step, i (i)}
              {@const within = $app.tick % track.loopTicks}
              {@const localTick = Math.round((i * track.loopTicks) / track.steps.length)}
              {@const nextTick = Math.round(((i + 1) * track.loopTicks) / track.steps.length)}
              <button
                class="scell"
                class:on={step.on}
                class:beat0={i % beatGroup(track) === 0}
                class:flash={$app.flashes[track.id]?.step === i && performance.now() - ($app.flashes[track.id]?.at ?? 0) < 140}
                class:cursor={$app.playing && within >= localTick && within < nextTick}
                style={step.on ? `opacity:${0.45 + 0.55 * step.velocity};--pct:${step.probability * 100}%` : '--pct:0%'}
                onclick={() => app.toggleStep(track.id, i)}
                ondblclick={() => (selected = { trackId: track.id, index: i })}
                title={`步 ${i + 1} · 力度 ${step.velocity.toFixed(2)} · 概率 ${(step.probability * 100).toFixed(0)}%（双击调力度/概率）`}
              >
                {#if step.probability < 1 && step.on}
                  <span class="pct">{(step.probability * 100).toFixed(0)}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </section>
    {/each}
  </div>
{/if}

{#if selected}
  {@const sel = selected}
  {@const t = $app.project.tracks.find((x) => x.id === sel.trackId)}
  {#if t}
    <StepEditor track={t} index={sel.index} onClose={() => (selected = null)} />
  {/if}
{/if}

<style lang="css">
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .seg {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 7px;
    overflow: hidden;
  }
  .seg button {
    background: var(--panel);
    border: none;
    padding: 6px 12px;
    color: var(--muted);
  }
  .seg button.on {
    background: var(--accent);
    color: #fff;
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
    font-size: 12px;
  }
  .cycle-info {
    color: var(--muted);
    font-size: 12px;
  }
  .cycle-info b {
    color: var(--warn);
  }
  .add {
    margin-left: auto;
    background: var(--panel2);
    border: 1px dashed #4a5262;
    border-radius: 7px;
    padding: 6px 12px;
  }

  /* ---- 周期视图 ---- */
  .cycle-scroll {
    overflow-x: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px;
  }
  .cycle {
    position: relative;
  }
  .ruler {
    position: relative;
    margin-left: 150px;
    border-bottom: 1px solid var(--line);
  }
  .tickmark {
    position: absolute;
    top: 4px;
    color: #5c6573;
    font-size: 10px;
    transform: translateX(-50%);
    font-variant-numeric: tabular-nums;
  }
  .tickmark.bar {
    color: var(--text);
    font-weight: 700;
  }
  .tickmark.bar::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 16px;
    width: 1px;
    height: 100vh;
    background: rgba(255, 255, 255, 0.05);
  }
  .rows {
    position: relative;
  }
  .crow {
    position: relative;
    display: flex;
    align-items: center;
    height: 40px;
  }
  .clabel {
    width: 150px;
    flex: none;
    font-size: 11px;
    padding-left: 8px;
    border-left: 3px solid var(--tc);
    line-height: 1.25;
  }
  .clabel span {
    color: var(--muted);
    font-size: 10px;
  }
  .ctrack {
    position: relative;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.025) 0,
      rgba(255, 255, 255, 0.025) 1px,
      transparent 1px,
      transparent 46px
    );
  }
  .boundary {
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: 1px;
    background: var(--tc);
    opacity: 0.55;
  }
  .realign {
    position: absolute;
    background: var(--warn);
    box-shadow: 0 0 8px var(--warn);
  }
  .ccell {
    position: absolute;
    top: 5px;
    height: 24px;
    padding: 0;
    border: 1px solid #3a4150;
    border-radius: 3px;
    background: #222632;
  }
  .ccell.on {
    background: var(--tc);
    border-color: var(--tc);
  }
  .ccell.live {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35) inset;
  }
  .ccell.flash {
    filter: brightness(2);
  }
  .playhead-global {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #fff;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
    pointer-events: none;
    z-index: 5;
  }

  /* ---- 逐轨视图 ---- */
  .single-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .track-row {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px;
  }
  .grid-wrap {
    overflow-x: auto;
    margin-top: 8px;
  }
  .sgrid {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--col);
    gap: 3px;
    width: max-content;
    min-width: 100%;
  }
  .scell {
    position: relative;
    height: 34px;
    border-radius: 5px;
    border: 1px solid #39414f;
    background: linear-gradient(to top, #1b1f29 var(--pct, 0%), #222632 var(--pct, 0%));
    padding: 0;
    overflow: hidden;
  }
  .scell.beat0 {
    border-color: #54607a;
  }
  .scell.on {
    background: linear-gradient(
      to top,
      color-mix(in srgb, var(--tc) 90%, #fff 0%) var(--pct, 100%),
      color-mix(in srgb, var(--tc) 35%, #222632) var(--pct, 100%)
    );
    border-color: var(--tc);
  }
  .scell.cursor::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 2px solid #fff;
    border-radius: 5px;
    pointer-events: none;
  }
  .scell.flash {
    filter: brightness(2.1);
  }
  .pct {
    position: absolute;
    right: 2px;
    bottom: 0;
    font-size: 8px;
    color: rgba(255, 255, 255, 0.85);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
</style>
