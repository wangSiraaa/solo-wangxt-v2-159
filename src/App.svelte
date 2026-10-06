<svelte:options immutable={true} />
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/store';
  import TransportBar from './components/TransportBar.svelte';
  import TrackGrid from './components/TrackGrid.svelte';
  import AlignmentPanel from './components/AlignmentPanel.svelte';
  import ProjectPanel from './components/ProjectPanel.svelte';
  import Toast from './components/Toast.svelte';

  let ready = false;
  let showAlignment = true;

  onMount(async () => {
    await app.init();
    // 仅载入上次工程，不自动播放：音频必须由用户手势启动。
    ready = true;
  });
</script>

<main class="app">
  <header>
    <h1>PolyDrum <span>多拍长步进网格</span></h1>
    <p class="subtitle">
      单一时钟调度（Tone.Transport / Web Audio），不同循环长度共享整数 tick 时间轴 ·
      概率序列固定种子可复现 · 工程与采样仅保存在本机
    </p>
  </header>

  {#if !ready}
    <div class="loading">正在打开本地工程…</div>
  {:else}
    <TransportBar />
    <div class="layout">
      <section class="grid-area">
        <TrackGrid />
      </section>
      <aside class="side">
        <ProjectPanel />
        <button class="ghost" on:click={() => (showAlignment = !showAlignment)}>
          {showAlignment ? '隐藏' : '显示'}重新对齐分析
        </button>
        {#if showAlignment}
          <AlignmentPanel />
        {/if}
      </aside>
    </div>
  {/if}

  <Toast />
</main>

<style lang="css">
  :global(:root) {
    --bg: #0f1115;
    --panel: #171a21;
    --panel2: #1e222b;
    --line: #2a2f3a;
    --text: #e7e9ee;
    --muted: #9aa3b2;
    --accent: #3e63dd;
    --accent2: #30a46c;
    --warn: #f5a623;
    --danger: #e5484d;
    font-family: 'Inter', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
  }
  :global(button) {
    font: inherit;
    color: inherit;
  }

  .app {
    max-width: 1500px;
    margin: 0 auto;
    padding: 16px 20px 60px;
  }
  header h1 {
    font-size: 20px;
    margin: 4px 0 2px;
  }
  header h1 span {
    font-size: 13px;
    color: var(--muted);
    font-weight: 400;
    margin-left: 10px;
  }
  .subtitle {
    color: var(--muted);
    margin: 0 0 14px;
    font-size: 12px;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 16px;
    align-items: start;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 12px;
  }
  .loading {
    padding: 60px;
    text-align: center;
    color: var(--muted);
  }
  .ghost {
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--muted);
    cursor: pointer;
  }
  .ghost:hover {
    color: var(--text);
    border-color: var(--muted);
  }
  @media (max-width: 1080px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .side {
      position: static;
    }
  }
</style>
