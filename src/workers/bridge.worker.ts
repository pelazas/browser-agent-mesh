import { createLogger } from '@utils/logging';
import { BridgeAgent } from '@agents/bridge/bridge';

const log = createLogger('bridge-worker');

class BridgeWorkerAgent extends BridgeAgent {
  registerTools(): void {
    this.publishTool('web_scrape', 'Scrape content from a URL', {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to scrape' },
        selector: { type: 'string', description: 'CSS selector to extract' },
      },
      required: ['url'],
    });

    this.publishTool('opfs_read', 'Read a file from OPFS storage', {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to OPFS root' },
      },
      required: ['path'],
    });

    this.publishTool('opfs_write', 'Write a file to OPFS storage', {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to OPFS root' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    });
  }
}

let agent: BridgeWorkerAgent | null = null;

function init(port: MessagePort, tabId: string): void {
  agent = new BridgeWorkerAgent(tabId);
  agent.connect(port);
  agent.registerTools();
  void agent.start().catch((err) => log.error('agent failed', { error: String(err) }));

  log.info('bridge worker initialized');
  self.postMessage({ type: 'ready', role: 'bridge' });
}

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort; tabId: string }>) => {
  if (e.data.type === 'init') {
    init(e.data.port, e.data.tabId);
  }
};
