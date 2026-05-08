import { acquireLock, releaseLock } from '@core/blackboard/lock';
import * as Y from 'yjs';
import { createLogger } from '@utils/logging';

const log = createLogger('claimer');

export interface ClaimResult {
  success: boolean;
  lockId?: string;
  reason?: string;
}

export function claimTask(
  doc: Y.Doc,
  workflowId: string,
  taskId: string,
  nodeId: string,
): ClaimResult {
  const result = acquireLock(doc, workflowId, taskId, nodeId);

  if (!result.acquired) {
    return {
      success: false,
      reason: result.conflictOwner
        ? `Task locked by ${result.conflictOwner}`
        : 'Unknown error',
    };
  }

  log.info('task claimed', { taskId, workflowId, lockId: result.lockId });
  return { success: true, lockId: result.lockId };
}

export function releaseTask(
  doc: Y.Doc,
  workflowId: string,
  taskId: string,
  nodeId: string,
): boolean {
  return releaseLock(doc, workflowId, taskId, nodeId);
}
