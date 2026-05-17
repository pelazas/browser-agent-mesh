import { useState, useCallback, useEffect } from 'react';
import type { HITLRequest, HITLResponse } from '@agents/synthesizer/hitl';
import {
  registerHITLHandler,
  deregisterHITLHandler,
  getCurrentRespond,
  clearCurrentRequest,
} from './hitl-store';

export interface HITLDialogState {
  show: boolean;
  request: HITLRequest | null;
  respond: ((response: HITLResponse) => void) | null;
}

export function useHITLDialog(): {
  state: HITLDialogState;
  approve: () => void;
  reject: () => void;
  modify: (content: string) => void;
  dismiss: () => void;
} {
  const [state, setState] = useState<HITLDialogState>({
    show: false,
    request: null,
    respond: null,
  });

  useEffect(() => {
    const handler = (request: HITLRequest, respond: (response: HITLResponse) => void) => {
      setState({ show: true, request, respond });
    };
    const dismiss = () => {
      setState({ show: false, request: null, respond: null });
    };
    registerHITLHandler(handler, dismiss);
    return () => deregisterHITLHandler();
  }, []);

  const approve = useCallback(() => {
    if (state.respond) {
      state.respond({ action: 'approve' });
      setState({ show: false, request: null, respond: null });
      clearCurrentRequest();
    }
  }, [state.respond]);

  const reject = useCallback(() => {
    if (state.respond) {
      state.respond({ action: 'reject' });
      setState({ show: false, request: null, respond: null });
      clearCurrentRequest();
    }
  }, [state.respond]);

  const modify = useCallback((content: string) => {
    const respond = getCurrentRespond();
    if (respond) {
      respond({ action: 'modify', modifiedContent: content });
      setState({ show: false, request: null, respond: null });
      clearCurrentRequest();
    }
  }, []);

  const dismiss = useCallback(() => {
    setState({ show: false, request: null, respond: null });
    clearCurrentRequest();
  }, []);

  return { state, approve, reject, modify, dismiss };
}
