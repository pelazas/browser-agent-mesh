import { createLogger } from '@utils/logging';

const log = createLogger('hitl');

export type ApprovalAction = 'approve' | 'reject' | 'modify';

export interface HITLRequest {
  workflowId: string;
  message: string;
  options: ApprovalAction[];
  timeoutMs: number;
}

export interface HITLResponse {
  action: ApprovalAction;
  modifiedContent?: string;
}

export function requestHumanInput(request: HITLRequest): Promise<HITLResponse> {
  log.info('human-in-the-loop requested', { workflowId: request.workflowId });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      log.warn('HITL timed out, auto-approving', { workflowId: request.workflowId });
      resolve({ action: 'approve' });
    }, request.timeoutMs);

    // In production: post message to main thread → show UI prompt
    // Main thread posts back the user's response
    const handler = (e: MessageEvent<HITLResponse>) => {
      if (e.data.action) {
        clearTimeout(timeout);
        self.removeEventListener('message', handler);
        resolve(e.data);
      }
    };

    self.addEventListener('message', handler);

    // Notify main thread
    self.postMessage({
      type: 'hitl_request',
      payload: request,
    });
  });
}

export function shouldRequestApproval(
  confidence: number,
  actionType: string,
): boolean {
  // Always request approval for destructive or write operations
  if (actionType === 'write' || actionType === 'delete') return true;

  // Request approval if confidence is low
  return confidence < 0.7;
}
