import * as Y from 'yjs';
import { BaseAgent } from '../base';
import { getActiveWorkflows } from '@core/blackboard/root-doc';
import { acquireLock, releaseLock } from '@core/blackboard/lock';
import {
  completeTask as completeWorkflowTask,
  failTask as failWorkflowTask,
  markTaskRunning as markWorkflowTaskRunning,
  updateWorkflowPreviewResult,
} from '@core/blackboard/task-state';
import type { Edge, GPUProfile, TaskNode } from '@core/blackboard/schema';
import { chatStream, getCurrentModel, getEngineStatus, loadModel, selectBestModel } from '@webllm/index';
import { DAG } from '@core/graph/dag';

const STREAM_FLUSH_INTERVAL_MS = 150;
const STREAM_FLUSH_MIN_CHARS = 24;

interface NodeConfig {
  gpuProfile: GPUProfile | null;
}

export class NodeWorkerAgent extends BaseAgent {
  private gpuProfile: GPUProfile | null;
  private modelId: string | null = null;

  constructor(config: NodeConfig) {
    super({ role: 'worker' });
    this.gpuProfile = config.gpuProfile;
  }

  protected async run(): Promise<void> {
    this.log.info('node worker running');
    await this.ensureModelReady();

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
    if (!workflows) return;

    const hasWorkflows = workflows.size > 0;
    if (hasWorkflows) {
      this.log.info('poll cycle', { workflowCount: workflows.size });
    }

    for (const [workflowId] of workflows) {
      const workflow = workflows.get(workflowId);
      if (!workflow) continue;

      const state = workflow.get('state');
      if (state !== 'active') continue;

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

      if (nodesArray.length === 0) continue;

      const dag = DAG.fromJSON({
        nodes: nodesArray,
        edges: edges.toJSON() as unknown as Edge[],
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
          this.markTaskRunning(workflowId, task.id);
          const result = await this.executeTask(task, workflowId);
          this.completeTask(workflowId, task.id, result);
        } catch (err) {
          this.failTask(workflowId, task.id, String(err));
        } finally {
          releaseLock(this.doc, workflowId, task.id, this.nodeId);
        }
      }
    }
  }

  private async executeTask(task: TaskNode, workflowId?: string): Promise<unknown> {
    this.log.info('executing task', { taskId: task.id, type: task.type });

    if (task.type === 'llm_inference') {
      await this.ensureModelReady();
      const status = getEngineStatus();
      if (status !== 'ready') {
        throw new Error(`Engine not ready: ${status}`);
      }

      const prompt = typeof task.args.prompt === 'string' ? task.args.prompt : task.description;
      const modelId = getCurrentModel() ?? this.modelId;

      if (workflowId) {
        this.updateWorkflowPreview(workflowId, {
          type: 'llm_result_partial',
          prompt,
          output: '',
          modelId,
          tokensGenerated: 0,
          tokensPerSec: 0,
        });
      }

      let lastFlushedText = '';
      let lastFlushAt = 0;

      const flushPreview = (text: string, tokensGenerated: number, tokensPerSec: number, force: boolean): void => {
        if (!workflowId) return;

        const now = Date.now();
        const charDelta = text.length - lastFlushedText.length;
        if (!force && charDelta < STREAM_FLUSH_MIN_CHARS && now - lastFlushAt < STREAM_FLUSH_INTERVAL_MS) {
          return;
        }

        lastFlushedText = text;
        lastFlushAt = now;
        this.updateWorkflowPreview(workflowId, {
          type: 'llm_result_partial',
          prompt,
          output: text,
          modelId,
          tokensGenerated,
          tokensPerSec,
        });
      };

      const response = await chatStream(
        [{ role: 'user', content: prompt }],
        undefined,
        (progress) => {
          flushPreview(progress.text, progress.tokensGenerated, progress.tokensPerSec, false);
        },
      );

      flushPreview(response.message.content, response.tokensGenerated, response.tokensPerSec, true);

      return {
        type: 'llm_result',
        prompt,
        output: response.message.content,
        modelId,
        tokensGenerated: response.tokensGenerated,
        tokensPerSec: response.tokensPerSec,
      };
    }

    if (task.type === 'reduce') {
      // Collect results from predecessor tasks
      return { type: 'reduce_result', output: `Reduced: ${task.description}` };
    }

    throw new Error(`Unsupported task type for worker: ${task.type}`);
  }

  private async ensureModelReady(): Promise<void> {
    if (!this.gpuProfile) {
      throw new Error('No GPU profile available for Node Worker');
    }

    const model = selectBestModel(this.gpuProfile.vramEstimateMB, 'medium');
    if (!model) {
      throw new Error('No compatible WebLLM model found for this worker');
    }

    this.modelId = model.id;

    if (getEngineStatus() === 'ready' && getCurrentModel() === model.id) {
      return;
    }

    this.log.info('loading selected model', { model: model.id });
    await loadModel(model.id);
    this.log.info('model ready', { model: model.id });
  }

  private markTaskRunning(workflowId: string, taskId: string): void {
    markWorkflowTaskRunning(this.doc, workflowId, taskId, this.nodeId);
  }

  private completeTask(workflowId: string, taskId: string, result: unknown): void {
    completeWorkflowTask(this.doc, workflowId, taskId, result);

    this.log.info('task completed', { taskId, workflowId });
  }

  private failTask(workflowId: string, taskId: string, error: string): void {
    failWorkflowTask(this.doc, workflowId, taskId, error);

    this.log.warn('task failed', { taskId, workflowId, error });
  }

  private updateWorkflowPreview(workflowId: string, result: unknown): void {
    updateWorkflowPreviewResult(this.doc, workflowId, result);
  }
}
