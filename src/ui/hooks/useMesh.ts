import { useState, useEffect } from 'react';

interface NetworkHealth {
  connected: boolean;
  peerCount: number;
  latency: number | null;
}

interface NetworkState {
  peerCount: number;
}

export function useNetworkHealth(): NetworkHealth {
  const [peerCount, setPeerCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const net = (window as unknown as Record<string, NetworkState | undefined>).__MESH_NETWORK__;
      const count = net?.peerCount ?? 0;
      setPeerCount(count);
      setConnected(count > 0);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return { connected, peerCount, latency: null };
}
