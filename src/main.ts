import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@ui/App';
import { createLogger } from '@utils/logging';

const log = createLogger('main');

function detectCapabilities() {
  const hasWebGPU = 'gpu' in navigator;
  const hasSharedWorker = typeof SharedWorker !== 'undefined';
  const hasWorker = typeof Worker !== 'undefined';

  return { hasWebGPU, hasSharedWorker, hasWorker };
}

async function bootstrapWorkers(): Promise<void> {
  const caps = detectCapabilities();
  log.info('capability detection', caps);

  // 1. Start the Network SharedWorker (singleton)
  if (caps.hasSharedWorker) {
    try {
      const networkWorker = new SharedWorker(
        new URL('@workers/network.shared.ts', import.meta.url),
        { type: 'module', name: 'legion-network' },
      );

      log.info('network shared worker started');
    } catch (err) {
      log.warn('shared worker not supported, falling back to dedicated', { error: String(err) });
    }
  }

  // 2. Start the Sentinel dedicated worker
  if (caps.hasWorker) {
    try {
      const sentinelWorker = new Worker(
        new URL('@workers/sentinel.worker.ts', import.meta.url),
        { type: 'module', name: 'legion-sentinel' },
      );

      sentinelWorker.onmessage = (e) => {
        log.debug('sentinel message', { data: e.data });
      };

      log.info('sentinel worker started');
    } catch (err) {
      log.error('failed to start sentinel', { error: String(err) });
    }
  }

  // 3. Start Node Workers if WebGPU is available
  if (caps.hasWebGPU && caps.hasWorker) {
    try {
      const nodeWorker = new Worker(
        new URL('@workers/node.worker.ts', import.meta.url),
        { type: 'module', name: 'legion-node' },
      );

      nodeWorker.onmessage = (e) => {
        const data = e.data as { type: string; gpu?: unknown };
        if (data.type === 'ready' && data.gpu) {
          log.info('node worker ready with GPU', { gpu: data.gpu });
        }
      };

      log.info('node worker started');
    } catch (err) {
      log.error('failed to start node worker', { error: String(err) });
    }
  }

  // 4. Start a Bridge worker for MCP tool access
  if (caps.hasWorker) {
    try {
      const bridgeWorker = new Worker(
        new URL('@workers/bridge.worker.ts', import.meta.url),
        { type: 'module', name: 'legion-bridge' },
      );

      log.info('bridge worker started');
    } catch (err) {
      log.error('failed to start bridge worker', { error: String(err) });
    }
  }

  // 5. Start the Synthesizer worker
  if (caps.hasWorker) {
    try {
      const synthWorker = new Worker(
        new URL('@workers/synthesizer.worker.ts', import.meta.url),
        { type: 'module', name: 'legion-synthesizer' },
      );

      log.info('synthesizer worker started');
    } catch (err) {
      log.error('failed to start synthesizer', { error: String(err) });
    }
  }
}

function mountUI(): void {
  const container = document.getElementById('root');
  if (!container) {
    log.error('root element not found');
    return;
  }

  const root = createRoot(container);
  root.render(React.createElement(App));
  log.info('UI mounted');
}

async function init(): Promise<void> {
  log.info('legion browser agent mesh initializing');

  mountUI();
  await bootstrapWorkers();
  log.info('initialization complete');
}

init().catch((err) => {
  log.error('initialization failed', { error: String(err) });
});
