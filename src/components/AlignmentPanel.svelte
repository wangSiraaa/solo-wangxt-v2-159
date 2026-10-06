<script lang="ts">
  import { app } from '../lib/store';
  import { analyzeAlignment } from '../lib/alignment';
  import { PPQ } from '../lib/time';

  const report = $derived(analyzeAlignment($app.project));

  function fmtSec(s: number): string {
    return s < 10 ? s.toFixed(3).replace(/0$/, '') : s.toFixed(2);
  }
</script>

<div class="panel">
  <h3>重新对齐分析</h3>
  <p class="lead">
    所有轨道同时回到各自第 1 步，每隔
    <b>{report.cycleBeats}</b> 拍（{fmtSec(report.cycleSeconds)} 秒）发生一次。
  </p>

  <table class="tracks">
    <thead>
      <tr><th>轨道</th><th>循环</th><th>周期内圈数</th></tr>
    </thead>
    <tbody>
      {#each report.tracks as t (t.trackId)}
        <tr>
          <td><span class="swatch" style={`background:${t.color}`}></span>{t.name}</td>
          <td>{Number.isInteger(t.loopBeats) ? t.loopBeats : t.loopBeats.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} 拍 · {fmtSec(t.loopSeconds)}s</td>
          <td><b>{t.cyclesInPeriod}</b> 圈</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="points">
    <div class="muted">共同回到起点的时刻：</div>
    <div class="chips">
      {#each report.points.slice(0, 8) as p, i (p.tick)}
        <span class="chip" class:now={$app.playing && $app.tick % report.cycleTicks === p.tick}>
          <span class="n">#{i}</span>
          {p.tick / PPQ} 拍
          <span class="s">{fmtSec(p.seconds)}s</span>
        </span>
      {/each}
    </div>
  </div>

  <!-- 当前相位：游标时刻各轨道走到自己的第几步、第几圈 -->
  <div class="phase">
    <div class="muted">当前播放相位：</div>
    {#each $app.project.tracks as t (t.id)}
      {@const it = Math.floor($app.tick / t.loopTicks)}
      {@const col = Math.min(t.steps.length - 1, Math.floor((($app.tick % t.loopTicks) / t.loopTicks) * t.steps.length))}
      <div class="prow" style={`--tc:${t.color}`}>
        <span class="pname">{t.name}</span>
        <span class="pval">第 {it + 1} 圈 · 步 {col + 1}/{t.steps.length}</span>
      </div>
    {/each}
  </div>
</div>

<style lang="css">
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }
  .lead {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 12px;
  }
  .lead b {
    color: var(--warn);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  th {
    text-align: left;
    color: var(--muted);
    font-weight: 400;
    padding: 3px 4px;
    border-bottom: 1px solid var(--line);
  }
  td {
    padding: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    font-variant-numeric: tabular-nums;
  }
  .swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 6px;
  }
  .muted {
    color: var(--muted);
    font-size: 11px;
    margin: 10px 0 6px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 2px 9px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .chip .n {
    color: var(--muted);
  }
  .chip .s {
    color: var(--muted);
    font-size: 10px;
  }
  .chip.now {
    border-color: var(--warn);
    box-shadow: 0 0 8px rgba(245, 166, 35, 0.5);
  }
  .prow {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    padding: 2px 0 2px 8px;
    border-left: 2px solid var(--tc);
    margin: 3px 0;
    font-variant-numeric: tabular-nums;
  }
  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-right: 8px;
  }
</style>
