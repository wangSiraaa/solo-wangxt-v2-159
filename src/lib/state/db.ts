/**
 * IndexedDB 持久化：工程存 JSON，用户导入的样本存 Blob。
 * 纯本地，无任何网络请求。
 */
import type { ProjectMeta, StoredProject, StoredSample } from '../state/types';

const DB_NAME = 'polyrhythm-lab';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('samples')) {
        db.createObjectStore('samples', { keyPath: 'hash' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

/* ---------- 工程 ---------- */

export async function saveProject(project: StoredProject): Promise<void> {
  await tx('projects', 'readwrite', (s) => s.put(project));
}

export async function loadProject(id: string): Promise<StoredProject | undefined> {
  return tx('projects', 'readonly', (s) => s.get(id));
}

export async function deleteProject(id: string): Promise<void> {
  await tx('projects', 'readwrite', (s) => s.delete(id));
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await tx('projects', 'readonly', (s) => s.getAll() as IDBRequest<StoredProject[]>);
  return all
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/* ---------- 样本 ---------- */

export async function putSample(sample: StoredSample): Promise<void> {
  await tx('samples', 'readwrite', (s) => s.put(sample));
}

export async function getSample(hash: string): Promise<StoredSample | undefined> {
  return tx('samples', 'readonly', (s) => s.get(hash));
}
