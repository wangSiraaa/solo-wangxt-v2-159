<script lang="ts">
  import { Scheduler } from './lib/engine/scheduler';
  import { projectStore } from './lib/state/project.svelte';
  import { playback, startCursorLoop, stopCursorLoop } from './lib/state/playback.svelte';
  import ProjectBar from './lib/components/ProjectBar.svelte';
  import TransportBar from './lib/components/TransportBar.svelte';
  import TrackRow from './lib/components/TrackRow.svelte';
  import AlignmentPanel from './lib/components/AlignmentPanel.svelte';

  const scheduler = new Scheduler(() => projectStore.project);

  async function togglePlay() {
    if (playback.playing) {
      scheduler.stop();
      stopCursorLoop();
    } else {
      await scheduler.start();
      startCursorLoop(() => projectStore.project.tracks);
    }
  }

  // 结构变更（步数/细分/增删轨道）→ 播放中无缝重挂调度事件
  $effect(() => {
    projectStore.structuralVersion;
    scheduler.reschedule();
  });

  // BPM 变更 → 直接改 transport（音乐时间基准不变，不会错拍）
  $effect(() => {
    scheduler.setBpm(projectStore.project.bpm);
  });
</script>

<main>
  <header>
    <h1>Polyrhythm Lab</h1>
    <p class="tagline">复节奏音序器 · 单一 Transport 时钟 · 本地运行</p>
  </header>

  <ProjectBar />
  <TransportBar onTogglePlay={togglePlay} />

  <section class="tracks">
    {#each projectStore.project.tracks as track (track.id)}
      <TrackRow {track} />
    {/each}
    <button class="add-track" onclick={() => projectStore.addTrack()}>+ 添加轨道</button>
  </section>

  <AlignmentPanel tracks={projectStore.project.tracks} bpm={projectStore.project.bpm} />

  <footer>
    <p>
      音频事件与网格游标共用 Tone.Transport 同一时钟；概率序列由固定种子哈希生成，可复现。
      所有数据保存在浏览器 IndexedDB，不会联网。
    </p>
  </footer>
</main>

<style>
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  header h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .tagline {
    margin: 0.15rem 0 0;
    color: var(--dim);
    font-size: 0.8rem;
  }
  .tracks {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .add-track {
    align-self: flex-start;
  }
  footer p {
    color: var(--dim);
    font-size: 0.72rem;
  }
</style>
