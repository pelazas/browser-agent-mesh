import { createLogger } from '@utils/logging';
import { createLocalDoc, WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { generateId } from '@utils/id';

const log = createLogger('synthesizer-worker');

const nodeId = generateId();
const doc = createLocalDoc();
let provider: WorkerSyncProvider | null = null;

function init(port: MessagePort): void {
  provider = new WorkerSyncProvider(doc, port);
  provider.connect(nodeId, 'synthesizer');

  log.info('synthesizer worker initialized', { nodeId });
  self.postMessage({ type: 'ready', nodeId });
}

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort }>) => {
  if (e.data.type === 'init') {
    init(e.data.port);
  }
};
