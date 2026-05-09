import * as Y from 'yjs';
import { BaseAgent } from '../base';
import { getActiveWorkflows } from '@core/blackboard/root-doc';
import { DAG } from '@core/graph';

export class SynthesizerAgent extends BaseAgent {
  constructor() {
    super({ role: 'synthesizer' });
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

    for (const [workflowId] of workflows) {
      const workflow = workflows.get(workflowId);
      if (!workflow) continue;

      const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
      if (!dagMap) continue;

      const edges = workflow.get('edges') as Y.Array<unknown>;

      const nodesArray: { id: string; status: string }[] = [];
      for (const [nodeId, nodeEntry] of dagMap) {
        nodesArray.push({
          id: nodeId,
          ...(nodeEntry.toJSON() as Record<string, unknown>),
        } as { id: string; status: string });
      }

      const dag = DAG.fromJSON({
        nodes: nodesArray.map((n) => ({
          id: n.id,
          type: 'reduce' as const,
          description: '',
          status: n.status as 'pending' | 'completed' | 'failed',
          claimedBy: null,
          args: {},
          result: null,
          error: null,
          createdAt: 0,
          startedAt: null,
          completedAt: null,
        })),
        edges: edges.toJSON() as [],
      });

      if (dag.isComplete() && !dag.hasFailed()) {
        await this.synthesize(workflowId);
      }
    }
  }

  private async synthesize(workflowId: string): Promise<void> {
    this.log.info('synthesizing workflow', { workflowId });

    const workflow = getActiveWorkflows(this.doc).get(workflowId);
    if (!workflow) return;

    // Collect results from all completed tasks
    const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
    const results: string[] = [];

    for (const [, nodeEntry] of dagMap) {
      const data = nodeEntry.toJSON() as Record<string, unknown>;
      if (data.result) {
        results.push(JSON.stringify(data.result));
      }
    }

    // In production: run LLM to synthesize findings
    const synthesis = `Workflow ${workflowId} complete. ${results.length} tasks produced results.`;

    workflow.set('state', 'completed');
    workflow.set('updatedAt', Date.now());

    this.log.info('workflow synthesized', { workflowId, taskResults: results.length, synthesis });
  }
}
