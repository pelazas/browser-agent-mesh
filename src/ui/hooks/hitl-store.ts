import type { HITLRequest, HITLResponse, ApprovalAction } from '@agents/synthesizer/hitl';

export type { HITLRequest, HITLResponse, ApprovalAction };

type HITLHandler = (request: HITLRequest, respond: (response: HITLResponse) => void) => void;
type HITLDismissHandler = () => void;

let currentHandler: HITLHandler | null = null;
let currentRequest: HITLRequest | null = null;
let currentRespond: ((response: HITLResponse) => void) | null = null;
let currentDismiss: HITLDismissHandler | null = null;

export function registerHITLHandler(handler: HITLHandler, dismiss: HITLDismissHandler): void {
  currentHandler = handler;
  currentDismiss = dismiss;
}

export function deregisterHITLHandler(): void {
  currentHandler = null;
  currentDismiss = null;
}

export function receiveHITLRequest(request: HITLRequest, respond: (response: HITLResponse) => void): void {
  currentRequest = request;
  currentRespond = respond;
  if (currentHandler) {
    currentHandler(request, respond);
  } else {
    console.warn('[hitl] no handler registered, auto-approving', { workflowId: request.workflowId });
    respond({ action: 'approve' });
    currentRequest = null;
    currentRespond = null;
  }
}

export function getCurrentRequest(): HITLRequest | null {
  return currentRequest;
}

export function getCurrentRespond(): ((response: HITLResponse) => void) | null {
  return currentRespond;
}

export function getCurrentDismiss(): HITLDismissHandler | null {
  return currentDismiss;
}

export function clearCurrentRequest(): void {
  currentRequest = null;
  currentRespond = null;
}
