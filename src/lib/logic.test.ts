import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PPQ,
  gcd,
  lcm,
  alignmentCycleTicks,
  loopTicksFor,
  ticksToSeconds,
  secondsToTicks,
  planTrackEvents,
  stepTicks
} from './time';
import { rollHit, rollCycle, hashSeed } from './rng';
import { analyzeAlignment } from './alignment';
import { presetThreeAgainstFour, presetSevenStep, presetExtremeTempo } from './factory';

test('步宽：音符时值以全音符为 1（全音符 = 4 四分拍）', () => {
  assert.equal(stepTicks(1, 1), PPQ * 4); // 全音符 4 拍
  assert.equal(stepTicks(1, 2), PPQ * 2); // 二分 2 拍
  assert.equal(stepTicks(1, 4), PPQ); // 四分 1 拍
  assert.equal(stepTicks(1, 8), PPQ / 2); // 八分 半拍
  assert.equal(stepTicks(1, 16), PPQ / 4); // 十六分 1/4 拍
  assert.equal(stepTicks(1, 12), PPQ / 3); // 八分三连音 1/3 拍
  assert.equal(stepTicks(1, 24), PPQ / 6); // 十六分三连音 1/6 拍
});

test('tick 换算：3 拍(3/4 小节) 与 4 拍(4/4 小节)', () => {
  assert.equal(loopTicksFor(12, 1, 16), 3 * PPQ); // 12 个 1/16 = 3 拍
  assert.equal(loopTicksFor(16, 1, 16), 4 * PPQ); // 16 个 1/16 = 4 拍
  assert.equal(loopTicksFor(7, 1, 8), (7 * PPQ) / 2); // 7 个八分步 = 3.5 拍 = 336
});

test('三拍对四拍在第 12 拍重新对齐', () => {
  const three = 3 * PPQ;
  const four = 4 * PPQ;
  assert.equal(alignmentCycleTicks([three, four]), 12 * PPQ);
  assert.equal(lcm(three, four), 12 * PPQ);
  assert.equal(gcd(three, four), PPQ);
});

test('七步循环(7 个 1/8 = 7/2 拍) 对 4 拍：lcm=28 拍；分别转 8 圈和 7 圈', () => {
  const seven = loopTicksFor(7, 1, 8); // 336 tick = 1.75 拍...
  // 7 个八分步 = 3.5 拍；lcm(3.5, 4) = 28 拍
  const ref = 4 * PPQ; // 768
  const cycle = alignmentCycleTicks([seven, ref]);
  assert.equal(cycle, 28 * PPQ);
  assert.equal(cycle / seven, 8);
  assert.equal(cycle / ref, 7);
});

test('tick 与秒的互逆换算（120 BPM：一拍=0.5s）', () => {
  const bpm = 120;
  assert.equal(ticksToSeconds(PPQ, bpm), 0.5);
  assert.equal(secondsToTicks(0.5, bpm), PPQ);
  for (const t of [0, 1, 191, 192, 193, 2304, 9999]) {
    assert.equal(Math.round(secondsToTicks(ticksToSeconds(t, bpm), bpm)), t);
  }
});

test('240 BPM 下十六分三连音步宽换算正确（48 tick ≈ 0.0208s）', () => {
  const bpm = 240;
  const st = stepTicks(1, 24); // 48 tick
  assert.equal(st, PPQ / 6);
  const sec = ticksToSeconds(st, bpm);
  // 一拍 = 0.25s，1/6 拍 ≈ 0.0417s
  assert.ok(Math.abs(sec - 0.25 / 6) < 1e-9);
});

test('概率序列可复现：同参数同结果', () => {
  const probs = [0.5, 0.5, 0.5, 0.1];
  const a = rollCycle(42, 'trk', 0, probs);
  const b = rollCycle(42, 'trk', 0, probs);
  assert.deepEqual(a, b);
  // 不同圈使用不同派生种子（结果允许相同，但接口以圈号隔离）
  const c0 = rollHit(42, 'x', 0, 0, 0.5);
  const c1 = rollHit(42, 'x', 1, 0, 0.5);
  assert.equal(typeof c0, 'boolean');
  assert.equal(typeof c1, 'boolean');
  assert.equal(rollHit(42, 'x', 0, 0, 1), true);
  assert.equal(rollHit(42, 'x', 0, 0, 0), false);
  assert.equal(hashSeed(1, 'abc'), hashSeed(1, 'abc'));
  assert.notEqual(hashSeed(1, 'abc'), hashSeed(2, 'abc'));
});

test('计划事件：每圈列序正确、圈号进位、绝对 tick 连续', () => {
  const loop = 4 * PPQ;
  const events = planTrackEvents('t', loop, 16, loop * 2 + 1);
  assert.equal(events.length, 32 + 1); // 两整圈 + 下一圈第 0 步
  assert.equal(events[0].iteration, 0);
  assert.equal(events[16].iteration, 1);
  assert.equal(events[16].stepIndex, 0);
  assert.equal(events[16].tick, loop);
  // 相邻步 tick 差一致
  assert.equal(events[1].tick - events[0].tick, PPQ / 4);
});

test('对齐报告：三拍/四拍样例的周期为 12 拍', () => {
  const p = presetThreeAgainstFour();
  const r = analyzeAlignment(p);
  assert.equal(r.cycleBeats, 12);
  for (const t of r.tracks) {
    if (t.loopBeats === 3) assert.equal(t.cyclesInPeriod, 4);
    if (t.loopBeats === 4) assert.equal(t.cyclesInPeriod, 3);
  }
  assert.equal(r.points[0].tick, 0);
  assert.equal(r.points[1].tick, 12 * PPQ);
});

test('七步与极高速度样例可构造且结构自洽', () => {
  const seven = presetSevenStep();
  assert.ok(seven.tracks.some((t) => t.steps.length === 7));
  for (const t of seven.tracks) {
    const cols = Math.round(t.loopTicks / stepTicks(t.subdiv.num, t.subdiv.den));
    assert.equal(t.steps.length, cols);
  }
  // 七步循环周期 = 28 拍
  assert.equal(analyzeAlignment(seven).cycleBeats, 28);

  const extreme = presetExtremeTempo();
  assert.equal(extreme.bpm, 240);
  const blast = extreme.tracks[0];
  assert.equal(blast.steps.length, 24);
  assert.equal(blast.loopTicks, 4 * PPQ);
  for (const t of extreme.tracks) {
    const cols = Math.round(t.loopTicks / stepTicks(t.subdiv.num, t.subdiv.den));
    assert.equal(t.steps.length, cols);
  }
});
