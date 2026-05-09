import { useState, useEffect } from 'react';

interface NetworkHealth {
  connected: boolean;
  peerCount: number;
  latency: number | null;
  signalingConnected: boolean;
  synced: boolean;
  webrtcPeers: string[];
  awarenessStates: number;
  rtcAvailable: boolean;
  lastUpdate: number;
}

interface NetworkState {
  peerCount: number;
  signalingConnected: boolean;
  synced: boolean;
  webrtcPeers: string[];
  awarenessStates: number;
  rtcPeerConnectionAvailable: boolean;
  lastUpdate: number;
}

export function useNetworkHealth(): NetworkHealth {
  const [state, setState] = useState<NetworkHealth>({
    connected: false,
    peerCount: 0,
    latency: null,
    signalingConnected: false,
    synced: false,
    webrtcPeers: [],
    awarenessStates: 0,
    rtcAvailable: false,
    lastUpdate: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const net = (window as unknown as Record<string, NetworkState | undefined>).__MESH_NETWORK__;
      if (!net) return;
      const count = net.peerCount ?? 0;
      setState({
        peerCount: count,
        connected: count > 0,
        latency: null,
        signalingConnected: net.signalingConnected ?? false,
        synced: net.synced ?? false,
        webrtcPeers: net.webrtcPeers ?? [],
        awarenessStates: net.awarenessStates ?? 0,
        rtcAvailable: net.rtcPeerConnectionAvailable ?? false,
        lastUpdate: net.lastUpdate ?? 0,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return state;
}
