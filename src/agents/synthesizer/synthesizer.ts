import * as Y from 'yjs';
import { BaseAgent } from '../base';
import { getActiveWorkflows } from '@core/blackboard/root-doc';
import { DAG } from '@core/graph';
import { completeWorkflow, failWorkflow } from '@core/blackboard/task-state';
import type { Edge, TaskNode } from '@core/blackboard/schema';
import { consolidate, deduplicate, mergeByConfidence } from '@agents/synthesizer/reducer';

export class SynthesizerAgent extends BaseAgent {
  constructor(doc?: Y.Doc, tabId?: string) {
    super({ role: 'synthesizer', doc, tabId });
  }

  protected async run(): Promise<void> {
    this.log.info('synthesizer running');

    while (this.running) {
      await this.checkForReadyWorkflows();
      await this.sleep(2000);
    }
  }

  private async checkForReadyWorkflows(): Promise<void> {
    const workflows = getActiveWorkflows(this.doc);
    if (!workflows) return;

    for (const [workflowId, workflow] of workflows) {
      if (!workflow) continue;

      if (this.isSynthesizable(workflow)) {
        await this.synthesize(workflowId);
      }
    }
  }

  private async synthesize(workflowId: string): Promise<void> {
    this.log.info('synthesizing workflow', { workflowId });

    const workflow = getActiveWorkflows(this.doc).get(workflowId);
    if (!workflow) return;

    try {
      const dag = this.readWorkflowDag(workflow);
      const orderedTaskIds = dag.topologicalOrder();
      const completedNodes = orderedTaskIds
        .map((taskId) => dag.getNode(taskId))
        .filter((node): node is TaskNode => node !== undefined)
        .filter((node) => node.status === 'completed' && node.result !== null);

      if (completedNodes.length === 0) {
        const error = 'Workflow is ready for synthesis but no completed task results were found';
        failWorkflow(this.doc, workflowId, error);
        this.log.warn('workflow synthesis failed', { workflowId, error });
        return;
      }

      const rawFragments = completedNodes.map((node) => ({
        taskId: node.id,
        content: node.result,
        confidence: this.readConfidence(node.result),
      }));
      const deduplicatedFragments = deduplicate(rawFragments);
      const fragments = mergeByConfidence(deduplicatedFragments);

      if (fragments.length === 0) {
        const error = 'Workflow is ready for synthesis but all task results were filtered out';
        failWorkflow(this.doc, workflowId, error);
        this.log.warn('workflow synthesis failed', { workflowId, error, rawCount: rawFragments.length });
        return;
      }

      const content = await consolidate(fragments);
      const result = {
        type: 'synthesis_result' as const,
        content,
        fragments,
        metadata: {
          totalCompletedTasks: completedNodes.length,
          deduplicatedCount: deduplicatedFragments.length,
          fragmentCount: fragments.length,
          confidenceThreshold: 0.5,
        },
      };

      const completed = completeWorkflow(this.doc, workflowId, result);
      this.log.info('workflow synthesized', {
        workflowId,
        completed,
        completedTaskResults: completedNodes.length,
        deduplicatedResults: deduplicatedFragments.length,
        fragmentCount: fragments.length,
      });
    } catch (err) {
      const error = `Workflow synthesis failed: ${String(err)}`;
      failWorkflow(this.doc, workflowId, error);
      this.log.error('workflow synthesis threw', { workflowId, error });
    }
  }

  private isSynthesizable(workflow: Y.Map<unknown>): boolean {
    const state = workflow.get('state');
    const taskCount = workflow.get('taskCount');
    const completedCount = workflow.get('completedCount');
    const failedCount = workflow.get('failedCount');

    return state === 'active'
      && typeof taskCount === 'number'
      && typeof completedCount === 'number'
      && typeof failedCount === 'number'
      && taskCount > 0
      && failedCount === 0
      && completedCount === taskCount;
  }

  private readWorkflowDag(workflow: Y.Map<unknown>): DAG {
    const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>> | undefined;
    const edges = workflow.get('edges') as Y.Array<unknown> | undefined;

    if (!dagMap || !edges) {
      throw new Error('Workflow is missing DAG data');
    }

    const nodes: TaskNode[] = [];
    for (const [taskId, nodeEntry] of dagMap) {
      nodes.push({
        id: taskId,
        ...(nodeEntry.toJSON() as Omit<TaskNode, 'id'>),
      });
    }

    return DAG.fromJSON({
      nodes,
      edges: edges.toJSON() as Edge[],
    });
  }

  private readConfidence(result: unknown): number {
    if (typeof result !== 'object' || result === null) {
      return 1;
    }

    const confidence = (result as { confidence?: unknown }).confidence;
    return typeof confidence === 'number' ? confidence : 1;
  }
}
