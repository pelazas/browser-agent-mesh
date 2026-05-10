import { createLogger } from '@utils/logging';
import type { Database } from '@sqlite.org/sqlite-wasm';

const log = createLogger('database');

let db: Database | null = null;
let opfsAvailable: boolean | null = null;

export function checkOpfsAvailable(): boolean {
  if (opfsAvailable !== null) return opfsAvailable;
  const hasSyncAccessHandle = typeof FileSystemFileHandle !== 'undefined'
    && typeof (FileSystemFileHandle.prototype as unknown as Record<string, unknown>).createSyncAccessHandle === 'function';
  opfsAvailable = typeof window !== 'undefined'
    && window.crossOriginIsolated === true
    && typeof navigator !== 'undefined'
    && typeof navigator.storage?.getDirectory === 'function'
    && hasSyncAccessHandle;
  if (!opfsAvailable) {
    log.warn('OPFS not available — persistence disabled', {
      crossOriginIsolated: typeof window !== 'undefined' ? window.crossOriginIsolated : 'N/A',
      hasGetDirectory: typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function',
      hasSyncAccessHandle,
    });
  }
  return opfsAvailable;
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;
  if (!checkOpfsAvailable()) {
    throw new Error('OPFS not available — persistence disabled');
  }

  const sqlite3 = await import('@sqlite.org/sqlite-wasm');

  const sqlite = await sqlite3.default({
    locateFile: (_path: string) => '/node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm',
    init: (api: unknown) => {
      log.info('sqlite wasm initialized');
    },
  });

  const opfs = await sqlite.installOpfsSAHPoolVfs();
  log.info('opfs pool installed', { metrics: opfs.metrics });

  db = new sqlite.oo1.OpfsDb('/bam-mesh.db', 'c');
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA cache_size=-16384;');

  log.info('database opened', { path: '/bam-mesh.db' });
  return db;
}

export function getDatabase(): Database | null {
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
    log.info('database closed');
  }
}

export async function withDb<T>(fn: (db: Database) => T): Promise<T> {
  const database = await initDatabase();
  return fn(database);
}
