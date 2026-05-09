import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import { App } from '@ui/App';
import { BlackboardContext } from '@ui/context/BlackboardContext';
import { WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { getRootMap, getNodes, getActiveWorkflows, getTelemetry } from '@core/blackboard/root-doc';
import { YjsSyncProvider } from '@core/network/sync';
import { initDatabase } from '@core/persistence/database';
import { initEventLog, captureYDocUpdate } from '@core/persistence/event-log';
import { initCheckpoints, loadLatestCheckpoint, startPeriodicCheckpoint } from '@core/persistence/checkpoint';
import { createLogger } from '@utils/logging';

const log = createLogger('main');

let networkWorker: SharedWorker | null = null;
let syncProvider: YjsSyncProvider | null = null;
let sharedDoc: Y.Doc | null = null;
let connected = false;
let sentinelWorkerRef: Worker | null = null;
let nodeWorkerRef: Worker | null = null;
let bridgeWorkerRef: Worker | null = null;
let synthWorkerRef: Worker | null = null;
// Stashed MessagePort for deferred transfer to SharedWorker
let uiSyncPort2: MessagePort | null = null;

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
      sentinelWorkerRef = new Worker(
        new URL('@workers/sentinel.worker.ts', import.meta.url),
        { type: 'module', name: 'bam-sentinel' },
      );
      sentinelWorkerRef.onmessage = (e) => log.debug('sentinel message', { data: e.data });
      log.info('sentinel worker started');
    } catch (err) {
      log.error('failed to start sentinel', { error: String(err) });
    }
  }

  if (caps.hasWebGPU && caps.hasWorker) {
    try {
      nodeWorkerRef = new Worker(
        new URL('@workers/node.worker.ts', import.meta.url),
        { type: 'module', name: 'bam-node' },
      );
      nodeWorkerRef.onmessage = (e) => {
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
      bridgeWorkerRef = new Worker(
        new URL('@workers/bridge.worker.ts', import.meta.url),
        { type: 'module', name: 'bam-bridge' },
      );
      bridgeWorkerRef.onmessage = (e) => log.debug('bridge message', { data: e.data });
      log.info('bridge worker started');
    } catch (err) {
      log.error('failed to start bridge worker', { error: String(err) });
    }
  }

  if (caps.hasWorker) {
    try {
      synthWorkerRef = new Worker(
        new URL('@workers/synthesizer.worker.ts', import.meta.url),
        { type: 'module', name: 'bam-synthesizer' },
      );
      synthWorkerRef.onmessage = (e) => log.debug('synthesizer message', { data: e.data });
      log.info('synthesizer worker started');
    } catch (err) {
      log.error('failed to start synthesizer', { error: String(err) });
    }
  }
}

function initSyncProvider(existingState?: Uint8Array): void {
  const signalingUrl = import.meta.env.VITE_SIGNALING_URL ?? 'ws://localhost:4444';
  const roomName = 'browser-agent-mesh';

  syncProvider = new YjsSyncProvider({ signalingUrl, roomName });
  syncProvider.registerSelfAsNode('ui', null);
  sharedDoc = syncProvider.getDoc();

  if (existingState && existingState.length > 0) {
    Y.applyUpdate(sharedDoc, existingState);
    log.info('applied existing session state', { bytes: existingState.length });
  }

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

  syncProvider.onPeersChanged((count) => {
    networkState.peerCount = count;
    networkState.lastUpdate = Date.now();
    connected = count > 0;
  });

  setInterval(() => {
    if (!syncProvider) return;
    const state = syncProvider.getDebugState();
    const count = syncProvider.getPeerCount();
    networkState.peerCount = count;
    networkState.signalingConnected = state.signalingConnected;
    networkState.synced = state.synced;
    networkState.webrtcPeers = state.webrtcPeers;
    networkState.awarenessStates = state.awarenessStates;
    networkState.rtcPeerConnectionAvailable = state.rtcPeerConnectionAvailable;
    networkState.eventTimeline = state.eventTimeline;
    if (state.signalingConnected || state.webrtcPeers.length > 0) {
      networkState.lastUpdate = Date.now();
    }
    connected = count > 0;
  }, 1000);

  (window as unknown as Record<string, unknown>).__MESH_DOC__ = sharedDoc;
  (window as unknown as Record<string, unknown>).__MESH_BLACKBOARD__ = {
    getRootMap: () => getRootMap(sharedDoc!),
    getNodes: () => [...getNodes(sharedDoc!)],
    getWorkflows: () => [...getActiveWorkflows(sharedDoc!)],
    getTelemetry: () => [...getTelemetry(sharedDoc!)],
    dump: () => getRootMap(sharedDoc!).toJSON(),
  };

  log.info('sync provider created in main thread', { room: roomName });
}

