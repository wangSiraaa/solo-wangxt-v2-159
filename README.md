# PolyDrum · 多拍长步进网格

浏览器端的节奏工作站：让不同**拍长 / 循环长度 / 细分单位**的鼓轨道叠加播放并比较它们的节奏错位。
纯本地运行 —— Svelte 5 + TypeScript + Tone.js，IndexedDB 保存工程，无服务器、不联网下载音色、打开页面不会自动播放。

## 解决的核心问题

多个轨道如果各自用一个 `setInterval` 计时，JS 事件循环抖动会让它们**逐渐错拍**。
本应用只有**一个时钟**：Web Audio 硬件时钟驱动的 `Tone.Transport`。

```
Tone.Transport（单一硬件时钟, PPQ=192）
        │  scheduleRepeat 每 25ms 唤醒（在音频时钟上，非墙钟）
        ▼
 前瞻窗口 100ms：把窗口内所有轨道的步进事件一次性排到精确音频时间
        │
        ├── 鼓合成器 / 用户采样：source.start(精确音频秒数)
        └── Tone.getDraw：视觉闪烁绑定到同一音频时间

requestAnimationFrame 游标只“读取” Transport 当前 tick，从不参与计时
```

### 统一的时间轴

所有时长内部用**整数 tick** 表示（四分音符 = 192 tick），秒数只在调度/显示的最后一步换算，
且全应用只有一个公式：`seconds = ticks / 192 * 60 / bpm`（见 `src/lib/time.ts`）。

| 概念 | 取值 |
|---|---|
| 细分单位 | 以全音符为 1：1/4、1/8、1/16、1/24（十六分三连音）等 |
| 一步 | `192 × 4 × num / den` tick，整数取整，无浮点漂移 |
| 循环长度 | 轨道独立，步数 × 步宽 |
| 重新对齐周期 | 所有轨道循环长度的 LCM（tick） |

例：3 拍轨道（576 tick）与 4 拍轨道（768 tick）在 **2304 tick = 12 拍** 后同时回起点
（3 拍轨转 4 圈、4 拍轨转 3 圈）。

## 功能

- **步进网格**：单击切换、双击调力度/概率；每轨独立步数、细分、循环长度
- **力度 / 静音 / 独奏 / 每步概率**（0–100%）
- **固定种子的可复现概率**：抽签是纯函数 `rollHit(seed, trackId, iteration, stepIndex, probability)`
  （mulberry32 + FNV-1a 派生种子）。同种子下每次播放命中结果完全一致；步进编辑器可预览未来 16 圈的命中
- **重新对齐分析**：对齐周期（拍/秒）、每轨周期内圈数、共同回到起点的时刻列表、播放时各轨实时相位
- **对齐周期视图**：所有轨道按统一的像素/拍尺度横向展开，竖线标出每轨循环边界，金色线为共同重对齐点；
  一条白色全局游标横穿所有行
- **本地鼓合成**：底鼓/军鼓/闭镲/开镲/拍手/通鼓/边击全部在浏览器内合成，无外部采样
- **用户采样**：从本地导入音频（SHA-256 摘要去重，存 IndexedDB）；缺失采样在轨道上标记
- **工程持久化**：IndexedDB；导出 `.polydrum.json`，**默认只保留采样引用（id + sha256 + name）**，
  勾选“打包采样”才内联 data URL（导入时校验摘要）
- **三个内置样例**：
  - `三拍对四拍`：3/4（12 个十六分步）对 4/4（16 步），12 拍重对齐
  - `七步循环`：7 个八分步（3.5 拍）对 4 拍，28 拍重对齐，含概率步
  - `极高速度`：240 BPM，十六分三连音（1/24，24 步 = 4 拍）

## 运行

```bash
npm install
npm run dev        # http://127.0.0.1:5173（音频在点击“播放”后才启动）
npm run build
npm run check      # svelte-check 类型检查（0 error / 0 warning）
npm run test:logic # 17 个纯逻辑测试：tick 换算、LCM 对齐、调度窗口拼接、概率可复现
npm run test:smoke # Playwright 浏览器冒烟（见下）
```

## 测试如何保证“听到的 = 看到的”

**逻辑测试**（`src/lib/*.test.ts`，无需浏览器）：

- 3/4 = 576 tick、4/4 = 768 tick；LCM = 2304
- 前瞻窗口 `[from, to)` 左闭右开，逐段拼接后与整段一次调度的事件集合完全一致（不重不漏）
- 事件 tick 与网格步位同一取整规则 `round(col × loop / columns)`
- 240 BPM 下 1/24 步宽 = 32 tick，24 步精确铺满 4 拍
- 概率序列同参数同结果

**浏览器冒烟**（`test/smoke.ts`，Chromium + Web Audio）：

- Hook 每个 GainNode 包络的 `setValueAtTime`，统计**真正排入音频硬件队列的击打时刻**
- 验证播放后有数十个真实事件、时间单调、游标越过对应拍位
- 停止→重播两次，聚合后的击打间隔序列一致（固定种子可复现）
- 240 BPM 下事件密度正确；游标持续推进
- IndexedDB 中出现 `polydrum` 库；导出 JSON 含正确 bpm/循环长度且默认不内联采样

> 注：在无系统库的容器里跑 Playwright 时，Chromium 依赖（libnss3/libnspr4 等）需可被
> `LD_LIBRARY_PATH` 找到；普通桌面环境直接 `npx playwright install chromium` 即可。

## 代码结构

```
src/lib/
  types.ts       工程/轨道/步进/采样的数据模型
  time.ts        PPQ、tick↔秒唯一换算、LCM、对齐周期（纯函数）
  rng.ts         固定种子 mulberry32 概率抽签（纯函数）
  scheduler.ts   前瞻窗口 → 应触发事件（纯函数，引擎与测试共用）
  alignment.ts   重新对齐报告、各轨相位（纯函数）
  factory.ts     三个样例与工程/轨道构造
  drums.ts       7 个本地合成鼓声部（Tone.js，无外部音频）
  engine.ts      单一 Transport 调度器、通道、采样触发
  storage.ts     IndexedDB、导入/导出（引用 + 可选内联 + 摘要校验）
  store.ts       Svelte store，编辑→引擎同步
src/components/  TransportBar / TrackGrid / TrackHeader / StepEditor
                 AlignmentPanel / ProjectPanel / Toast
```
