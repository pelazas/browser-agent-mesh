import type { Edge } from './types';

export interface ConditionContext {
  nodeResults: Map<string, unknown>;
  workflowState: Record<string, unknown>;
}

export class DAGValidator {
  validate(edge: Edge, context: ConditionContext): boolean {
    // If no condition, always pass (sequential/parallel edges)
    if (!edge.condition) return true;

    const { field, op, value } = edge.condition;
    const actual = this.resolveField(field, context);

    switch (op) {
      case 'eq':
        return actual === value;
      case 'neq':
        return actual !== value;
      case 'gt':
        return Number(actual) > Number(value);
      case 'lt':
        return Number(actual) < Number(value);
      case 'contains':
        if (typeof actual === 'string') return actual.includes(String(value));
        if (typeof actual === 'object' && actual !== null) {
          return Object.keys(actual as object).includes(String(value));
        }
        return false;
      default:
        return false;
    }
  }

  evaluatePreconditions(
    nodeId: string,
    edges: Edge[],
    context: ConditionContext,
  ): boolean {
    const incomingEdges = edges.filter((e) => e.target === nodeId);

    // No incoming edges = root, always ready
    if (incomingEdges.length === 0) return true;

    return incomingEdges.every((edge) => {
      // Check if source task is complete
      const sourceResult = context.nodeResults.get(edge.source);

      // Sequential edges: source must be complete
      if (edge.type === 'sequential') return sourceResult !== undefined;

      // Parallel edges: no precondition on source completion
      if (edge.type === 'parallel') return true;

      // Conditional edges: validate the condition
      if (edge.type === 'conditional') {
        return this.validate(edge, context);
      }

      return false;
    });
  }

  getBranchTargetPath(
    conditionNodeId: string,
    edges: Edge[],
    context: ConditionContext,
  ): string[] {
    const branchEdges = edges.filter(
      (e) => e.source === conditionNodeId && e.type === 'conditional',
    );

    return branchEdges
      .filter((edge) => this.validate(edge, context))
      .map((edge) => edge.target);
  }

  private resolveField(field: string, context: ConditionContext): unknown {
    // Support dot-notation paths
    // - "status" → context.workflowState.status
    // - "meta.confidence" → context.workflowState.meta.confidence
    // - "nodeResults.taskId.output.score" → context.nodeResults.get("taskId").output.score
    const parts = field.split('.');

    if (parts[0] === 'nodeResults') {
      const taskId = parts[1];
      const subPath = parts.slice(2);
      let current = context.nodeResults.get(taskId);
      for (const part of subPath) {
        if (current === null || current === undefined) return undefined;
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    }

    // Default: resolve from workflowState
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = context.workflowState;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }
}
