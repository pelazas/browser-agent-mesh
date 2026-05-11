import { createLogger } from '@utils/logging';
import { SynthesizerAgent } from '@agents/synthesizer/synthesizer';

const log = createLogger('synthesizer-worker');

let agent: SynthesizerAgent | null = null;

function init(port: MessagePort, tabId: string): void {
  agent = new SynthesizerAgent(undefined, tabId);
  agent.connect(port);
  void agent.start().catch((err) => log.error('agent failed', { error: String(err) }));

  log.info('synthesizer worker initialized');
  self.postMessage({ type: 'ready', role: 'synthesizer' });
}

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort; tabId: string }>) => {
  if (e.data.type === 'init') {
    init(e.data.port, e.data.tabId);
  }
};
