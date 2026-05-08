import * as Y from 'yjs';
import { initDatabase } from './database';
import { createLogger } from '@utils/logging';

const log = createLogger('checkpoint');

const CHECKPOINT_INTERVAL_MS = 60_000;

export async function initCheckpoints(): Promise<void> {
  const db = await initDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      doc_state BLOB NOT NULL,
      created_at INTEGER DEFAULT (unixepoch('subsec') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_checkpoints_workflow ON checkpoints(workflow_id, timestamp DESC);
  `);
  log.info('checkpoint table initialized');
}

export async function saveCheckpoint(
  workflowId: string,
  doc: Y.Doc,
): Promise<string> {
  const db = await initDatabase();
  const id = crypto.randomUUID();
  const state = Y.encodeStateAsUpdate(doc);

  db.run(
    `INSERT INTO checkpoints (id, workflow_id, timestamp, doc_state)
     VALUES (?, ?, ?, ?)`,
    {
      bind: [id, workflowId, Date.now(), state],
    },
  );

  log.info('checkpoint saved', { workflowId });
  return id;
}

export async function loadLatestCheckpoint(workflowId: string): Promise<Uint8Array | null> {
  const db = await initDatabase();
  const rows = db.selectArrays(
    `SELECT doc_state FROM checkpoints
     WHERE workflow_id = ?
     ORDER BY timestamp DESC
     LIMIT 1`,
    { bind: [workflowId] },
  );

  if (rows.length === 0) return null;
  return rows[0][0] as Uint8Array;
}

export async function pruneOldCheckpoints(workflowId: string, keep: number = 10): Promise<void> {
  const db = await initDatabase();
  db.run(
    `DELETE FROM checkpoints
     WHERE id NOT IN (
       SELECT id FROM checkpoints
       WHERE workflow_id = ?
       ORDER BY timestamp DESC
       LIMIT ?
     ) AND workflow_id = ?`,
    { bind: [workflowId, keep, workflowId] },
  );
}

export function startPeriodicCheckpoint(
  doc: Y.Doc,
  workflowId: string,
  intervalMs: number = CHECKPOINT_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    saveCheckpoint(workflowId, doc).catch((err) =>
      log.error('checkpoint failed', { workflowId, error: String(err) }),
    );
  }, intervalMs);

  return () => clearInterval(timer);
}

export async function restoreFromCheckpoint(workflowId: string): Promise<Y.Doc | null> {
  const update = await loadLatestCheckpoint(workflowId);
  if (!update) return null;

  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  log.info('checkpoint restored', { workflowId });
  return doc;
}
