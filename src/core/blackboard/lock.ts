import * as Y from 'yjs';
import type { LockEntry } from './schema';
import { getLocks, getWorkflowDoc } from './root-doc';
import { generateId } from '@/utils/id';

const DEFAULT_TTL_MS = 30_000;

export interface LockResult {
  acquired: boolean;
  lockId: string;
  conflictOwner?: string;
}

export function acquireLock(
  doc: Y.Doc,
  workflowId: string,
  taskId: string,
  nodeId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): LockResult {
  const workflow = getWorkflowDoc(doc, workflowId);
  if (!workflow) return { acquired: false, lockId: '' };

  const locks = workflow.get('locks') as Y.Map<Y.Map<unknown>>;

  // Check if task already locked
  const existingRaw = locks.get(taskId);
  if (existingRaw) {
    const existing = existingRaw.toJSON() as unknown as LockEntry;
    if (Date.now() - existing.acquiredAt < existing.ttlMs) {
      return {
        acquired: false,
        lockId: existing.lockId,
        conflictOwner: existing.ownerNodeId,
      };
    }
    // Lock expired — steal it
    locks.delete(taskId);
  }

  const lockId = generateId();
  const entry = new Y.Map<unknown>();
  entry.set('lockId', lockId);
  entry.set('ownerNodeId', nodeId);
  entry.set('taskId', taskId);
  entry.set('acquiredAt', Date.now());
  entry.set('ttlMs', ttlMs);

  locks.set(taskId, entry);

  return { acquired: true, lockId };
}

export function releaseLock(doc: Y.Doc, workflowId: string, taskId: string, nodeId: string): boolean {
  const workflow = getWorkflowDoc(doc, workflowId);
  if (!workflow) return false;

  const locks = workflow.get('locks') as Y.Map<Y.Map<unknown>>;
  const entry = locks.get(taskId);
  if (!entry) return false;

  const owner = entry.get('ownerNodeId');
  if (owner !== nodeId) return false;

  locks.delete(taskId);
  return true;
}

export function extendLock(
  doc: Y.Doc,
  workflowId: string,
  taskId: string,
  nodeId: string,
  additionalMs: number,
): boolean {
  const workflow = getWorkflowDoc(doc, workflowId);
  if (!workflow) return false;

  const locks = workflow.get('locks') as Y.Map<Y.Map<unknown>>;
  const entry = locks.get(taskId);
  if (!entry) return false;

  const owner = entry.get('ownerNodeId');
  if (owner !== nodeId) return false;

  const currentTtl = (entry.get('ttlMs') as number) ?? DEFAULT_TTL_MS;
  entry.set('ttlMs', currentTtl + additionalMs);
  entry.set('acquiredAt', Date.now());

  return true;
}
