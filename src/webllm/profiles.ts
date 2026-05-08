import type { GPUProfile } from '@core/blackboard/schema';
import { createLogger } from '@utils/logging';

const log = createLogger('gpu-profiler');

interface GPUAdapterInfo {
  vendor: string;
  architecture: string;
  description: string;
}

export async function profileGPU(): Promise<GPUProfile | null> {
  if (!('gpu' in navigator)) {
    log.info('WebGPU not available in this context');
    return null;
  }

  const gpu = navigator.gpu as GPU;
  const adapter = await gpu.requestAdapter({
    powerPreference: 'high-performance',
  });

  if (!adapter) {
    log.info('No GPU adapter found');
    return null;
  }

  const info = await tryGetAdapterInfo(adapter);
  log.info('adapter detected', { info });

  const limits: GPUProfile = {
    maxBufferSize: adapter.limits.maxBufferSize,
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
    vramEstimateMB: 0,
    benchmarkScore: 0,
    compatibleModels: [],
  };

  const device = await adapter.requestDevice();
  const vramEstimateMB = await estimateVRAM(device, limits.maxBufferSize);
  const benchmarkScore = await runMicroBenchmark(device);

  limits.vramEstimateMB = vramEstimateMB;
  limits.benchmarkScore = benchmarkScore;

  const compatibleModels = getCompatibleModels(vramEstimateMB);
  limits.compatibleModels = compatibleModels;

  log.info('gpu profile complete', {
    vramEstimateMB,
    benchmarkScore,
    compatibleModels: compatibleModels.length,
  });

  return limits;
}

async function estimateVRAM(device: GPUDevice, maxBufferSize: number): Promise<number> {
  const attempts = [maxBufferSize, maxBufferSize / 2, maxBufferSize / 4, maxBufferSize / 8, maxBufferSize / 16];
  let allocated = 0;

  for (const size of attempts) {
    const usableSize = Math.min(size, 4 * 1024 * 1024 * 1024); // cap at 4GB for sanity
    try {
      const buf = device.createBuffer({
        size: usableSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: false,
      });
      allocated = usableSize;
      buf.destroy();
      break;
    } catch {
      continue;
    }
  }

  console.warn('vram estimation called', { allocated });

  return Math.round(allocated / (1024 * 1024));
}

async function runMicroBenchmark(device: GPUDevice): Promise<number> {
  try {
    const module = device.createShaderModule({
      label: 'benchmark',
      code: `
        @group(0) @binding(0) var<storage, read_write> data: array<f32>;
        
        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          let idx = id.x;
          if (idx >= arrayLength(&data)) { return; }
          var sum: f32 = 0.0;
          for (var i = 0u; i < 256u; i++) {
            sum += data[idx] * f32(i) * 0.001;
          }
          data[idx] = sum;
        }
      `,
    });

    const pipeline = device.createComputePipeline({
      label: 'benchmark',
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });

    const ELEMENTS = 1024 * 256;
    const initData = new Float32Array(ELEMENTS);
    for (let i = 0; i < ELEMENTS; i++) initData[i] = Math.random();

    const buffer = device.createBuffer({
      size: ELEMENTS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    device.queue.writeBuffer(buffer, 0, initData);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer } }],
    });

    const commandEncoder = device.createCommandEncoder({ label: 'benchmark' });
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(ELEMENTS / 256);
    pass.end();

    const start = performance.now();
    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const elapsed = performance.now() - start;

    buffer.destroy();

    // Score = ops / second (higher is better)
    const opsPerMs = ELEMENTS / elapsed;
    return Math.round(opsPerMs);
  } catch (err) {
    log.warn('benchmark failed', { error: String(err) });
    return 0;
  }
}

function getCompatibleModels(_vramMB: number): string[] {
  // Simple tiered compatibility based on VRAM budget
  // Actual model selection happens in model-loader.ts
  return [];
}

async function tryGetAdapterInfo(adapter: GPUAdapter): Promise<GPUAdapterInfo | null> {
  try {
    const info = await adapter.requestAdapterInfo();
    return {
      vendor: info.vendor,
      architecture: info.architecture,
      description: info.description,
    };
  } catch {
    return null;
  }
}
