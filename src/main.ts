import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import { App } from '@ui/App';
import { BlackboardContext } from '@ui/context/BlackboardContext';
import { createLocalDoc, WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { getRootMap, getNodes, getActiveWorkflows, getTelemetry } from '@core/blackboard/root-doc';
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
    if (!networkWorker) return;

    const channel = new MessageChannel();
    const port = channel.port1;
    networkWorker.port.postMessage({ type: 'ui', payload: {} }, [channel.port2]);

    const networkState = { peerCount: 0 };
    (window as unknown as Record<string, unknown>).__MESH_NETWORK__ = networkState;

    const doc = createLocalDoc();
    const provider = new WorkerSyncProvider(doc, port);
    provider.onPeersUpdate = (count) => {
      networkState.peerCount = count;
      this.connected = count > 0;
    };
    provider.connect('ui-main-thread', 'ui');

    this.blackboardDoc = doc;

    // Expose for console inspection
    (window as unknown as Record<string, unknown>).__MESH_DOC__ = doc;
    (window as unknown as Record<string, unknown>).__MESH_BLACKBOARD__ = {
      getRootMap: () => getRootMap(doc),
      getNodes: () => [...getNodes(doc)],
      getWorkflows: () => [...getActiveWorkflows(doc)],
      getTelemetry: () => [...getTelemetry(doc)],
      dump: () => getRootMap(doc).toJSON(),
    };

    log.info('main thread connected to shared worker, doc is live');
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

  // Connect main thread to SharedWorker after a brief delay
  // to ensure the SharedWorker has finished init()
  setTimeout(() => {
    meshState.connectToSharedWorker();
  }, 200);
}

init().catch((err) => {
  log.error('initialization failed', { error: String(err) });
});
