import React from 'react';
import * as Y from 'yjs';

export interface BlackboardState {
  doc: Y.Doc | null;
  connected: boolean;
}

export const BlackboardContext = React.createContext<BlackboardState>({
  doc: null,
  connected: false,
});

export function useBlackboardContext(): BlackboardState {
  return React.useContext(BlackboardContext);
}
