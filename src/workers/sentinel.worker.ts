import { createLogger } from '@utils/logging';
import { SentinelAgent } from '@agents/sentinel/sentinel';

const log = createLogger('sentinel-worker');

let agent: SentinelAgent | null = null;

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort; tabId: string; config?: unknown }>) => {
  log.info('received message', { type: e.data.type, hasPort: !!e.data.port });
  if (e.data.type === 'init') {
    agent = new SentinelAgent(undefined, e.data.tabId);
    agent.connect(e.data.port);
    void agent.start().catch((err) => log.error('agent failed', { error: String(err) }));
    log.info('sentinel worker initialized');
  }
};

self.postMessage({ type: 'ready', role: 'sentinel' });
