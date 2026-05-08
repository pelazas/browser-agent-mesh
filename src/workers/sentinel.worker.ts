import { createLogger } from '@utils/logging';
import { createLocalDoc, WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { generateId } from '@utils/id';

const log = createLogger('sentinel-worker');

const nodeId = generateId();
const doc = createLocalDoc();
let provider: WorkerSyncProvider | null = null;

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort; config?: unknown }>) => {
  if (e.data.type === 'init') {
    const port = e.data.port;
    provider = new WorkerSyncProvider(doc, port);
    provider.connect(nodeId, 'sentinel');
    log.info('sentinel worker initialized', { nodeId });
  }
};

self.postMessage({ type: 'ready', nodeId });
