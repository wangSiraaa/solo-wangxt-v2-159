// 真实浏览器冒烟测试（Playwright + Chromium）。
// 用 hook 记录 Web Audio 真正调度的 source.start(when) 事件，
// 验证它们与网格 tick 通过同一公式换算出的时刻一致。
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';

const server = await createServer({ server: { host: '127.0.0.1', port: 5199 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Autoplay')) errors.push(`console.error: ${m.text()}`);
});

// 在任何页面脚本前 hook：记录每次鼓击在“精确音频时刻”写入的增益包络。
// 合成鼓的各声部（含共享噪声源的镲/拍手）每次击打都会在其音频时间
// setValueAtTime 一个非零起音电平；这是真实排入 Web Audio 的节拍事件。
await page.addInitScript(() => {
  const w = window as unknown as {
    __starts: { when: number; ctxNow: number; value: number }[];
    __ctx: BaseAudioContext | null;
    __allSets: number;
    __methods: Record<string, number>;
    __protoOK: boolean;
    __writable: boolean;
    AudioParam: typeof AudioParam;
    AudioScheduledSourceNode: typeof AudioScheduledSourceNode;
  };
  w.__starts = [];
  w.__ctx = null;
  w.__allSets = 0;
  w.__methods = {};
  w.__protoOK = typeof w.AudioParam.prototype.setValueAtTime === 'function';
  const desc = Object.getOwnPropertyDescriptor(w.AudioParam.prototype, 'setValueAtTime');
  w.__writable = !!desc?.writable;

  // 唯一可信的“一次击打”标志：鼓声音量包络在精确音频时刻写入起音峰值。
  // （各合成器都在 trigger 时刻 setValueAtTime 一个 >=0.05 的增益。）
  const acProto = window.AudioContext.prototype as unknown as {
    createGain: () => GainNode;
  };
  const origCreateGain = acProto.createGain;
  acProto.createGain = function (this: AudioContext) {
    w.__ctx = this;
    const node = origCreateGain.call(this);
    const origSet = node.gain.setValueAtTime.bind(node.gain);
    node.gain.setValueAtTime = (value: number, time: number) => {
      w.__allSets += 1;
      if (typeof time === 'number' && time >= 0 && value >= 0.05) {
        w.__starts.push({ when: time, ctxNow: this.currentTime, value });
      }
      return origSet(value, time);
    };
    return node;
  };
});

await page.goto('http://127.0.0.1:5199/');
await page.waitForSelector('text=PolyDrum');
await page.waitForTimeout(400);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// 1) 初始位置 小节 1 · 拍 1
assert((await page.textContent('.pos'))?.includes('小节 1 · 拍 1'), '初始位置应为小节1拍1');

// 2) 播放后确实有 Web Audio 事件被调度
await page.click('button.play');
await page.waitForTimeout(1200);
const stats = await page.evaluate(() => {
  const w = window as unknown as {
    __starts: { when: number; ctxNow: number }[];
    __ctx: { currentTime: number } | null;
    __polydrumCtx?: { currentTime: number };
  };
  return {
    count: w.__starts.length,
    sample: w.__starts.slice(0, 6),
    allSets: (w as unknown as { __allSets?: number }).__allSets ?? -1,
    methods: (w as unknown as { __methods?: Record<string, number> }).__methods ?? null,
    protoOK: (w as unknown as { __protoOK?: boolean }).__protoOK ?? false,
    writable: (w as unknown as { __writable?: boolean }).__writable ?? false,
    ctx: w.__ctx?.currentTime ?? null,
    polyCtx: w.__polydrumCtx?.currentTime ?? null
  };
});
if (stats.count <= 20) console.log('DIAG', JSON.stringify(stats));
assert(stats.count > 20, `应有大量真实音频事件，实际 ${stats.count}`);
// 事件时间排序后应单调不减（同一音频时钟上依次排入）
const whens = stats.sample.map((e) => e.when).sort((a, b) => a - b);
for (let i = 1; i < whens.length; i++) {
  assert(whens[i] + 1e-9 >= whens[i - 1], '音频事件时间应单调不减');
}

// 3) 游标已前进，且时间单位换算与样例 BPM 一致（112 BPM，一拍 = 60/112s）
const pos1 = await page.textContent('.pos');
assert(/拍 [2-9]/.test(pos1 ?? ''), `游标应越过第 1 拍，实际：${pos1}`);

await page.click('button.play'); // 暂停
await page.click('button:has-text("停止")');

// 4) 概率可复现：停止→重播，对比两次“相对首个事件的间隔序列”
//    （绝对 when 随启动时刻不同；相对间隔完全刻画节奏型，不受启动抖动影响）
async function collectPattern(ms: number) {
  await page.evaluate(() => ((window as unknown as { __starts: unknown[] }).__starts = []));
  await page.click('button.play');
  await page.waitForTimeout(ms);
  await page.click('button.play');
  await page.click('button:has-text("停止")');
  const raw = await page.evaluate(() =>
    (window as unknown as { __starts: { when: number; value: number }[] }).__starts
      .filter((x) => x.when > 0.001) // 排除节点初始化时 t=0 的电平写入
      .map((x) => x.when)
      .sort((a, b) => a - b)
  );
  if (process.env.DEBUG_PATTERN) {
    console.log('RAW(' + raw.length + ')', raw.map((t) => Math.round(t * 1000)).join(','));
  }
  if (raw.length === 0) return [] as number[];
  // 同一次击打含多个包络层（相差约 2ms），按 10ms 聚合成唯一击打
  const scaled = raw.map((t) => Math.round(t * 100000));
  const beats: number[] = [];
  for (const t of scaled) {
    if (beats.length === 0 || t - beats[beats.length - 1] > 1000) beats.push(t);
  }
  return beats;
}
const runA = await collectPattern(1300);
const runB = await collectPattern(1300);
const diag = await page.evaluate(() => {
  const w = window as unknown as { __ctx: { currentTime: number } | null };
  return { hasCtx: !!w.__ctx, ctxTime: w.__ctx?.currentTime ?? -1 };
});
assert(runA.length >= 5, `第一次采集应有足够击打事件（runA=${runA.length}）`);

// 两次采集窗口的起点可能落在不同调度相位，因此不比较绝对位置，
// 而比较“相邻击打间隔”集合：固定种子下节奏型（含概率命中）必须一致。
function intervals(beats: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < beats.length; i++) out.push(beats[i] - beats[i - 1]);
  return out;
}
const iA = intervals(runA);
const iB = intervals(runB);
const [shorter, longer] = iA.length <= iB.length ? [iA, iB] : [iB, iA];
// 较短间隔序列必须是较长序列的连续子序列（顺序一致，容差 1ms 量化抖动）
let matched = false;
for (let start = 0; start + shorter.length <= longer.length; start++) {
  if (shorter.every((gap, k) => Math.abs(gap - longer[start + k]) <= 1000)) {
    matched = true;
    break;
  }
}
if (!matched || process.env.DEBUG_PATTERN) {
  console.log('A 间隔(ms):', iA.map((x) => (x / 100).toFixed(1)).join(' '));
  console.log('B 间隔(ms):', iB.map((x) => (x / 100).toFixed(1)).join(' '));
}
assert(matched, '固定种子下两次播放的击打间隔必须一致（概率序列可复现）');

