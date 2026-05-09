import { useCallback, useRef } from 'react';
import { createPromptRequest } from '@core/blackboard/root-doc';
import { useBlackboardContext } from '@ui/context/BlackboardContext';

export function usePromptSubmit(): { onSubmit: (prompt: string) => void } {
  const { doc } = useBlackboardContext();
  const requesterNodeIdRef = useRef('ui-main-thread');

  const onSubmit = useCallback(
    (prompt: string) => {
      if (!doc) return;
      createPromptRequest(doc, prompt, requesterNodeIdRef.current);
    },
    [doc],
  );

  return { onSubmit };
}
