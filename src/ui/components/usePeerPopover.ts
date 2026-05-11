import { useState, useMemo } from 'react';

interface MeshNode {
  id: string;
  role: string;
  status: string;
  gpu?: string;
  tasks?: number;
  models: string[];
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
  role: string;
  status: string;
  gpu: string | null;
  tasks: number | null;
  models: string[];
  shortId: string;
}

export interface UsePeerPopoverResult {
  isOpen: boolean;
  grouped: Map<string, PopoverNode[]>;
  totalNodes: number;
  nodesWithGPU: number;
  uniqueModels: string[];
  toggle: () => void;
  open: () => void;
  close: () => void;
}

export function usePeerPopover(nodes: MeshNode[], _network: NetworkHealth): UsePeerPopoverResult {
  const [isOpen, setIsOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, PopoverNode[]>();
    for (const n of nodes) {
      const row: PopoverNode = {
        id: n.id,
        role: n.role,
        status: n.status,
        gpu: n.gpu ?? null,
        tasks: n.tasks ?? null,
        models: n.models,
        shortId: n.id.slice(0, 8),
      };
      const list = map.get(n.role) ?? [];
      list.push(row);
      map.set(n.role, list);
    }
    return map;
  }, [nodes]);

  const totalNodes = nodes.length;

  const nodesWithGPU = useMemo(
    () => nodes.filter((n) => n.gpu).length,
    [nodes],
  );

  const uniqueModels = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      for (const m of n.models) set.add(m);
    }
    return Array.from(set);
  }, [nodes]);

  return {
    isOpen,
    grouped,
    totalNodes,
    nodesWithGPU,
    uniqueModels,
    toggle: () => setIsOpen((prev) => !prev),
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
