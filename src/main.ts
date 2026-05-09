import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import { App } from '@ui/App';
import { BlackboardContext } from '@ui/context/BlackboardContext';
import { createLocalDoc, WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { getRootMap, getNodes, getActiveWorkflows, getTelemetry } from '@core/blackboard/root-doc';
import { YjsSyncProvider, type SyncDebugState } from '@core/network/sync';
import { createLogger } from '@utils/logging';

const log = createLogger('main');

let networkWorker: SharedWorker | null = null;

function detectCapabilities() {
  const hasWebGPU = 'gpu' in navigator;
  const hasSharedWorker = typeof SharedWorker !== 'undefined';
  const hasWorker = typeof Worker !== 'undefined';

  return { hasWebGPU, hasSharedWorker, hasWorker };
}

function bootstrapWorkers(): void {
  const caps = detectCapabilities();
  log.info('capability detection', caps);

  if (caps.hasSharedWorker) {
    try {
      networkWorker = new SharedWorker(
        new URL('@workers/network.shared.ts', import.meta.url),
        { type: 'module', name: 'bam-network' },
      );
      log.info('network shared worker started');
    } catch (err) {
      log.warn('shared worker not supported', { error: String(err) });
    }
  }

  if (caps.hasWorker) {
    try {
      const sentinelWorker = new Worker(
        new URL('@workers/sentinel.worker.ts', import.meta.url),
        { type: 'module', name: 'bam-sentinel' },
      );
      sentinelWorker.onmessage = (e) => log.debug('sentinel message', { data: e.data });
      log.info('sentinel worker started');
    } catch (err) {
      log.error('failed to start sentinel', { error: String(err) });
    }
  }

  if (caps.hasWebGPU && caps.hasWorker) {
    try {
      const nodeWorker = new Worker(
        new URL('@workers/node.worker.ts', import.meta.url),
        { type: 'module', name: 'bam-node' },
      );
      nodeWorker.onmessage = (e) => {
        const data = e.data as { type: string; gpu?: unknown };
        if (data.type === 'ready' && data.gpu) log.info('node worker ready with GPU', { gpu: data.gpu });
      };
      log.info('node worker started');
    } catch (err) {
      log.error('failed to start node worker', { error: String(err) });
    }
  }

  if (caps.hasWorker) {
    try {
      const bridgeWorker = new Worker(
        new URL('@workers/bridge.worker.ts', import.meta.url),
        { type: 'module', name: 'bam-bridge' },
      );
      log.info('bridge worker started');
    } catch (err) {
      log.error('failed to start bridge worker', { error: String(err) });
    }
  }

  if (caps.hasWorker) {
    try {
      const synthWorker = new Worker(
        new URL('@workers/synthesizer.worker.ts', import.meta.url),
        { type: 'module', name: 'bam-synthesizer' },
      );
      log.info('synthesizer worker started');
    } catch (err) {
      log.error('failed to start synthesizer', { error: String(err) });
    }
  }
}

interface MeshRoot {
  blackboardDoc: Y.Doc | null;
  connected: boolean;
  connectToSharedWorker: () => void;
}

const meshState: MeshRoot = {
  blackboardDoc: null,
  connected: false,
  connectToSharedWorker() {
    const signalingUrl = import.meta.env.VITE_SIGNALING_URL ?? 'ws://localhost:4444';
    const roomName = 'browser-agent-mesh';

    const sync = new YjsSyncProvider({ signalingUrl, roomName });
    sync.registerSelfAsNode('ui', null);

    const doc = sync.getDoc();
    this.blackboardDoc = doc;

    const networkState = {
      peerCount: 0,
      signalingConnected: false,
      synced: false,
      webrtcPeers: [] as string[],
      awarenessStates: 0,
      rtcPeerConnectionAvailable: typeof RTCPeerConnection !== 'undefined',
      lastUpdate: 0,
      eventTimeline: [] as Array<{ time: number; event: string; detail: unknown }>,
      dump() {
        return structuredClone({
          peerCount: this.peerCount,
          signalingConnected: this.signalingConnected,
          synced: this.synced,
          webrtcPeers: this.webrtcPeers,
          awarenessStates: this.awarenessStates,
          rtcAvailable: this.rtcPeerConnectionAvailable,
          lastUpdate: this.lastUpdate,
          eventTimeline: this.eventTimeline,
        });
      },
      checkConnection(): string {
        if (!this.rtcPeerConnectionAvailable) {
          return 'RTCPeerConnection NOT available in this context. WebRTC cannot work.';
        }
        if (!this.signalingConnected) {
          return 'Signaling NOT connected. Check that the signaling server is running and reachable.';
        }
        if (this.webrtcPeers.length === 0 && this.awarenessStates <= 1) {
          return `Signaling connected, but no WebRTC peers discovered yet. If another tab is open on the same origin, peer discovery should happen within seconds.
Check: STUN reachable? Both tabs on same origin (localhost vs 127.0.0.1)?`;
        }
        if (this.webrtcPeers.length > 0 && this.peerCount === 0) {
          return 'WebRTC peers connected but awareness not synced yet. Should resolve in a few seconds.';
        }
        return `Connected: ${this.peerCount} peer(s), ${this.webrtcPeers.length} WebRTC connection(s), ${this.awarenessStates} awareness states.`;
      },
    };
    (window as unknown as Record<string, unknown>).__MESH_NETWORK__ = networkState;

    sync.onPeersChanged((count) => {
      networkState.peerCount = count;
      networkState.lastUpdate = Date.now();
      this.connected = count > 0;
    });

    setInterval(() => {
      const state = sync.getDebugState();
      networkState.signalingConnected = state.signalingConnected;
      networkState.synced = state.synced;
      networkState.webrtcPeers = state.webrtcPeers;
      networkState.awarenessStates = state.awarenessStates;
      networkState.rtcPeerConnectionAvailable = state.rtcPeerConnectionAvailable;
      networkState.eventTimeline = state.eventTimeline;
      if (state.signalingConnected || state.webrtcPeers.length > 0) {
        networkState.lastUpdate = Date.now();
      }
    }, 1000);

    // Expose for console inspection
    (window as unknown as Record<string, unknown>).__MESH_DOC__ = doc;
    (window as unknown as Record<string, unknown>).__MESH_BLACKBOARD__ = {
      getRootMap: () => getRootMap(doc),
      getNodes: () => [...getNodes(doc)],
      getWorkflows: () => [...getActiveWorkflows(doc)],
      getTelemetry: () => [...getTelemetry(doc)],
      dump: () => getRootMap(doc).toJSON(),
    };

    log.info('sync provider created in main thread', { room: roomName });

    // Connect to SharedWorker for agent routing
    if (!networkWorker) return;

    const channel = new MessageChannel();
    const port = channel.port1;
    networkWorker.port.postMessage({ type: 'ui', payload: {} }, [channel.port2]);

    const workerProv = new WorkerSyncProvider(doc, port);
    workerProv.connect('ui-main-thread', 'ui');

    log.info('main thread connected to shared worker');
  },
};

function mountUI(): void {
  const container = document.getElementById('root');
  if (!container) {
    log.error('root element not found');
    return;
  }

  const root = createRoot(container);
  root.render(
    React.createElement(
      BlackboardContext.Provider,
      { value: { doc: meshState.blackboardDoc, connected: meshState.connected } },
      React.createElement(App),
    ),
  );
  log.info('UI mounted');
}

async function init(): Promise<void> {
  log.info('browser agent mesh initializing');

  bootstrapWorkers();
  mountUI();

  // Brief delay before creating sync provider to let shared worker start
  setTimeout(() => {
    meshState.connectToSharedWorker();
  }, 200);
}

init().catch((err) => {
  log.error('initialization failed', { error: String(err) });
});
