import { useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { SentinelAgent } from '@agents/sentinel/sentinel';
import { useBlackboardContext } from '@ui/context/BlackboardContext';

export function usePromptSubmit(): { onSubmit: (prompt: string) => void } {
  const { doc } = useBlackboardContext();
  const agentRef = useRef<SentinelAgent | null>(null);

  const onSubmit = useCallback(
    (prompt: string) => {
      if (!doc) return;
      if (!agentRef.current) {
        agentRef.current = new SentinelAgent(doc);
      }
      agentRef.current.handlePrompt(prompt);
    },
    [doc],
  );

  return { onSubmit };
}
