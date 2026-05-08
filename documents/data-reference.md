# Data Reference

## Root Y.Doc Structure

The root Y.Doc key is `bam-blackboard` (defined as `ROOT_DOC_KEY` in `src/core/blackboard/root-doc.ts`).

```yaml
bam-blackboard: Y.Map
  ├── activeWorkflows: Y.Map<string, Workflow>
  │     └── {workflowId}: Y.Map
  │           ├── id: string
  │           ├── prompt: string
  │           ├── state: "active" | "paused" | "completed" | "failed"
  │           ├── createdAt: number (ms)
  │           ├── updatedAt: number (ms)
  │           ├── ownerNodeId: string
  │           ├── taskCount: number
  │           ├── completedCount: number
  │           ├── failedCount: number
  │           ├── dag: Y.Map<string, TaskNodeEntry>
  │           │     └── {taskId}: Y.Map — see TaskNode schema below
  │           ├── edges: Y.Array<Edge>
  │           └── locks: Y.Map<string, LockEntry>
  │
  ├── nodes: Y.Map<string, NodeEntry>
  │     └── {nodeId}: Y.Map
  │           ├── id: string
  │           ├── role: "sentinel" | "worker" | "bridge" | "synthesizer"
  │           ├── gpu: GPUProfile | null
  │           ├── status: "idle" | "busy" | "offline"
  │           ├── joinedAt: number (ms)
  │           ├── lastHeartbeat: number (ms)
  │           └── tasks: Y.Array<string>  # claimed task IDs
  │
  ├── tools: Y.Map<string, ToolDescriptor>
  │     └── {toolId}: Y.Map
  │           ├── id: string
  │           ├── name: string
  │           ├── description: string
  │           ├── ownerNodeId: string
  │           └── schema: object (JSON Schema)
  │
  └── telemetry: Y.Map<string, Metrics>
        └── {nodeId}: Y.Map — see Metrics schema below
```

---

## Type Definitions

All types are defined in `src/core/blackboard/schema.ts`.

### GPUProfile
```ts
interface GPUProfile {
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupStorageSize: number;
  vramEstimateMB: number;
  benchmarkScore: number;
  compatibleModels: string[];
}
```

### TaskNode
```ts
interface TaskNode {
  id: string;
  type: 'llm_inference' | 'retrieve' | 'scrape' | 'reduce' | 'condition';
  description: string;
  status: 'pending' | 'claimed' | 'running' | 'completed' | 'failed';
  claimedBy: string | null;
  args: Record<string, unknown>;
  result: unknown | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}
```

### Edge
```ts
interface Edge {
  id: string;
  source: string;       // taskId
  target: string;       // taskId
  type: 'sequential' | 'parallel' | 'conditional';
  condition?: {
    field: string;      // dot-notation path (e.g. "nodeResults.t1.score")
    op: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
    value: unknown;
  };
}
```

### LockEntry
```ts
interface LockEntry {
  lockId: string;
  ownerNodeId: string;
  taskId: string;
  acquiredAt: number;   // ms timestamp
  ttlMs: number;        // default: 30_000
}
```

Lock keys are per-workflow: `activeWorkflows[wid].locks[taskId]`. Locks auto-expire after `acquiredAt + ttlMs`. If expired, another node can steal the lock.

### Metrics
```ts
interface Metrics {
  nodeId: string;
  cpuUsage: number;
  vramUsedMB: number;
  tokensPerSec: number | null;
  peerCount: number;
  bwDownKbps: number;
  bwUpKbps: number;
  timestamp: number;
}
```

### WorkflowEntry
```ts
interface WorkflowEntry {
  id: string;
  prompt: string;
  state: 'active' | 'paused' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  ownerNodeId: string;
  taskCount: number;
  completedCount: number;
  failedCount: number;
}
```

---

## Worker Message Protocol

All agent-to-SharedWorker communication uses typed JSON messages via `MessagePort`. Types defined in `src/core/blackboard/worker-provider.ts`.

### Message types (WorkerMessageType)

| Message | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `connect` | Agent → SW | `{ nodeId, role }` | Register as an agent |
| `connect_ack` | SW → Agent | `{ stateVector: Uint8Array }` | Initial Y.Doc snapshot |
| `sync_update` | Both ways | `{ update: Uint8Array }` | Yjs document delta |
| `observe` | Agent → SW | `{ path: string }` | Subscribe to path changes |
| `notify` | SW → Agent | `{ path, value }` | Path value changed |
| `claim` | Agent → SW | `{ workflowId, taskId }` | Try to claim a task |
| `claim_ack` | SW → Agent | `{ workflowId, taskId, acquired }` | Claim result |
| `publish_tool` | Agent → SW | `{ name, description, schema }` | Register an MCP tool |
| `peers_update` | SW → Agent | `{ count: number }` | y-webrtc peer count changed |

### Connection flow

```
Main thread                     SharedWorker
    │                                │
    │──new MessageChannel──►         │  port.transfer
    │──WorkerSyncProvider──►         │
    │                                │
    │──connect {nodeId, role}──►     │  handleAgentPort
    │◄──connect_ack {stateVector}───│  initial Y.Doc snapshot
    │                                │
    │──sync_update {update}──►       │  (on local doc change)
    │◄──sync_update {update}───────│  (relayed from peers)
    │◄──peers_update {count}───────│  (every 2s + on y-webrtc event)
```

---

## Graph Types

Defined in `src/core/graph/types.ts`.

```ts
interface WorkflowGraph {
  nodes: Map<string, TaskNode>;
  edges: Edge[];
  rootNodeId: string;
}

type ScheduledStep =
  | { type: 'exec'; node: TaskNode }
  | { type: 'fork'; nodes: TaskNode[] }
  | { type: 'join'; predecessorIds: string[] }
  | { type: 'condition'; node: TaskNode; branches: Map<string, string> };

interface ExecutionPlan {
  steps: ScheduledStep[];
  totalTasks: number;
  estimatedParallelism: number;
}
```

---

## DAG Validator Condition Resolution

Fields in Edge conditions resolve as follows (`src/core/graph/validator.ts`):

- Paths starting with `nodeResults.` resolve from `context.nodeResults` (Map of taskId → result)
- All other paths resolve from `context.workflowState` (plain object)
- Dot-notation supported: `meta.confidence` → `workflowState.meta.confidence`
