<script lang="ts">
  import { projectStore } from '../state/project.svelte';
  import { PRESETS } from '../state/presets';
  import { deleteProject, listProjects, loadProject, saveProject } from '../state/db';
  import type { ProjectMeta } from '../state/types';
  import { normalizeProject } from '../state/project.svelte';

  let saved = $state<ProjectMeta[]>([]);
  let selectedId = $state('');
  let message = $state('');

  async function refresh() {
    saved = await listProjects();
  }

  async function onSave() {
    await saveProject({ ...projectStore.project, updatedAt: Date.now() });
    flash('已保存到 IndexedDB');
    await refresh();
  }

  async function onLoad() {
    if (!selectedId) return;
    const rec = await loadProject(selectedId);
    if (rec) {
      await projectStore.load(rec);
      flash(`已载入「${rec.name}」`);
    }
  }

  async function onDelete() {
    if (!selectedId) return;
    await deleteProject(selectedId);
    selectedId = '';
    await refresh();
    flash('已删除');
  }

  function onExport() {
    const json = projectStore.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectStore.project.name}.polyrhythm.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash('已导出（样本以引用形式保留）');
  }

  async function onImportFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = normalizeProject(JSON.parse(await file.text()));
      await projectStore.load(parsed);
      flash(`已导入「${parsed.name}」`);
    } catch {
      flash('导入失败：文件不是有效的工程 JSON');
    }
    (e.currentTarget as HTMLInputElement).value = '';
  }

  function flash(msg: string) {
    message = msg;
    setTimeout(() => (message = ''), 2500);
  }

  $effect(() => {
    refresh();
  });
</script>

<div class="project-bar">
  <input
    class="name"
    value={projectStore.project.name}
    oninput={(e) => projectStore.setName(e.currentTarget.value)}
    placeholder="工程名"
  />

  <select
    onchange={(e) => {
      const preset = PRESETS[Number(e.currentTarget.value)];
      if (preset) projectStore.load(preset.make());
      e.currentTarget.selectedIndex = 0;
    }}
  >
    <option value="">载入预设…</option>
    {#each PRESETS as preset, i}
      <option value={i}>{preset.label}</option>
    {/each}
  </select>

  <button onclick={() => projectStore.newProject()}>新建</button>
  <button onclick={onSave}>保存</button>

  <select bind:value={selectedId}>
    <option value="">已保存的工程…</option>
    {#each saved as p}
      <option value={p.id}>{p.name}（{new Date(p.updatedAt).toLocaleString()}）</option>
    {/each}
  </select>
  <button onclick={onLoad} disabled={!selectedId}>载入</button>
  <button onclick={onDelete} disabled={!selectedId}>删除</button>

  <button onclick={onExport}>导出 JSON</button>
  <label class="import">
    导入
    <input type="file" accept=".json,application/json" onchange={onImportFile} hidden />
  </label>

  {#if message}<span class="msg">{message}</span>{/if}
</div>

<style>
  .project-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.5rem 0.8rem;
    background: var(--panel);
    border-radius: 8px;
    font-size: 0.85rem;
  }
  .name {
    width: 12rem;
  }
  .import {
    cursor: pointer;
    padding: 0.3rem 0.7rem;
    background: var(--btn);
    border-radius: 5px;
  }
  .import:hover {
    background: var(--btn-hover);
  }
  .msg {
    color: var(--accent);
    font-size: 0.8rem;
  }
</style>
