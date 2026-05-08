import { createLogger } from '@utils/logging';
import { createLocalDoc, WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { generateId } from '@utils/id';

const log = createLogger('bridge-worker');

const nodeId = generateId();
const doc = createLocalDoc();
let provider: WorkerSyncProvider | null = null;

function init(port: MessagePort): void {
  provider = new WorkerSyncProvider(doc, port);
  provider.connect(nodeId, 'bridge');

  // Register available tools
  provider.publishTool('web_scrape', 'Scrape content from a URL', {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to scrape' },
      selector: { type: 'string', description: 'CSS selector to extract' },
    },
    required: ['url'],
  });

  provider.publishTool('opfs_read', 'Read a file from OPFS storage', {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to OPFS root' },
    },
    required: ['path'],
  });

  provider.publishTool('opfs_write', 'Write a file to OPFS storage', {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to OPFS root' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  });

  log.info('bridge worker initialized', { nodeId });
  self.postMessage({ type: 'ready', nodeId });
}

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort }>) => {
  if (e.data.type === 'init') {
    init(e.data.port);
  }
};
