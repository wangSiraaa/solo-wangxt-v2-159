<script lang="ts">
  import type { Project } from '../lib/types';
  import { app } from '../lib/store';

  let saved = $state<Project[]>([]);
  let embed = $state(false);
  let confirmDelete = $state<string | null>(null);

  async function refresh() {
    saved = await app.listSaved();
  }
  $effect(() => {
    void refresh();
    // 保存状态变化时刷新列表
    void $app.saveState;
  });

  async function onImportProject(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await app.importFile(file);
    input.value = '';
    void refresh();
  }

  async function onImportSamples(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files ? [...input.files] : [];
    for (const f of files) {
      try {
        await app.importSample(f);
      } catch (err) {
        alert(`无法解码「${f.name}」：${(err as Error).message}`);
      }
    }
    input.value = '';
  }

  async function doDelete(id: string) {
    await app.deleteSaved(id);
    confirmDelete = null;
    void refresh();
  }

  function fmtDate(ts: number): string {
    return new Date(ts).toLocaleString();
  }
</script>

<div class="panel">
  <h3>工程（本机 IndexedDB）</h3>

  <div class="row">
    <button onclick={app.save}>💾 保存当前工程</button>
    <label class="filebtn">
      📂 打开工程文件
      <input type="file" accept=".json,application/json" onchange={onImportProject} hidden />
    </label>
  </div>
  <div class="row">
    <label class="check">
      <input type="checkbox" bind:checked={embed} />
      导出时打包采样（默认仅保留引用）
    </label>
  </div>
  <div class="row">
    <button class="export" onclick={() => app.exportFile(embed)}>⬇ 导出工程</button>
  </div>

  <ul class="saved-list">
    {#each saved as p (p.id)}
      <li>
        <button class="open" title={fmtDate(p.updatedAt)} onclick={() => app.openSaved(p.id)}>
          {p.name}
          <span>{p.bpm} BPM · {p.tracks.length} 轨</span>
        </button>
        {#if confirmDelete === p.id}
          <span class="confirm">
            确认？
            <button onclick={() => doDelete(p.id)}>是</button>
            <button onclick={() => (confirmDelete = null)}>否</button>
          </span>
        {:else}
          <button class="del" onclick={() => (confirmDelete = p.id)}>✕</button>
        {/if}
      </li>
    {/each}
    {#if saved.length === 0}
      <li class="empty">本机还没有保存的工程</li>
    {/if}
  </ul>

  <h3>本地采样</h3>
  <p class="muted">导入你自己的音频（wav / mp3 / ogg / flac）。不会有任何网络下载，合成鼓无需采样即可发声。</p>
  <label class="filebtn wide">
    🎵 导入采样到本机
    <input type="file" accept="audio/*" multiple onchange={onImportSamples} hidden />
  </label>
  <ul class="sample-list">
    {#each $app.samples as s (s.id)}
      <li>
        <span class="sname" title={`${s.sha256}\n${s.size} 字节`}>{s.name}</span>
        <button class="del" onclick={() => app.removeSample(s.id)}>✕</button>
      </li>
    {/each}
    {#if $app.samples.length === 0}
      <li class="empty">尚未导入采样</li>
    {/if}
  </ul>
</div>

<style lang="css">
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 13px;
  }
  h3:not(:first-child) {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 8px 0;
    flex-wrap: wrap;
  }
  button,
  .filebtn {
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  button:hover,
  .filebtn:hover {
    border-color: #4a5262;
  }
  .export {
    border-color: var(--accent2);
    color: #c8f2dd;
  }
  .check {
    font-size: 11px;
    color: var(--muted);
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .saved-list,
  .sample-list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .saved-list li,
  .sample-list li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .open {
    flex: 1;
    justify-content: space-between;
    text-align: left;
    background: transparent;
    border-color: transparent;
    padding: 4px 6px;
  }
  .open:hover {
    background: var(--panel2);
  }
  .open span {
    color: var(--muted);
    font-size: 10px;
  }
  .sname {
    flex: 1;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .del {
    padding: 2px 7px;
    color: var(--muted);
  }
  .del:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
  .confirm {
    font-size: 11px;
    color: var(--warn);
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .confirm button {
    padding: 1px 7px;
    font-size: 11px;
  }
  .empty {
    color: var(--muted);
    font-size: 11px;
    padding: 4px;
  }
  .muted {
    color: var(--muted);
    font-size: 11px;
    margin: 0 0 8px;
  }
  .wide {
    width: 100%;
    justify-content: center;
  }
</style>