function initMainSync(): void {
  if (!networkWorker || !sharedDoc) return;

  const channel = new MessageChannel();
  const port = channel.port1;
  // Stash port2 for deferred transfer after SharedWorker is ready
  uiSyncPort2 = channel.port2;

  const workerProv = new WorkerSyncProvider(sharedDoc, port);
  workerProv.connect('ui-main-thread', 'ui');

  log.info('main thread sync pipe ready — doc listener active');
}

function finishSharedWorkerConnection(): void {
  if (!networkWorker || !uiSyncPort2) return;

  // Transfer the stashed port2 now that SharedWorker's onconnect has fired
  networkWorker.port.postMessage({ type: 'ui', payload: {} }, [uiSyncPort2]);
  uiSyncPort2 = null;

  log.info('main thread port transferred to shared worker');

  connectAgentWorker(sentinelWorkerRef, 'sentinel');
  connectAgentWorker(nodeWorkerRef, 'worker');
  connectAgentWorker(bridgeWorkerRef, 'bridge');
  connectAgentWorker(synthWorkerRef, 'synthesizer');
}

function connectAgentWorker(worker: Worker | null, role: string): void {
  if (!worker || !networkWorker) return;

  const channel = new MessageChannel();
  networkWorker.port.postMessage({ type: 'agent', payload: { role } }, [channel.port2]);
  worker.postMessage({ type: 'init', port: channel.port1 }, [channel.port1]);
  log.info('dedicated worker connected to shared worker', { role });
}

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
      { value: { doc: sharedDoc, connected } },
      React.createElement(App),
    ),
  );
  log.info('UI mounted', { hasDoc: !!sharedDoc });
}

async function initPersistence(): Promise<void> {
  const opfsAvailable = typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
  if (!opfsAvailable) {
    log.warn('OPFS not available — persistence and event log disabled');
    return;
  }
  try {
    await initDatabase();
    await initEventLog();
    await initCheckpoints();
    log.info('persistence layer initialized');
  } catch (err) {
    log.warn('persistence init failed (non-blocking)', { error: String(err) });
  }
}

function startSessionCheckpoints(doc: Y.Doc): () => void {
  return startPeriodicCheckpoint(doc, '__session__', 30_000);
}

async function loadSessionState(): Promise<Uint8Array | null> {
  const opfsAvailable = typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
  if (!opfsAvailable) return null;
  try {
    await initDatabase();
    await initCheckpoints();
    return await loadLatestCheckpoint('__session__');
  } catch (err) {
    log.warn('session state load failed (non-blocking)', { error: String(err) });
    return null;
  }
}

async function init(): Promise<void> {
  log.info('browser agent mesh initializing');

  bootstrapWorkers();

  const existingState = await loadSessionState();
  initSyncProvider(existingState ?? undefined);
  initMainSync();                     // doc.on('update') listener active NOW
  mountUI();

  const opfsAvailable = typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
  if (opfsAvailable) {
    await initPersistence();
    if (sharedDoc) {
      startSessionCheckpoints(sharedDoc);
      captureYDocUpdate(sharedDoc, 'ui-main-thread', null);
    }
  } else {
    log.warn('OPFS not available — persistence, checkpoints, and event log disabled');
  }

  setTimeout(() => {
    finishSharedWorkerConnection();   // transfer port + connect workers
  }, 200);
}

init().catch((err) => {
  log.error('initialization failed', { error: String(err) });
});
