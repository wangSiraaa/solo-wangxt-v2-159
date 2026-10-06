import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetThreeAgainstFour, presetSevenStep, presetExtremeTempo } from './factory';
import { eventsInWindow, stepTicksInWindow, audibleTracks } from './scheduler';
import { PPQ } from './time';

test('3/4 与 4/4 轨道：事件 tick 与网格步位完全一致', () => {
  const p = presetThreeAgainstFour();
  const [waltzKick, , fourKick] = [p.tracks[0], p.tracks[1], p.tracks[2]];

  // 3 拍循环、12 列：每步 48 tick；底鼓在 0,4,8 列 → 0,192,384
  // 窗口结束于 3 拍循环边界 576（不含）：正好取到 3/4 的一圈
  const waltzKicks = eventsInWindow(p, 0, 3 * PPQ)
    .filter((e) => e.trackId === waltzKick.id)
    .map((e) => e.tick);
  assert.deepEqual(waltzKicks, [0, 192, 384]);

  // 4 拍循环、16 列：四踩在 0,4,8,12 → 0,192,384,576（限制只看第一圈）
  const fourKicks = eventsInWindow(p, 0, 4 * PPQ + 1)
    .filter((e) => e.trackId === fourKick.id && e.iteration === 0)
    .map((e) => e.tick);
  assert.deepEqual(fourKicks, [0, 192, 384, 576]);
});

test('跨循环边界：第二圈第 0 步恰好在 loopTicks 上，无重复无遗漏', () => {
  const p = presetThreeAgainstFour();
  // 切窗：覆盖 3 拍轨道第二圈开头（576 tick = 3 拍）
  const ev = eventsInWindow(p, 576 - 10, 576 + 10);
  const waltz = ev.filter((e) => e.trackId === p.tracks[0].id);
  assert.equal(waltz.length, 1);
  assert.equal(waltz[0].tick, 576);
  assert.equal(waltz[0].iteration, 1);
  assert.equal(waltz[0].stepIndex, 0);
});

test('相邻前瞻窗口拼接后等价于整段一次调度（不重不漏）', () => {
  const p = presetThreeAgainstFour();
  const end = 12 * PPQ;
  const whole = eventsInWindow(p, 0, end).map((e) => `${e.trackId}:${e.tick}`);
  const slices: string[] = [];
  const window = 192; // 一拍一窗，半开区间首尾相接
  for (let t = 0; t < end; t += window) {
    for (const e of eventsInWindow(p, t, Math.min(t + window, end))) {
      slices.push(`${e.trackId}:${e.tick}`);
    }
  }
  slices.sort();
  assert.deepEqual(slices, whole.slice().sort());
});

test('静音 / 独奏规则', () => {
  const p = presetThreeAgainstFour();
  p.tracks[0].muted = true;
  assert.ok(!audibleTracks(p).some((t) => t.id === p.tracks[0].id));
  p.tracks[0].muted = false;
  p.tracks[2].solo = true;
  const aud = audibleTracks(p);
  assert.ok(aud.some((t) => t.id === p.tracks[2].id));
  assert.ok(!aud.some((t) => t.id === p.tracks[0].id));
  const ev = eventsInWindow(p, 0, 4 * PPQ);
  assert.ok(ev.every((e) => e.trackId === p.tracks[2].id));
});

test('概率步：同一种子跨播放结果相同，换种子才可能改变', () => {
  const p = presetSevenStep();
  const a = eventsInWindow(p, 0, 28 * PPQ).map((e) => `${e.trackId}@${e.iteration}:${e.stepIndex}`);
  const b = eventsInWindow(p, 0, 28 * PPQ).map((e) => `${e.trackId}@${e.iteration}:${e.stepIndex}`);
  assert.deepEqual(a, b);
  // 概率 0.5 的步在 28 拍周期（8 圈）内既不恒响也不恒哑
  const snare = p.tracks.find((t) => t.name.includes('军鼓'))!;
  const hits = new Set(
    eventsInWindow(p, 0, 28 * PPQ)
      .filter((e) => e.trackId === snare.id && e.stepIndex === 2)
      .map((e) => e.iteration)
  );
  assert.ok(hits.size > 0 && hits.size < 8, `期望部分命中，实际命中 ${hits.size} 圈`);
});

test('极高速度：240 BPM 下每步 tick 精确，步宽 32 tick（1/24 音符）', () => {
  const p = presetExtremeTempo();
  const blast = p.tracks[0];
  // 窗口结束于循环边界 768（不含），正好 24 步
  const positions = stepTicksInWindow(blast, 0, 4 * PPQ).map((s) => s.tick);
  assert.equal(positions.length, 24);
  assert.deepEqual(positions[0], 0);
  // 每步 32 tick
  for (let i = 1; i < positions.length; i++) assert.equal(positions[i] - positions[i - 1], 32);
  // 最后一步起点 23*32=736
  assert.equal(positions[23], 736);
  // 重拍军鼓 0,6,12,18 列 → 0,192,384,576
  const snareTicks = eventsInWindow(p, 0, 4 * PPQ)
    .filter((e) => e.trackId === p.tracks[1].id)
    .map((e) => e.tick);
  assert.deepEqual(snareTicks, [0, 192, 384, 576]);
});

test('事件速度取步力度值（供音量映射）', () => {
  const p = presetThreeAgainstFour();
  const ev = eventsInWindow(p, 0, 3 * PPQ);
  const snare = ev.find((e) => e.trackId === p.tracks[1].id && e.stepIndex === 4)!;
  assert.equal(snare.velocity, 0.7);
});
