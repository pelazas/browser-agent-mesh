import { createLogger } from '@utils/logging';
import type { Database } from '@sqlite.org/sqlite-wasm';

const log = createLogger('database');

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const sqlite3 = await import('@sqlite.org/sqlite-wasm');

  const sqlite = await sqlite3.default({
    locateFile: (path: string) => path,
    init: (api: unknown) => {
      log.info('sqlite wasm initialized');
    },
  });

  const opfs = await sqlite.installOpfsSAHPool();
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
