export * from './blackboard/schema';
export * from './blackboard/root-doc';
export { BlackboardObserver } from './blackboard/observer';
export { acquireLock, releaseLock, extendLock } from './blackboard/lock';
export type { LockResult } from './blackboard/lock';
export { WorkerSyncProvider, createLocalDoc } from './blackboard/worker-provider';
export type { WorkerMessage, WorkerMessageType } from './blackboard/worker-provider';

export { SwarmNode, YjsSyncProvider, GossipTelemetry, MCPServer, MCPClient } from './network';
export type { SwarmConfig, SyncConfig } from './network';

export { DAG, TaskScheduler, DAGValidator } from './graph';
export type { NodeCapability } from './graph';

export { MetricsCollector, MetricsReporter } from './telemetry';

export {
  initDatabase,
  getDatabase,
  closeDatabase,
  initEventLog,
  appendEvent,
  getEvents,
  captureYDocUpdate,
  initCheckpoints,
  saveCheckpoint,
  loadLatestCheckpoint,
  startPeriodicCheckpoint,
  restoreFromCheckpoint,
} from './persistence';
