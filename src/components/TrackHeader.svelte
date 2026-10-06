<script lang="ts">
  import type { Track } from '../lib/types';
  import { app, audibleTrackIds } from '../lib/store';
  import { VOICE_LABELS, VOICE_NAMES } from '../lib/drums';
  import { SUBDIVISIONS, loopTicksFor, PPQ } from '../lib/time';

  let { track }: { track: Track } = $props();
  let showGridSettings = $state(false);

  let draftColumns = $state(16);
  let draftDen = $state(16);
  $effect(() => {
    draftColumns = track.steps.length;
    draftDen = track.subdiv.den;
  });

  const draftSpec = $derived(SUBDIVISIONS.find((s) => s.den === draftDen && s.num === 1) ?? SUBDIVISIONS[6]);
  const draftBeats = $derived(
    (loopTicksFor(draftColumns, draftSpec.num, draftSpec.den) / PPQ)
      .toFixed(3)
      .replace(/0+$/, '')
      .replace(/\.$/, '')
  );

  function commitGrid() {
    app.setTrackGrid(track.id, Math.max(1, Math.min(128, draftColumns)), {
      num: draftSpec.num,
      den: draftSpec.den,
      label: draftSpec.label
    });
  }

  const sampleMissing = $derived(
    track.sound.kind === 'sample' && !$app.samples.some((s) => s.id === (track.sound as { sampleId: string }).sampleId)
  );
</script>

<div class="head" style={`--tc:${track.color}`}>
  <input
    class="name"
    value={track.name}
    onchange={(e) => app.setTrackName(track.id, (e.currentTarget as HTMLInputElement).value)}
  />
  <div class="loopinfo" title="循环长度（四分音符拍）">
    {track.loopTicks / PPQ} 拍 · {track.steps.length} 步 · {track.subdiv.label.split(' ')[0]}
  </div>

  <div class="ctrls">
    <select
      value={track.sound.kind === 'synth' ? track.sound.voice : ''}
      onchange={(e) => {
        const v = (e.currentTarget as HTMLSelectElement).value;
        if (v) app.setVoice(track.id, v as (typeof VOICE_NAMES)[number]);
      }}
    >
      {#each VOICE_NAMES as v (v)}
        <option value={v}>{VOICE_LABELS[v]}</option>
      {/each}
      {#if track.sound.kind === 'sample'}
        <option value="">— 采样 —</option>
      {/if}
    </select>

    <select
      title="使用本地采样（IndexedDB）"
      value={track.sound.kind === 'sample' ? track.sound.sampleId : ''}
      onchange={(e) => {
        const id = (e.currentTarget as HTMLSelectElement).value;
        app.assignSample(track.id, id || null);
      }}
    >
      <option value="">合成鼓</option>
      {#each $app.samples as s (s.id)}
        <option value={s.id}>{s.name}</option>
      {/each}
    </select>
    {#if sampleMissing}
      <span class="missing" title="该采样不在本机 IndexedDB 中；重新导入后恢复">采样缺失</span>
    {/if}

    <button
      class="ms"
      class:on={track.muted}
      title="静音"
      onclick={() => app.toggleMute(track.id)}
      style={track.muted ? '' : `color:${track.color}`}
    >
      M
    </button>
    <button class="ms solo" class:on={track.solo} title="独奏（独奏时仅听到独奏轨）" onclick={() => app.toggleSolo(track.id)}>
      S
    </button>
    <button class="ms ghost2" title="循环长度与细分" onclick={() => (showGridSettings = !showGridSettings)}>⚙</button>
    <button class="ms del" title="删除轨道" onclick={() => app.removeTrack(track.id)}>✕</button>
  </div>

  <div class="gain">
    <span class="lbl">音量</span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={track.gain}
      oninput={(e) => app.setTrackGain(track.id, Number((e.currentTarget as HTMLInputElement).value))}
    />
  </div>

  {#if !$audibleTrackIds.has(track.id)}
    <span class="inaudible">当前不可闻</span>
  {/if}
</div>

{#if showGridSettings}
  <div class="grid-settings">
    <label>
      步数
      <input type="number" min="1" max="128" bind:value={draftColumns} onchange={commitGrid} />
    </label>
    <label>
      细分
      <select bind:value={draftDen} onchange={commitGrid}>
        {#each SUBDIVISIONS as s (s.den)}
          <option value={s.den}>{s.label}</option>
        {/each}
      </select>
    </label>
    <span class="hint">
      新循环 = {draftColumns} × {draftSpec.label.split(' ')[0]} = {draftBeats} 拍
    </span>
  </div>
{/if}

<style lang="css">
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 8px;
    border-left: 3px solid var(--tc);
    background: var(--panel2);
    border-radius: 6px 0 0 6px;
  }
  .name {
    width: 132px;
  }
  .loopinfo {
    color: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ctrls {
    display: flex;
    gap: 5px;
    align-items: center;
  }
  .ms {
    min-width: 26px;
    padding: 4px 7px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 5px;
    font-weight: 700;
  }
  .ms.on {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff !important;
  }
  .ms.solo.on {
    background: var(--warn);
    border-color: var(--warn);
    color: #1a1300 !important;
  }
  .ms.del:hover {
    border-color: var(--danger);
    color: var(--danger);
  }
  .ghost2 {
    font-weight: 400;
  }
  .gain {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .gain .lbl,
  .hint {
    color: var(--muted);
    font-size: 11px;
  }
  .gain input {
    width: 84px;
  }
  .missing {
    color: var(--danger);
    font-size: 11px;
    border: 1px solid var(--danger);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .inaudible {
    color: var(--warn);
    font-size: 11px;
  }
  .grid-settings {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    background: var(--panel);
    border: 1px dashed var(--line);
    border-top: none;
    border-radius: 0 0 6px 6px;
    flex-wrap: wrap;
  }
  .grid-settings label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
  }
  .grid-settings input[type='number'] {
    width: 60px;
  }
</style>
