import type { Metrics } from '@core/blackboard/schema';
import { createLogger } from '@utils/logging';

const log = createLogger('gossip');

export interface GossipOpts {
  publishIntervalMs: number;
  nodeId: string;
}

export type GossipListener = (metrics: Metrics) => void;

export class GossipTelemetry {
  private listeners: GossipListener[] = [];
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private opts: GossipOpts;
  private publishFn?: (data: Uint8Array) => void;

  constructor(opts: GossipOpts) {
    this.opts = opts;
  }

  setPublisher(fn: (data: Uint8Array) => void): void {
    this.publishFn = fn;
  }

  subscribe(listener: GossipListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  subscribeFromGossipSub(_onMessage: (data: Uint8Array) => void): void {
    // Called by GossipSub incoming handler
  }

  handleIncoming(data: Uint8Array): void {
    try {
      const metrics = JSON.parse(new TextDecoder().decode(data)) as Metrics;
      for (const listener of this.listeners) {
        listener(metrics);
      }
    } catch {
      log.warn('failed to parse gossip message');
    }
  }

  start(): void {
    this.heartbeatTimer = setInterval(() => {
      this.publishMetrics();
    }, this.opts.publishIntervalMs);
    log.info('gossip telemetry started', { interval: this.opts.publishIntervalMs });
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private collectMetrics(): Metrics {
    return {
      nodeId: this.opts.nodeId,
      cpuUsage: 0,
      vramUsedMB: 0,
      tokensPerSec: null,
      peerCount: 0,
      bwDownKbps: 0,
      bwUpKbps: 0,
      timestamp: Date.now(),
    };
  }

  private publishMetrics(): void {
    const metrics = this.collectMetrics();
    if (this.publishFn) {
      const data = new TextEncoder().encode(JSON.stringify(metrics));
      this.publishFn(data);
    }
  }
}
