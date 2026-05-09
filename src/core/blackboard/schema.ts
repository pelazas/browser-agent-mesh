import type { Y } from 'yjs';

export type AgentRole = 'sentinel' | 'worker' | 'bridge' | 'synthesizer';

export type NodeStatus = 'idle' | 'busy' | 'offline';

export type TaskStatus = 'pending' | 'claimed' | 'running' | 'completed' | 'failed';

export type EdgeType = 'sequential' | 'parallel' | 'conditional';

export type WorkflowState = 'active' | 'paused' | 'completed' | 'failed';

export type PromptRequestStatus = 'pending' | 'claimed' | 'processed' | 'failed';

export interface GPUProfile {
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupStorageSize: number;
  vramEstimateMB: number;
  benchmarkScore: number;
  compatibleModels: string[];
}

export interface NodeProfile {
  id: string;
  role: AgentRole;
  gpu: GPUProfile | null;
  status: NodeStatus;
  joinedAt: number;
  lastHeartbeat: number;
  tasks: string[];
}

export interface TaskNode {
  id: string;
  type: 'llm_inference' | 'retrieve' | 'scrape' | 'reduce' | 'condition';
  description: string;
  status: TaskStatus;
  claimedBy: string | null;
  args: Record<string, unknown>;
  result: unknown | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  condition?: {
    field: string;
    op: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
    value: unknown;
  };
}

export interface WorkflowEntry {
  id: string;
  prompt: string;
  state: WorkflowState;
  createdAt: number;
  updatedAt: number;
  ownerNodeId: string;
  taskCount: number;
  completedCount: number;
  failedCount: number;
}

export interface PromptRequestEntry {
  id: string;
  prompt: string;
  status: PromptRequestStatus;
  createdAt: number;
  updatedAt: number;
  requestedByNodeId: string;
  claimedBy: string | null;
  workflowId: string | null;
  error: string | null;
}

export interface ToolDescriptor {
  id: string;
  name: string;
  description: string;
  ownerNodeId: string;
  schema: Record<string, unknown>;
}

export interface Metrics {
  nodeId: string;
  cpuUsage: number;
  vramUsedMB: number;
  tokensPerSec: number | null;
  peerCount: number;
  bwDownKbps: number;
  bwUpKbps: number;
  timestamp: number;
}

export interface LockEntry {
  lockId: string;
  ownerNodeId: string;
  taskId: string;
  acquiredAt: number;
  ttlMs: number;
}

// Yjs document type structure (for reference)

export interface RootDocTypes {
  activeWorkflows: Y.Map<Y.Map<unknown>>;
  promptRequests: Y.Map<Y.Map<unknown>>;
  nodes: Y.Map<Y.Map<unknown>>;
  tools: Y.Map<Y.Map<unknown>>;
  telemetry: Y.Map<Y.Map<unknown>>;
  locks: Y.Map<Y.Map<unknown>>;
}
