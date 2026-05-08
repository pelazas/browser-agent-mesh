import type { TaskNode, Edge, EdgeType, TaskStatus } from '@core/blackboard/schema';

export type { TaskNode, Edge, EdgeType, TaskStatus };

export interface WorkflowGraph {
  nodes: Map<string, TaskNode>;
  edges: Edge[];
  rootNodeId: string;
}

export type ScheduledStep =
  | { type: 'exec'; node: TaskNode }
  | { type: 'fork'; nodes: TaskNode[] }
  | { type: 'join'; predecessorIds: string[] }
  | { type: 'condition'; node: TaskNode; branches: Map<string, string> };

export interface ExecutionPlan {
  steps: ScheduledStep[];
  totalTasks: number;
  estimatedParallelism: number;
}
