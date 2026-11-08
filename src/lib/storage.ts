import type { ChatMessage, CompanySnapshot, Deliverable, ModelId } from './types';

const DB_NAME = 'ai-company-simulator';
const DB_VERSION = 1;
const COMPANIES = 'companies';
const MESSAGES = 'messages';
const DELIVERABLES = 'deliverables';

const SETTINGS_KEY = 'acs.settings.v1';
const ACTIVE_KEY = 'acs.activeCompany.v1';

export interface AppSettings {
  apiKey: string;
  model: ModelId;
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  model: 'gemini-2.5-flash',
};

export interface LoadedCompany {
  company: CompanySnapshot;
  messages: ChatMessage[];
  deliverables: Deliverable[];
}

/* ---------- localStorage: settings and active company pointer ---------- */

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: parsed.model === 'gemini-2.5-pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadLatestCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function setLatestCompanyId(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_KEY, id);
}

export function clearLatestCompanyId(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_KEY);
}

/* ---------- IndexedDB: company snapshots, chat logs, deliverables ---------- */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(COMPANIES)) {
          db.createObjectStore(COMPANIES, { keyPath: 'id' });
        }
        for (const name of [MESSAGES, DELIVERABLES]) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' }).createIndex('companyId', 'companyId');
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

async function write(stores: string[], work: (tx: IDBTransaction) => void): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
    work(tx);
  });
}

async function readOne<T>(store: string, id: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function readByCompany<T>(store: string, companyId: string): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const request = db
      .transaction(store, 'readonly')
      .objectStore(store)
      .index('companyId')
      .getAll(companyId);
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCompanyMeta(snapshot: CompanySnapshot): Promise<void> {
  await write([COMPANIES], (tx) => {
    tx.objectStore(COMPANIES).put(snapshot);
  });
}

export async function saveMessage(message: ChatMessage): Promise<void> {
  await write([MESSAGES], (tx) => {
    tx.objectStore(MESSAGES).put(message);
  });
}

export async function saveDeliverable(deliverable: Deliverable): Promise<void> {
  await write([DELIVERABLES], (tx) => {
    tx.objectStore(DELIVERABLES).put(deliverable);
  });
}

export async function loadCompany(id: string): Promise<LoadedCompany | null> {
  const company = await readOne<CompanySnapshot>(COMPANIES, id);
  if (!company) return null;
  const [messages, deliverables] = await Promise.all([
    readByCompany<ChatMessage>(MESSAGES, id),
    readByCompany<Deliverable>(DELIVERABLES, id),
  ]);
  messages.sort((a, b) => a.createdAt - b.createdAt);
  deliverables.sort((a, b) => a.createdAt - b.createdAt);
  return { company, messages, deliverables };
}

export async function clearCompanyData(id: string): Promise<void> {
  await write([COMPANIES, MESSAGES, DELIVERABLES], (tx) => {
    tx.objectStore(COMPANIES).delete(id);
    for (const name of [MESSAGES, DELIVERABLES]) {
      const request = tx.objectStore(name).index('companyId').openCursor(IDBKeyRange.only(id));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    }
  });
}
