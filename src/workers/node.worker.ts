import { createLogger } from '@utils/logging';
import { NodeWorkerAgent } from '@agents/worker/worker';
import { profileGPU } from '@webllm/profiles';

const log = createLogger('node-worker');

let agent: NodeWorkerAgent | null = null;

async function init(port: MessagePort): Promise<void> {
  const gpuProfile = await profileGPU();
  agent = new NodeWorkerAgent({ gpuProfile });
  agent.connect(port);
  void agent.start().catch((err) => log.error('agent failed', { error: String(err) }));

  log.info('node worker initialized', { hasGpu: !!gpuProfile });

  if (gpuProfile) {
    log.info('gpu profile', {
      model: gpuProfile.compatibleModels,
      benchmarkScore: gpuProfile.benchmarkScore,
    });
  }

  self.postMessage({ type: 'ready', role: 'worker', gpu: gpuProfile });
}

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort }>) => {
  if (e.data.type === 'init') {
    init(e.data.port).catch((err) =>
      log.error('init failed', { error: String(err) }),
    );
  }
};
