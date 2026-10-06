// IndexedDB：工程与用户采样全部保存在浏览器本地，无服务器。
//  - projects 存工程 JSON（声音引用 sampleId，不存音频字节）
//  - samples 存采样 Blob + 元数据
// 导出工程默认只保留样本“引用”（id/sha256/name），不内联音频；
// 用户显式勾选“打包采样”时才把 Blob 转 data URL 嵌入。
import type { Project, ProjectFile, SampleMeta } from './types';

const DB_NAME = 'polydrum';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_SAMPLES = 'samples';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
        const store = db.createObjectStore(STORE_SAMPLES, { keyPath: 'id' });
        store.createIndex('sha256', 'sha256', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = fn(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

// ---- 工程 ----

export async function saveProject(project: Project): Promise<void> {
  const stored: Project = { ...project, updatedAt: Date.now() };
  await tx(STORE_PROJECTS, 'readwrite', (s) => s.put(stored));
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return tx<Project | undefined>(STORE_PROJECTS, 'readonly', (s) => s.get(id));
}

export async function listProjects(): Promise<Project[]> {
  return tx<Project[]>(STORE_PROJECTS, 'readonly', (s) => s.getAll());
}

export async function deleteProject(id: string): Promise<void> {
  await tx(STORE_PROJECTS, 'readwrite', (s) => s.delete(id));
}

export async function loadMostRecentProject(): Promise<Project | undefined> {
  const all = await listProjects();
  return all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

// ---- 采样 ----

export interface StoredSample extends SampleMeta {
  blob: Blob;
}

export async function putSample(meta: SampleMeta, blob: Blob): Promise<void> {
  await tx(STORE_SAMPLES, 'readwrite', (s) => s.put({ ...meta, blob } satisfies StoredSample));
}

export async function getSample(id: string): Promise<StoredSample | undefined> {
  return tx<StoredSample | undefined>(STORE_SAMPLES, 'readonly', (s) => s.get(id));
}

export async function listSamples(): Promise<SampleMeta[]> {
  const all = await tx<StoredSample[]>(STORE_SAMPLES, 'readonly', (s) => s.getAll());
  return all.map(({ blob: _blob, ...meta }) => meta);
}

export async function deleteSample(id: string): Promise<void> {
  await tx(STORE_SAMPLES, 'readwrite', (s) => s.delete(id));
}

/** 收集工程引用的全部采样 id */
export function referencedSampleIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const t of project.tracks) {
    if (t.sound.kind === 'sample') ids.add(t.sound.sampleId);
  }
  return [...ids];
}

// ---- 导出 / 导入 ----

export async function exportProject(project: Project, embedSamples = false): Promise<ProjectFile> {
  const ids = referencedSampleIds(project);
  const samples: SampleMeta[] = [];
  let embedded: Record<string, string> | undefined;
  for (const id of ids) {
    const stored = await getSample(id);
    if (stored) {
      const { blob, ...meta } = stored;
      samples.push(meta);
      if (embedSamples) {
        embedded ??= {};
        embedded[id] = await blobToDataUrl(blob);
      }
    }
  }
  return {
    format: 'polydrum-project',
    version: 1,
    project,
    samples,
    ...(embedded ? { embedded } : {})
  };
}

export function parseProjectFile(json: unknown): ProjectFile {
  if (!json || typeof json !== 'object') throw new Error('无效的工程文件');
  const file = json as Partial<ProjectFile>;
  if (file.format !== 'polydrum-project' || file.version !== 1 || !file.project) {
    throw new Error('工程文件格式不被识别');
  }
  return file as ProjectFile;
}

export async function downloadProjectFile(project: Project, embedSamples: boolean): Promise<void> {
  const data = await exportProject(project, embedSamples);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFileName(project.name)}-${new Date().toISOString().slice(0, 10)}.polydrum.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 稍后释放，确保下载已开始
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function importEmbeddedSamples(file: ProjectFile): Promise<number> {
  if (!file.embedded) return 0;
  let count = 0;
  for (const [id, dataUrl] of Object.entries(file.embedded)) {
    const meta = file.samples.find((s) => s.id === id);
    if (!meta) continue;
    const blob = await dataUrlToBlob(dataUrl);
    // 校验摘要，防止引用与内容不一致
    const digest = await sha256Hex(await blob.arrayBuffer());
    if (digest !== meta.sha256) {
      throw new Error(`采样「${meta.name}」校验失败，已中止导入`);
    }
    await putSample(meta, blob);
    count += 1;
  }
  return count;
}

// ---- 工具 ----

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  // 纯本地解析 data URL，不经过 fetch/网络栈
  const [head, b64] = dataUrl.split(',');
  const type = /data:([^;]*)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Promise.resolve(new Blob([bytes], { type }));
}

function sanitizeFileName(name: string): string {
  return (
    (name || 'project')
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 60) || 'project'
  );
}
