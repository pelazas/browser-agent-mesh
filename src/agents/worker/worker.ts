import { BaseAgent } from '../base';
import { getActiveWorkflows, getNodes } from '@core/blackboard/root-doc';
import { acquireLock, releaseLock } from '@core/blackboard/lock';
import type { GPUProfile, TaskNode } from '@core/blackboard/schema';
import { getEngineStatus, getCurrentModel, getAvailableModels, selectBestModel } from '@webllm';
import { TaskScheduler, type NodeCapability } from '@core/graph';
import { DAG } from '@core/graph/dag';

interface NodeConfig {
  gpuProfile: GPUProfile | null;
}

export class NodeWorkerAgent extends BaseAgent {
  private gpuProfile: GPUProfile | null;
  private scheduler: TaskScheduler;

  constructor(config: NodeConfig) {
    super({ role: 'worker' });
    this.gpuProfile = config.gpuProfile;
    this.scheduler = new TaskScheduler();
  }

  protected async run(): Promise<void> {
    this.log.info('node worker running');

    // Select and load appropriate model
    if (this.gpuProfile) {
      const model = selectBestModel(this.gpuProfile.vramEstimateMB, 'medium');
      if (model) {
        this.log.info('selected model', { model: model.id });
      }
    }

    const pollInterval = 1500;

    while (this.running) {
      try {
        await this.pollAndExecute();
      } catch (err) {
        this.log.error('poll error', { error: String(err) });
      }
      await this.sleep(pollInterval);
    }
  }

  private async pollAndExecute(): Promise<void> {
    const workflows = getActiveWorkflows(this.doc);

    for (const [workflowId] of workflows) {
      const workflow = workflows.get(workflowId);
      if (!workflow) continue;

      const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
      if (!dagMap) continue;

      const edges = workflow.get('edges') as Y.Array<unknown>;
      const nodesArray: TaskNode[] = [];

      for (const [nodeId, nodeEntry] of dagMap) {
        nodesArray.push({
          id: nodeId,
          ...(nodeEntry.toJSON() as unknown as Omit<TaskNode, 'id'>),
        });
      }

      const dag = DAG.fromJSON({
        nodes: nodesArray,
        edges: edges.toJSON() as unknown as { id: string; source: string; target: string; type: string }[],
      });

      const readyTasks = dag.getReadyTasks();

      for (const task of readyTasks) {
        if (task.type === 'retrieve' || task.type === 'scrape' || task.type === 'condition') {
          continue; // Not for Node Workers
        }

        const lock = acquireLock(this.doc, workflowId, task.id, this.nodeId);
        if (!lock.acquired) continue;

        this.log.info('task claimed', { taskId: task.id, workflowId });

        try {
          const result = await this.executeTask(task);
          this.completeTask(workflowId, task.id, result);
        } catch (err) {
          this.failTask(workflowId, task.id, String(err));
        } finally {
          releaseLock(this.doc, workflowId, task.id, this.nodeId);
        }
      }
    }
  }

  private async executeTask(task: TaskNode): Promise<unknown> {
    this.log.info('executing task', { taskId: task.id, type: task.type });

    if (task.type === 'llm_inference') {
      const status = getEngineStatus();
      if (status !== 'ready') {
        throw new Error(`Engine not ready: ${status}`);
      }

      // In production: load engine, run inference
      return { type: 'llm_result', output: `Processed: ${task.description}` };
    }

    if (task.type === 'reduce') {
      // Collect results from predecessor tasks
      return { type: 'reduce_result', output: `Reduced: ${task.description}` };
    }

    throw new Error(`Unsupported task type for worker: ${task.type}`);
  }

  private completeTask(workflowId: string, taskId: string, _result: unknown): void {
    const workflows = getActiveWorkflows(this.doc);
    const workflow = workflows.get(workflowId);
    if (!workflow) return;

    const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
    const node = dagMap.get(taskId);
    if (node) {
      node.set('status', 'completed');
      node.set('completedAt', Date.now());
    }

    const completedCount = (workflow.get('completedCount') as number) + 1;
    workflow.set('completedCount', completedCount);
    workflow.set('updatedAt', Date.now());

    this.log.info('task completed', { taskId, workflowId });
  }

  private failTask(workflowId: string, taskId: string, error: string): void {
    const workflows = getActiveWorkflows(this.doc);
    const workflow = workflows.get(workflowId);
    if (!workflow) return;

    const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
    const node = dagMap.get(taskId);
    if (node) {
      node.set('status', 'failed');
      node.set('error', error);
    }

    const failedCount = (workflow.get('failedCount') as number) + 1;
    workflow.set('failedCount', failedCount);
    workflow.set('updatedAt', Date.now());

    this.log.warn('task failed', { taskId, workflowId, error });
  }
}
