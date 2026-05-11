import { useState, useMemo } from 'react';

interface MeshNode {
  id: string;
  gpu?: string;
  selectedModel: string | null;
  agentCount: number;
}

interface NetworkHealth {
  connected: boolean;
  peerCount: number;
  signalingConnected: boolean;
  synced: boolean;
  webrtcPeers: string[];
  awarenessStates: number;
  rtcAvailable: boolean;
  lastUpdate: number;
}

export interface PopoverNode {
  id: string;
  gpu: string | null;
  selectedModel: string | null;
  agentCount: number;
  shortId: string;
}

export interface UsePeerPopoverResult {
  isOpen: boolean;
  rows: PopoverNode[];
  totalNodes: number;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

export function usePeerPopover(nodes: MeshNode[], _network: NetworkHealth): UsePeerPopoverResult {
  const [isOpen, setIsOpen] = useState(false);

  const rows = useMemo(() => {
    return nodes.map((n) => ({
      id: n.id,
      gpu: n.gpu ?? null,
      selectedModel: n.selectedModel,
      agentCount: n.agentCount,
      shortId: n.id.slice(0, 8),
    }));
  }, [nodes]);

  const totalNodes = nodes.length;

  return {
    isOpen,
    rows,
    totalNodes,
    toggle: () => setIsOpen((prev) => !prev),
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
