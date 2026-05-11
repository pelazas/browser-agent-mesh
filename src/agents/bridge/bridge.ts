import * as Y from 'yjs';
import { BaseAgent } from '@agents/base';
import { scrape } from '@agents/bridge/scraper';
import { acquireLock, releaseLock } from '@core/blackboard/lock';
import { getActiveWorkflows } from '@core/blackboard/root-doc';
import {
  completeTask as completeWorkflowTask,
  failTask as failWorkflowTask,
  markTaskRunning as markWorkflowTaskRunning,
} from '@core/blackboard/task-state';
import type { Edge, TaskNode } from '@core/blackboard/schema';
import { DAG } from '@core/graph/dag';
import { createLogger } from '@utils/logging';

const log = createLogger('bridge-agent');

interface ScrapeTaskInput {
  url: string;
  selector?: string;
  timeout?: number;
}

export class BridgeAgent extends BaseAgent {
  constructor(tabId?: string) {
    super({ role: 'bridge', tabId });
  }

  protected async run(): Promise<void> {
    log.info('bridge running');

    while (this.running) {
      await this.pollForToolCalls();
      await this.sleep(2000);
    }
  }

  private async pollForToolCalls(): Promise<void> {
    const workflows = getActiveWorkflows(this.doc);
    if (!workflows) return;

    for (const [workflowId] of workflows) {
      const workflow = workflows.get(workflowId);
      if (!workflow || workflow.get('state') !== 'active') continue;

      const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
      if (!dagMap) continue;

      const edges = workflow.get('edges') as Y.Array<unknown>;
      const nodes: TaskNode[] = [];

      for (const [taskId, nodeEntry] of dagMap) {
        nodes.push({
          id: taskId,
          ...(nodeEntry.toJSON() as Omit<TaskNode, 'id'>),
        });
      }

      const dag = DAG.fromJSON({
        nodes,
        edges: (edges?.toJSON() as Edge[] | undefined) ?? [],
      });

      for (const task of dag.getReadyTasks()) {
        if (task.type !== 'scrape') continue;

        const lock = acquireLock(this.doc, workflowId, task.id, this.nodeId);
        if (!lock.acquired) {
          this.log.info('scrape task locked by another node', {
            workflowId,
            taskId: task.id,
            owner: lock.conflictOwner ?? 'unknown',
          });
          continue;
        }

        this.log.info('scrape task claimed', { workflowId, taskId: task.id });

        try {
          this.markTaskRunning(workflowId, task.id);
          const result = await this.executeScrapeTask(task);
          this.completeTask(workflowId, task.id, result);
        } catch (err) {
          this.failTask(workflowId, task.id, err instanceof Error ? err.message : String(err));
        } finally {
          releaseLock(this.doc, workflowId, task.id, this.nodeId);
        }
      }
    }
  }

  private async executeScrapeTask(task: TaskNode): Promise<unknown> {
    const input = this.parseScrapeTaskInput(task);

    this.log.info('executing scrape task', {
      taskId: task.id,
      url: input.url,
      selector: input.selector ?? null,
    });

    const html = await scrape({
      url: input.url,
      selector: input.selector,
      timeout: input.timeout,
    });

    return {
      type: 'scrape_result',
      url: input.url,
      contentType: 'text/html',
      html,
      bytes: html.length,
      selector: input.selector ?? null,
    };
  }

  private parseScrapeTaskInput(task: TaskNode): ScrapeTaskInput {
    const args = task.args as Record<string, unknown>;
    const url = this.parseUrlCandidate(args.url)
      ?? this.extractUrlFromText(args.prompt)
      ?? this.extractUrlFromText(task.description);

    if (!url) {
      throw new Error(`Scrape task ${task.id} is missing a valid URL`);
    }

    const selector = typeof args.selector === 'string' && args.selector.trim().length > 0
      ? args.selector.trim()
      : undefined;
    const timeout = typeof args.timeout === 'number' && Number.isFinite(args.timeout) && args.timeout > 0
      ? args.timeout
      : undefined;

    return { url, selector, timeout };
  }

  private parseUrlCandidate(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const candidate = value.trim();
    if (!candidate) return null;

    try {
      return new URL(candidate).toString();
    } catch {
      return null;
    }
  }

  private extractUrlFromText(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const match = value.match(/https?:\/\/[^\s)]+/i);
    if (!match) return null;

    const candidate = match[0].replace(/[.,!?;:'"\]\}>]+$/u, '');
    return this.parseUrlCandidate(candidate);
  }

  private markTaskRunning(workflowId: string, taskId: string): void {
    markWorkflowTaskRunning(this.doc, workflowId, taskId, this.nodeId);
    this.log.info('scrape task running', { workflowId, taskId });
  }

  private completeTask(workflowId: string, taskId: string, result: unknown): void {
    completeWorkflowTask(this.doc, workflowId, taskId, result);
    this.log.info('scrape task completed', { workflowId, taskId });
  }

  private failTask(workflowId: string, taskId: string, error: string): void {
    failWorkflowTask(this.doc, workflowId, taskId, error);
    this.log.warn('scrape task failed', { workflowId, taskId, error });
  }
}
