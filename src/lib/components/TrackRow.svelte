<script lang="ts">
  import { projectStore } from '../state/project.svelte';
  import { SUBDIVISIONS, SUBDIVISION_LABELS } from '../engine/musicTime';
  import { BUILTIN_LABELS, importSampleFile, isSampleMissing } from '../engine/samples';
  import { BUILTIN_SAMPLE_IDS, type Track } from '../state/types';
  import StepGrid from './StepGrid.svelte';

  let { track }: { track: Track } = $props();

  let mode = $derived(projectStore.editModes[track.id] ?? 'gate');
  let missing = $derived(isSampleMissing(track.sample));

  async function onSampleFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const ref = await importSampleFile(file);
      projectStore.setSample(track.id, ref);
    } catch {
      // 解码失败（非音频文件）时保持原样本
    }
    input.value = '';
  }
</script>

<div class="track-row" class:muted={track.mute}>
  <div class="controls">
    <input
      class="tname"
      value={track.name}
      oninput={(e) => {
        const t = projectStore.project.tracks.find((x) => x.id === track.id);
        if (t) t.name = e.currentTarget.value;
      }}
    />

    <div class="row">
      <select
        value={track.sample.kind === 'builtin' ? track.sample.id : 'file'}
        onchange={(e) => {
          const v = e.currentTarget.value;
          if (v !== 'file') projectStore.setSample(track.id, { kind: 'builtin', id: v as never });
        }}
        title="样本"
      >
        {#each BUILTIN_SAMPLE_IDS as id}
          <option value={id}>{BUILTIN_LABELS[id]}</option>
        {/each}
        {#if track.sample.kind === 'file'}
          <option value="file">📄 {track.sample.name}</option>
        {/if}
      </select>
      <label class="file-btn" title="从本地导入音频文件（存入 IndexedDB，不联网）">
        导入
        <input type="file" accept="audio/*" onchange={onSampleFile} hidden />
      </label>
      {#if missing}<span class="missing" title="IndexedDB 中找不到该样本，请重新导入">缺失</span>{/if}
    </div>

    <div class="row">
      <select
        value={track.subdivision}
        onchange={(e) => projectStore.setSubdivision(track.id, e.currentTarget.value as never)}
        title="细分单位"
      >
        {#each SUBDIVISIONS as sub}
          <option value={sub}>{SUBDIVISION_LABELS[sub]}</option>
        {/each}
      </select>
      <label class="len" title="循环步数">
        <input
          type="number"
          min="1"
          max="64"
          value={track.length}
          onchange={(e) => projectStore.setLength(track.id, Number(e.currentTarget.value))}
        />
        步
      </label>
    </div>

    <div class="row">
      <button class="ms" class:active={track.mute} onclick={() => projectStore.toggleMute(track.id)} title="静音">M</button>
      <button class="ms" class:active={track.solo} onclick={() => projectStore.toggleSolo(track.id)} title="独奏">S</button>
      <label class="seed" title="概率序列种子（固定种子 → 可复现）">
        种子
        <input
          type="number"
          min="0"
          value={track.seed}
          onchange={(e) => projectStore.setSeed(track.id, Number(e.currentTarget.value))}
        />
      </label>
    </div>

    <div class="row modes">
      {#each [['gate', '触发'], ['velocity', '力度'], ['probability', '概率']] as const as [m, label]}
        <button
          class:active={mode === m}
          onclick={() => projectStore.setEditMode(track.id, m)}
        >{label}</button>
      {/each}
      <button class="del" onclick={() => projectStore.removeTrack(track.id)} title="删除轨道">✕</button>
    </div>
  </div>

  <StepGrid {track} {mode} />
</div>

<style>
  .track-row {
    display: flex;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--panel);
    border-radius: 8px;
    align-items: stretch;
  }
  .track-row.muted {
    opacity: 0.55;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 15rem;
    flex-shrink: 0;
  }
  .tname {
    width: 100%;
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    font-size: 0.78rem;
  }
  .row select {
    flex: 1;
    min-width: 0;
  }
  .len input {
    width: 3rem;
  }
  .seed input {
    width: 3.5rem;
  }
  .ms.active {
    background: var(--accent);
    color: #000;
  }
  .modes button.active {
    background: var(--accent2);
    color: #000;
  }
  .del {
    margin-left: auto;
    color: var(--danger);
  }
  .file-btn {
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    background: var(--btn);
    border-radius: 4px;
    white-space: nowrap;
  }
  .missing {
    color: var(--danger);
    font-size: 0.72rem;
    white-space: nowrap;
  }
</style>
