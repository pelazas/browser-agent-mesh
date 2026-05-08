import type { Metrics } from '@core/blackboard/schema';
import * as Y from 'yjs';
import { getTelemetry } from '@core/blackboard/root-doc';
import { createLogger } from '@utils/logging';

const log = createLogger('reporter');

export class MetricsReporter {
  private doc: Y.Doc;
  private nodeId: string;
  private publishFn?: (data: Uint8Array) => void;

  constructor(doc: Y.Doc, nodeId: string) {
    this.doc = doc;
    this.nodeId = nodeId;
  }

  setPublisher(fn: (data: Uint8Array) => void): void {
    this.publishFn = fn;
  }

  report(metrics: Omit<Metrics, 'nodeId'>): void {
    this.writeToBlackboard(metrics);
    this.publishToGossip(metrics);
  }

  private writeToBlackboard(metrics: Omit<Metrics, 'nodeId'>): void {
    const telemetry = getTelemetry(this.doc);
    const entry = new Y.Map<unknown>();
    entry.set('nodeId', this.nodeId);
    entry.set('cpuUsage', metrics.cpuUsage);
    entry.set('vramUsedMB', metrics.vramUsedMB);
    entry.set('tokensPerSec', metrics.tokensPerSec);
    entry.set('peerCount', metrics.peerCount);
    entry.set('bwDownKbps', metrics.bwDownKbps);
    entry.set('bwUpKbps', metrics.bwUpKbps);
    entry.set('timestamp', metrics.timestamp);

    telemetry.set(this.nodeId, entry);
  }

  private publishToGossip(metrics: Omit<Metrics, 'nodeId'>): void {
    if (!this.publishFn) return;

    const data: Metrics = {
      nodeId: this.nodeId,
      ...metrics,
    };

    try {
      const encoded = new TextEncoder().encode(JSON.stringify(data));
      this.publishFn(encoded);
    } catch (err) {
      log.warn('failed to publish metrics', { error: String(err) });
    }
  }
}
