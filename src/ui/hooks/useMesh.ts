import { useState, useEffect, useCallback } from 'react';

interface NetworkHealth {
  connected: boolean;
  peerCount: number;
  latency: number | null;
}

export function useNetworkHealth(): NetworkHealth {
  const [health, setHealth] = useState<NetworkHealth>({
    connected: false,
    peerCount: 0,
    latency: null,
  });

  const checkHealth = useCallback(async () => {
    // In production: check actual WebRTC connection state
    // For now, report based on document state
    setHealth((prev) => ({
      ...prev,
      connected: true,
    }));
  }, []);

  useEffect(() => {
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return health;
}
