// 工程数据模型。所有时长在内部都以“滴答(tick)”表示，
// Tone.Transport 的 PPQ 固定为 192（四分音符 = 192 tick），
// 这样不同循环长度 / 细分单位都可以被同一套整数时间轴统一描述。

export type VoiceName = 'kick' | 'snare' | 'hatClosed' | 'hatOpen' | 'clap' | 'tom' | 'rim';

/** 细分单位：每一步占几个四分音符拍（分数表示，精确避免浮点误差） */
export interface Subdivision {
  /** 每一步的拍数 = num / den（以四分音符为一拍） */
  readonly num: number;
  readonly den: number;
  /** UI 标签，如 1/4、1/8、1/16、1/3 三连音 */
  readonly label: string;
}

export interface Step {
  /** 是否启用（网格上点亮） */
  on: boolean;
  /** 力度 0..1，映射到触发音量 */
  velocity: number;
  /** 命中概率 0..1，使用固定种子抽签（见 lib/rng.ts） */
  probability: number;
}

/**
 * 轨道的声音来源：
 *  - { kind: 'synth', voice } 使用内置合成鼓机，无需任何外部采样
 *  - { kind: 'sample', sampleId } 引用 IndexedDB 中的用户采样
 */
export type SoundRef =
  | { kind: 'synth'; voice: VoiceName }
  | { kind: 'sample'; sampleId: string };

export interface Track {
  id: string;
  name: string;
  /** 循环长度（tick，整数）。一个轨道的长度独立于其他轨道 */
  loopTicks: number;
  /** 编辑/显示用细分单位，决定网格格数（仅影响编辑网格，不改变循环长度） */
  subdiv: Subdivision;
  sound: SoundRef;
  muted: boolean;
  solo: boolean;
  /** 相对主输出的音量 0..1 */
  gain: number;
  /** 声像 -1..1 */
  pan: number;
  /** 轨道内的步数数组，长度 = stepsPerBar（编辑网格列数） */
  steps: Step[];
  /** 轨道颜色（CSS 颜色，用于网格与游标） */
  color: string;
}

export interface Project {
  id: string;
  name: string;
  /** 每分钟四分音符数 */
  bpm: number;
  /** 概率序列主种子；同种子 + 同工程 ⇒ 每次播放的命中结果完全一致 */
  seed: number;
  tracks: Track[];
  updatedAt: number;
}

/** IndexedDB 中保存的用户采样元数据（音频字节单独存 Blob） */
export interface SampleMeta {
  id: string;
  name: string;
  /** 内容 SHA-256 摘要（十六进制），用于去重与导出时校验 */
  sha256: string;
  /** 字节大小 */
  size: number;
  /** MIME 类型，可能为空字符串 */
  type: string;
  importedAt: number;
}

/** 导出/导入的工程文件 */
export interface ProjectFile {
  format: 'polydrum-project';
  version: 1;
  project: Project;
  /** 工程引用到的采样元数据；缺失采样时仍可打开，仅标记“采样缺失” */
  samples: SampleMeta[];
  /**
   * 可选：内联采样数据（data URL）。默认导出只保留引用，
   * 用户勾选“打包采样”时才写入，保证工程文件可自包含。
   */
  embedded?: Record<string, string>;
}
