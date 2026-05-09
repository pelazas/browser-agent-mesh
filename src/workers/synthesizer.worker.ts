import { createLogger } from '@utils/logging';
import { SynthesizerAgent } from '@agents/synthesizer/synthesizer';

const log = createLogger('synthesizer-worker');

let agent: SynthesizerAgent | null = null;

function init(port: MessagePort): void {
  agent = new SynthesizerAgent();
  agent.connect(port);
  void agent.start().catch((err) => log.error('agent failed', { error: String(err) }));

  log.info('synthesizer worker initialized');
  self.postMessage({ type: 'ready', role: 'synthesizer' });
}

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort }>) => {
  if (e.data.type === 'init') {
    init(e.data.port);
  }
};