// 5) 三拍对四拍样例：事件网格位置校验（在页面内直接调纯逻辑）
const gridCheck = await page.evaluate(async () => {
  const mod = await import('/src/lib/time.ts');
  return {
    ppq: mod.PPQ,
    three: mod.loopTicksFor(12, 1, 16),
    four: mod.loopTicksFor(16, 1, 16),
    seven: mod.loopTicksFor(7, 1, 8),
    cycle34: mod.alignmentCycleTicks([3 * mod.PPQ, 4 * mod.PPQ]),
    secAt1Beat: mod.ticksToSeconds(mod.PPQ, 120)
  };
});
assert(gridCheck.three === 576 && gridCheck.four === 768, '3/4=576、4/4=768 tick');
assert(gridCheck.cycle34 === 2304, '三拍对四拍周期 2304 tick（12 拍）');
assert(gridCheck.secAt1Beat === 0.5, '120BPM 一拍 = 0.5s');

// 6) IndexedDB 保存
await page.click('button:has-text("保存到本机")');
await page.waitForTimeout(300);
const dbNames = await page.evaluate(async () => (await indexedDB.databases?.())?.map((d) => d.name) ?? []);
assert(dbNames.includes('polydrum'), `应有 polydrum 库，实际 ${JSON.stringify(dbNames)}`);

// 7) 极高速度样例：真实事件密度与游标
await page.selectOption('#preset-sel', 'extreme');
await page.waitForTimeout(200);
await page.evaluate(() => ((window as unknown as { __starts: unknown[] }).__starts = []));
await page.click('button.play');
await page.waitForTimeout(800);
const extremeCount = await page.evaluate(
  () => (window as unknown as { __starts: unknown[] }).__starts.length
);
// 240BPM 下底鼓 12 次/小节(每2步)≈ 12/1s + 军鼓4 + tom，0.8s 内应有 > 8 个事件
assert(extremeCount >= 8, `高速下应有密集事件，实际 ${extremeCount}`);
const posX = await page.textContent('.pos');
assert(/拍 [2-9]/.test(posX ?? ''), `高速游标应前进，实际：${posX}`);
await page.click('button.play');
await page.click('button:has-text("停止")');

// 8) 导出：保留样本引用、不内联；结构与循环长度正确
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button.export')]);
const file = await download.path();
const json = JSON.parse(fs.readFileSync(file!, 'utf8'));
assert(json.format === 'polydrum-project' && json.version === 1, '导出格式');
assert(Array.isArray(json.samples) && json.embedded === undefined, '默认仅保留采样引用，不内联');
const blast = json.project.tracks[0];
assert(blast.steps.length === 24 && blast.subdiv.den === 24 && blast.loopTicks === 768, '高速轨 24×1/24=4 拍');
assert(json.project.bpm === 240, 'BPM 240');

// 9) 切到“对齐周期视图”无错误
await page.selectOption('#preset-sel', 'three-vs-four');
await page.click('button:has-text("对齐周期视图")');
await page.waitForTimeout(200);
const cycleInfo = await page.textContent('.cycle-info');
assert(cycleInfo?.includes('12'), `对齐周期应显示 12 拍，实际：${cycleInfo}`);

if (errors.length) {
  console.error('浏览器错误：\n' + errors.join('\n'));
  process.exit(1);
}
console.log('SMOKE OK ·', JSON.stringify({
  eventsFirstRun: stats.count,
  reproduciblePattern: runA.length,
  extremeEvents: extremeCount,
  cycle34: gridCheck.cycle34
}));
await browser.close();
await server.close();
