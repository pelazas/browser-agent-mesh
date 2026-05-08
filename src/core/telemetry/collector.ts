import type { Metrics, GPUProfile } from '@core/blackboard/schema';

export class MetricsCollector {
  private nodeId: string;
  private baselineMemory: number;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.baselineMemory = this.measureMemory();
  }

  async collect(gpuProfile: GPUProfile | null, peerCount: number): Promise<Metrics> {
    const memory = this.measureMemory();
    const tokensPerSec = gpuProfile ? this.estimateTokensPerSec(gpuProfile) : null;

    return {
      nodeId: this.nodeId,
      cpuUsage: this.estimateCpuUsage(),
      vramUsedMB: gpuProfile?.vramEstimateMB ?? 0,
      tokensPerSec,
      peerCount,
      bwDownKbps: 0,
      bwUpKbps: 0,
      timestamp: Date.now(),
    };
  }

  private measureMemory(): number {
    if ('memory' in performance) {
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return mem?.usedJSHeapSize ?? 0;
    }
    return 0;
  }

  private estimateCpuUsage(): number {
    const current = this.measureMemory();
    const diff = current - this.baselineMemory;
    this.baselineMemory = current;
    return Math.max(0, diff / (1024 * 1024)); // MB delta
  }

  private estimateTokensPerSec(gpu: GPUProfile): number {
    const score = gpu.benchmarkScore;
    if (score > 5000) return 45;
    if (score > 2000) return 25;
    if (score > 1000) return 15;
    return 5;
  }
}
