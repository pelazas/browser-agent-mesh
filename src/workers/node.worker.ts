import { createLogger } from '@utils/logging';
import { createLocalDoc, WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { generateId } from '@utils/id';
import { profileGPU } from '@webllm/profiles';

const log = createLogger('node-worker');

const nodeId = generateId();
const doc = createLocalDoc();
let provider: WorkerSyncProvider | null = null;

async function init(port: MessagePort): Promise<void> {
  provider = new WorkerSyncProvider(doc, port);
  provider.connect(nodeId, 'worker');

  const gpuProfile = await profileGPU();
  log.info('node worker initialized', { nodeId, hasGpu: !!gpuProfile });

  if (gpuProfile) {
    log.info('gpu profile', {
      model: gpuProfile.compatibleModels,
      benchmarkScore: gpuProfile.benchmarkScore,
    });
  }

  self.postMessage({ type: 'ready', nodeId, gpu: gpuProfile });
}

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort }>) => {
  if (e.data.type === 'init') {
    init(e.data.port).catch((err) =>
      log.error('init failed', { error: String(err) }),
    );
  }
};
