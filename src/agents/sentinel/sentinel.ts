import { BaseAgent } from '../base';
import { DAG } from '@core/graph/dag';
import { createWorkflow, getActiveWorkflows } from '@core/blackboard/root-doc';
import { generateId } from '@utils/id';
import type { TaskNode } from '@core/blackboard/schema';

interface ParsedTask {
  description: string;
  type: TaskNode['type'];
  dependencies: number[];
}

export class SentinelAgent extends BaseAgent {
  constructor() {
    super({ role: 'sentinel' });
  }

  protected async run(): Promise<void> {
    this.log.info('sentinel running');

    while (this.running) {
      // The sentinel subscribes to prompt inputs from the UI via blackboard observation
      // This is triggered externally. In the loop, we poll for new prompts.
      await this.sleep(2000);
    }
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

  private parsePromptToDAG(prompt: string): DAG {
    const dag = new DAG();
    const tasks = this.decomposePrompt(prompt);

    // Build nodes
    const nodeIds: string[] = [];
    for (const task of tasks) {
      const id = dag.addNode({
        type: task.type,
        description: task.description,
        args: { prompt: task.description },
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
      tasks.push({
        description: 'Scrape target URLs for content',
        type: 'scrape',
        dependencies: [],
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
}
