import { createLogger } from '@utils/logging';
import { SentinelAgent } from '@agents/sentinel/sentinel';

const log = createLogger('sentinel-worker');

let agent: SentinelAgent | null = null;

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort; config?: unknown }>) => {
  if (e.data.type === 'init') {
    agent = new SentinelAgent();
    agent.connect(e.data.port);
    void agent.start().catch((err) => log.error('agent failed', { error: String(err) }));
    log.info('sentinel worker initialized');
  }
};

self.postMessage({ type: 'ready', role: 'sentinel' });
