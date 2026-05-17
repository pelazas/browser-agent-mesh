import { generateId } from '@utils/id';
import type { TaskNode, Edge, WorkflowGraph } from './types';

export class DAG {
  private nodes: Map<string, TaskNode> = new Map();
  private edges: Edge[] = [];
  private incoming: Map<string, string[]> = new Map();
  private outgoing: Map<string, string[]> = new Map();
  private rootNodeId: string | null = null;

  getNode(taskId: string): TaskNode | undefined {
    return this.nodes.get(taskId);
  }

  hasNode(taskId: string): boolean {
    return this.nodes.has(taskId);
  }

  addNode(node: Omit<TaskNode, 'id' | 'createdAt' | 'status' | 'claimedBy' | 'result' | 'error' | 'startedAt' | 'completedAt'>): string {
    const id = generateId();
    const full: TaskNode = {
      ...node,
      id,
      status: 'pending',
      claimedBy: null,
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    };
    this.nodes.set(id, full);
    this.incoming.set(id, []);
    this.outgoing.set(id, []);

    if (!this.rootNodeId) {
      this.rootNodeId = id;
    }

    return id;
  }

  addEdge(source: string, target: string, type: Edge['type'] = 'sequential'): string {
    if (!this.nodes.has(source) || !this.nodes.has(target)) {
      throw new Error(`Edge references unknown nodes: ${source} -> ${target}`);
    }

    const id = generateId();
    const edge: Edge = { id, source, target, type };

    this.edges.push(edge);
    this.outgoing.get(source)!.push(target);
    this.incoming.get(target)!.push(source);

    this.updateNodeTypes(source, target, type);

    return id;
  }

  setRoot(nodeId: string): void {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Root node not found: ${nodeId}`);
    }
    this.rootNodeId = nodeId;
  }

  getRoot(): string | null {
    return this.rootNodeId;
  }

  getPredecessors(nodeId: string): string[] {
    return this.incoming.get(nodeId) ?? [];
  }

  getSuccessors(nodeId: string): string[] {
    return this.outgoing.get(nodeId) ?? [];
  }

  getReadyTasks(): TaskNode[] {
    const ready: TaskNode[] = [];

    for (const [id, node] of this.nodes) {
      if (node.status !== 'pending') continue;
      const predecessors = this.incoming.get(id) ?? [];
      if (predecessors.length === 0) {
        ready.push(node);
        continue;
      }

      const allComplete = predecessors.every((predId) => {
        const pred = this.nodes.get(predId);
        return pred && pred.status === 'completed';
      });

      if (allComplete) {
        ready.push(node);
      }
    }

    return ready;
  }

  getParallelGroups(): TaskNode[][] {
    const groups: TaskNode[][] = [];
    const visited = new Set<string>();

    for (const [id] of this.nodes) {
      if (visited.has(id)) continue;
      const successors = this.outgoing.get(id) ?? [];
      if (successors.length > 1) {
        const parallelNodes = successors
          .filter((sid) => this.isParallelBranch(id, sid))
          .map((sid) => this.nodes.get(sid)!)
          .filter(Boolean);

        if (parallelNodes.length > 1) {
          groups.push(parallelNodes);
          for (const pn of parallelNodes) {
            visited.add(pn.id);
          }
        }
      }
    }

    return groups;
  }

  isComplete(): boolean {
    for (const node of this.nodes.values()) {
      if (node.status === 'pending' || node.status === 'claimed' || node.status === 'running') {
        return false;
      }
    }
    return true;
  }

  hasFailed(): boolean {
    for (const node of this.nodes.values()) {
      if (node.status === 'failed') return true;
    }
    return false;
  }

  topologicalOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) return;
      visiting.add(nodeId);

      for (const succ of this.outgoing.get(nodeId) ?? []) {
        visit(succ);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      order.unshift(nodeId);
    };

    const root = this.rootNodeId ?? this.findRoot();
    if (root) visit(root);

    return order;
  }

  getGraph(): WorkflowGraph {
    return {
      nodes: this.nodes,
      edges: this.edges,
      rootNodeId: this.rootNodeId ?? this.findRoot() ?? '',
    };
  }

  toJSON(): { nodes: TaskNode[]; edges: Edge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
    };
  }

  static fromJSON(json: { nodes: TaskNode[]; edges: Edge[] }): DAG {
    const dag = new DAG();
    for (const node of json.nodes) {
      dag.nodes.set(node.id, node);
      dag.incoming.set(node.id, []);
      dag.outgoing.set(node.id, []);
    }
    for (const edge of json.edges) {
      dag.edges.push(edge);
      dag.outgoing.get(edge.source)?.push(edge.target);
      dag.incoming.get(edge.target)?.push(edge.source);
    }
    if (json.nodes.length > 0) {
      dag.rootNodeId = dag.findRoot();
    }
    return dag;
  }

  private findRoot(): string | null {
    for (const [id] of this.nodes) {
      const incomingCount = (this.incoming.get(id) ?? []).length;
      if (incomingCount === 0) return id;
    }
    return null;
  }

  private isParallelBranch(source: string, target: string): boolean {
    const edge = this.edges.find((e) => e.source === source && e.target === target);
    return edge?.type === 'parallel';
  }

  private updateNodeTypes(_source: string, _target: string, _type: Edge['type']): void {
    // Edge types propagate to node type classification in scheduler
  }
}
