import { BaseAgent } from '../base';
import { DAG } from '@core/graph/dag';
import { createWorkflow, getPromptRequests } from '@core/blackboard/root-doc';
import { generateId } from '@utils/id';
import type { PromptRequestStatus, TaskNode } from '@core/blackboard/schema';
import * as Y from 'yjs';

interface ParsedTask {
  description: string;
  type: TaskNode['type'];
  dependencies: number[];
  args?: Record<string, unknown>;
}

export class SentinelAgent extends BaseAgent {
  constructor(doc?: Y.Doc) {
    super({ role: 'sentinel', doc });
  }

  protected async run(): Promise<void> {
    this.log.info('sentinel running');

    while (this.running) {
      await this.processPendingPromptRequests();
      await this.sleep(2000);
    }
  }

  async processPendingPromptRequests(): Promise<number> {
    const requests = getPromptRequests(this.doc);
    let processedCount = 0;

    for (const [, request] of requests) {
      if (!this.claimPromptRequest(request)) continue;

      const prompt = request.get('prompt');
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        this.finishPromptRequest(request, 'failed', null, 'Prompt request is missing prompt text');
        processedCount++;
        continue;
      }

      try {
        const workflowId = this.handlePrompt(prompt);
        this.finishPromptRequest(request, 'processed', workflowId, null);
      } catch (err) {
        this.finishPromptRequest(request, 'failed', null, String(err));
      }

      processedCount++;
    }

    return processedCount;
  }

  handlePrompt(prompt: string): string {
    const workflowId = generateId();
    this.log.info('processing prompt', { workflowId });

    const dag = this.parsePromptToDAG(prompt);

    const workflow = createWorkflow(this.doc, workflowId, this.nodeId, prompt);

    // Write DAG nodes to blackboard
    const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
    const edges = workflow.get('edges') as Y.Array<unknown>;

    const graph = dag.toJSON();
    let taskCount = 0;

    for (const node of graph.nodes) {
      const nodeEntry = new Y.Map<unknown>();
      nodeEntry.set('id', node.id);
      nodeEntry.set('type', node.type);
      nodeEntry.set('description', node.description);
      nodeEntry.set('status', 'pending');
      nodeEntry.set('claimedBy', null);
      nodeEntry.set('args', node.args);
      nodeEntry.set('result', null);
      nodeEntry.set('error', null);
      nodeEntry.set('createdAt', node.createdAt);
      nodeEntry.set('startedAt', null);
      nodeEntry.set('completedAt', null);
      dagMap.set(node.id, nodeEntry);
      taskCount++;
    }

    for (const edge of graph.edges) {
      edges.push([edge]);
    }

    workflow.set('taskCount', taskCount);
    workflow.set('updatedAt', Date.now());

    this.log.info('dag created', { workflowId, taskCount, edgeCount: graph.edges.length });

    return workflowId;
  }

  private claimPromptRequest(request: Y.Map<unknown>): boolean {
    let claimed = false;

    this.doc.transact(() => {
      if (request.get('status') !== 'pending') return;

      request.set('status', 'claimed');
      request.set('claimedBy', this.nodeId);
      request.set('updatedAt', Date.now());
      claimed = true;
    });

    return claimed;
  }

  private finishPromptRequest(
    request: Y.Map<unknown>,
    status: Extract<PromptRequestStatus, 'processed' | 'failed'>,
    workflowId: string | null,
    error: string | null,
  ): void {
    this.doc.transact(() => {
      request.set('status', status);
      request.set('workflowId', workflowId);
      request.set('error', error);
      request.set('updatedAt', Date.now());
    });
  }

  private parsePromptToDAG(prompt: string): DAG {
    const dag = new DAG();
    const tasks = this.decomposePrompt(prompt);

    // Build nodes
    const nodeIds: string[] = [];
    for (const task of tasks) {
      const id = dag.addNode({
        type: task.type,
        description: task.description,
        args: task.args ?? { prompt: task.description },
      });
      nodeIds.push(id);
    }

    // Build edges
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      for (const depIdx of task.dependencies) {
        if (depIdx < nodeIds.length && depIdx < i) {
          dag.addEdge(nodeIds[depIdx], nodeIds[i], 'sequential');
        }
      }
    }

    return dag;
  }

  private decomposePrompt(prompt: string): ParsedTask[] {
    const lower = prompt.toLowerCase();

    // Simple heuristic decomposition
    // In production, the Sentinel would use an LLM for this step
    const tasks: ParsedTask[] = [];

    if (lower.includes('research') || lower.includes('find') || lower.includes('search')) {
      tasks.push({
        description: 'Search and retrieve information about: ' + prompt,
        type: 'retrieve',
        dependencies: [],
      });

      tasks.push({
        description: 'Evaluate relevance of retrieved documents',
        type: 'condition',
        dependencies: [0],
      });

      tasks.push({
        description: 'Synthesize findings into a summary',
        type: 'reduce',
        dependencies: [1],
      });
    } else if (lower.includes('scrape') || lower.includes('extract')) {
      const scrapeArgs: Record<string, unknown> = { prompt };
      const url = this.extractUrlFromText(prompt);
      if (url) {
        scrapeArgs.url = url;
      }

      const selector = this.extractSelectorFromText(prompt);
      if (selector) {
        scrapeArgs.selector = selector;
      }

      tasks.push({
        description: 'Scrape target URLs for content',
        type: 'scrape',
        dependencies: [],
        args: scrapeArgs,
      });

      tasks.push({
        description: 'Process and structure extracted data',
        type: 'reduce',
        dependencies: [0],
      });
    } else if (lower.includes('summarize') || lower.includes('summarise')) {
      tasks.push({
        description: 'Read and chunk input text',
        type: 'retrieve',
        dependencies: [],
      });

      tasks.push({
        description: 'Generate summary from chunks',
        type: 'llm_inference',
        dependencies: [0],
      });
    } else {
      // Default: single LLM inference task
      tasks.push({
        description: prompt,
        type: 'llm_inference',
        dependencies: [],
      });
    }

    return tasks;
  }

  private extractUrlFromText(value: string): string | null {
    const match = value.match(/https?:\/\/[^\s)]+/i);
    if (!match) return null;

    const candidate = match[0].replace(/[.,!?;:'"\]\}>]+$/u, '');

    try {
      return new URL(candidate).toString();
    } catch {
      return null;
    }
  }

  private extractSelectorFromText(value: string): string | null {
    const match = value.match(/\bselector\b\s*(?::|=)?\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/i);
    const selector = match?.[1] ?? match?.[2] ?? match?.[3];
    return selector?.trim() || null;
  }
}
