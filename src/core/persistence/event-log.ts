import * as Y from 'yjs';
import type { Database } from '@sqlite.org/sqlite-wasm';
import { initDatabase } from './database';
import { createLogger } from '@utils/logging';

const log = createLogger('event-log');

export type EventType =
  | 'workflow_created'
  | 'task_claimed'
  | 'task_completed'
  | 'task_failed'
  | 'node_joined'
  | 'node_left'
  | 'tool_registered'
  | 'mutation'
  | 'checkpoint';

export interface EventEntry {
  id: string;
  timestamp: number;
  type: EventType;
  nodeId: string;
  workflowId: string | null;
  payload: Record<string, unknown>;
  ydocUpdate: Uint8Array | null;
}

export async function initEventLog(): Promise<void> {
  const db = await initDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_log (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      node_id TEXT NOT NULL,
      workflow_id TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      ydoc_update BLOB,
      created_at INTEGER DEFAULT (unixepoch('subsec') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_event_log_ts ON event_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(type);
    CREATE INDEX IF NOT EXISTS idx_event_log_workflow ON event_log(workflow_id);
  `);
  log.info('event log initialized');
}

export async function appendEvent(entry: Omit<EventEntry, 'id'>): Promise<string> {
  const db = await initDatabase();
  const id = crypto.randomUUID();

  db.run(
    `INSERT INTO event_log (id, timestamp, type, node_id, workflow_id, payload, ydoc_update)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    {
      bind: [
        id,
        entry.timestamp,
        entry.type,
        entry.nodeId,
        entry.workflowId,
        JSON.stringify(entry.payload),
        entry.ydocUpdate ?? null,
      ],
    },
  );

  return id;
}

export function getEvents(
  db: Database,
  opts: { type?: EventType; workflowId?: string; limit?: number; offset?: number },
): EventEntry[] {
  const conditions: string[] = [];
  const bind: unknown[] = [];

  if (opts.type) {
    conditions.push('type = ?');
    bind.push(opts.type);
  }
  if (opts.workflowId) {
    conditions.push('workflow_id = ?');
    bind.push(opts.workflowId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const rows = db.selectArrays(
    `SELECT id, timestamp, type, node_id, workflow_id, payload, ydoc_update
     FROM event_log ${where}
     ORDER BY timestamp DESC
     LIMIT ? OFFSET ?`,
    { bind: [...bind, limit, offset] },
  );

  return rows.map((row) => ({
    id: row[0] as string,
    timestamp: row[1] as number,
    type: row[2] as EventType,
    nodeId: row[3] as string,
    workflowId: row[4] as string | null,
    payload: JSON.parse(row[5] as string),
    ydocUpdate: row[6] as Uint8Array | null,
  }));
}

export function captureYDocUpdate(doc: Y.Doc, nodeId: string, workflowId: string | null): () => void {
  const handler = (update: Uint8Array) => {
    appendEvent({
      timestamp: Date.now(),
      type: 'mutation',
      nodeId,
      workflowId,
      payload: { updateSize: update.byteLength },
      ydocUpdate: update,
    }).catch((err) => log.error('failed to log mutation', { error: String(err) }));
  };

  doc.on('update', handler);
  return () => doc.off('update', handler);
}
