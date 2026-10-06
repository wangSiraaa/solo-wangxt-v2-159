<script lang="ts">
  import { app } from '../lib/store';
  import { PRESETS } from '../lib/factory';
  import { PPQ, ticksToSeconds } from '../lib/time';

  let presetId = $state('three-vs-four');

  function onPreset(e: Event) {
    presetId = (e.currentTarget as HTMLSelectElement).value;
    app.loadPreset(presetId);
  }

  function fmtPos(tick: number, bpm: number): string {
    const barTicks = PPQ * 4;
    const bar = Math.floor(tick / barTicks) + 1;
    const beat = Math.floor((tick % barTicks) / PPQ) + 1;
    const within = tick % PPQ;
    const secs = ticksToSeconds(tick, bpm);
    return `小节 ${bar} · 拍 ${beat} · tick ${String(within).padStart(3, '0')}｜${secs.toFixed(3)} s`;
  }
</script>

<div class="bar">
  <div class="group transport">
    <button
      class="play"
      class:on={$app.playing}
      onclick={() => ($app.playing ? app.pause() : app.play())}
    >
      {$app.playing ? '⏸ 暂停' : '▶ 播放'}
    </button>
    <button onclick={() => app.stop()}>■ 停止</button>
  </div>

  <div class="group">
    <label for="bpm-in">速度</label>
    <input
      id="bpm-in"
      type="number"
      min="20"
      max="400"
      step="1"
      value={Math.round($app.project.bpm)}
      onchange={(e) => app.setBpm(Number((e.currentTarget as HTMLInputElement).value))}
    />
    <span class="unit">BPM</span>
    <input
      aria-label="速度滑杆"
      type="range"
      min="40"
      max="300"
      step="1"
      value={Math.round($app.project.bpm)}
      oninput={(e) => app.setBpm(Number((e.currentTarget as HTMLInputElement).value))}
    />
  </div>

  <div class="group seed">
    <label for="seed-in" title="概率序列主种子：同一种子下每次播放的随机命中完全一致">种子</label>
    <input
      id="seed-in"
      type="number"
      min="0"
      max="4294967295"
      value={$app.project.seed}
      onchange={(e) => app.setSeed(Number((e.currentTarget as HTMLInputElement).value))}
    />
    <button class="mini" title="换一个随机种子" onclick={() => app.randomizeSeed()}>🎲</button>
  </div>

  <div class="group">
    <label for="preset-sel">样例</label>
    <select id="preset-sel" value={presetId} onchange={onPreset}>
      {#each PRESETS as p (p.id)}
        <option value={p.id}>{p.label}</option>
      {/each}
    </select>
  </div>

  <div class="spacer"></div>

  <div class="group position" role="timer" aria-label="播放位置">
    <span class="pos">{fmtPos($app.tick, $app.project.bpm)}</span>
  </div>

  <div class="group">
    <button class="save" onclick={() => app.save()}>
      {$app.saveState === 'saving' ? '保存中…' : $app.saveState === 'saved' ? '已保存 ✓' : '保存到本机'}
    </button>
    {#if $app.dirty && $app.saveState !== 'saving'}
      <span class="dot" title="有未保存更改"></span>
    {/if}
  </div>
</div>

<style lang="css">
  .bar {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 14px;
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .group label {
    color: var(--muted);
    font-size: 12px;
  }
  .group input[type='number'] {
    width: 64px;
  }
  .group input[type='range'] {
    width: 120px;
  }
  .unit {
    color: var(--muted);
    font-size: 12px;
  }
  button {
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 7px 12px;
  }
  button:hover {
    border-color: #4a5262;
  }
  button.play {
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
    min-width: 92px;
  }
  button.play.on {
    background: var(--warn);
    border-color: var(--warn);
    color: #1a1300;
  }
  button.save {
    border-color: var(--accent2);
    color: #c8f2dd;
  }
  button.mini {
    padding: 3px 7px;
  }
  .spacer {
    flex: 1;
  }
  .position .pos {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-size: 12px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warn);
  }
</style>
