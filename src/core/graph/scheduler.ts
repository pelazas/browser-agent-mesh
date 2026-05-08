import { DAG } from './dag';
import type { TaskNode, ScheduledStep, ExecutionPlan } from './types';
import type { GPUProfile } from '@core/blackboard/schema';

export interface NodeCapability {
  nodeId: string;
  role: string;
  gpu: GPUProfile | null;
  status: string;
}

export class TaskScheduler {
  assignTask(task: TaskNode, availableNodes: NodeCapability[]): string | null {
    if (task.type === 'reduce' || task.type === 'condition') {
      const synth = availableNodes.find((n) => n.role === 'synthesizer' && n.status === 'idle');
      return synth?.nodeId ?? null;
    }

    if (task.type === 'scrape') {
      const bridge = availableNodes.find((n) => n.role === 'bridge' && n.status === 'idle');
      return bridge?.nodeId ?? null;
    }

    if (task.type === 'llm_inference') {
      const candidates = availableNodes
        .filter((n) => n.role === 'worker' && n.status === 'idle')
        .sort((a, b) => (b.gpu?.benchmarkScore ?? 0) - (a.gpu?.benchmarkScore ?? 0));

      return candidates[0]?.nodeId ?? null;
    }

    return null;
  }

  buildPlan(dag: DAG, _availableNodes: NodeCapability[]): ExecutionPlan {
    const steps: ScheduledStep[] = [];
    const order = dag.topologicalOrder();
    const parallelGroups = dag.getParallelGroups();

    for (const nodeId of order) {
      const node = dag.getNode(nodeId);
      if (!node) continue;

      const inGroup = parallelGroups.find((g) => g.some((n) => n.id === nodeId));
      if (inGroup) {
        if (!steps.some((s) => s.type === 'fork' && s.nodes === inGroup)) {
          steps.push({ type: 'fork', nodes: inGroup });
        }
        continue;
      }

      if (node.type === 'condition') {
        const successors = dag.getSuccessors(nodeId);
        const branches = new Map<string, string>();
        for (const succ of successors) {
          branches.set(succ, succ);
        }
        steps.push({ type: 'condition', node, branches });
        continue;
      }

      steps.push({ type: 'exec', node });
    }

    return {
      steps,
      totalTasks: order.length,
      estimatedParallelism: parallelGroups.length,
    };
  }

  getNextReadyTasks(dag: DAG): TaskNode[] {
    return dag.getReadyTasks();
  }

  canExecuteInParallel(taskA: TaskNode, taskB: TaskNode, dag: DAG): boolean {
    const predsA = dag.getPredecessors(taskA.id);
    const predsB = dag.getPredecessors(taskB.id);

    const hasSharedDep = predsA.some((p) => predsB.includes(p));
    if (hasSharedDep) return true;

    const queueA = [...predsA];
    const ancestorsB = new Set(predsB);

    while (queueA.length > 0) {
      const current = queueA.shift()!;
      if (ancestorsB.has(current)) return true;
      const grandparents = dag.getPredecessors(current);
      queueA.push(...grandparents);
    }

    return false;
  }
}
