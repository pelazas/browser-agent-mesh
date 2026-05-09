import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { SynthesizerAgent } from '@agents/synthesizer/synthesizer';
import { createRootDoc, createWorkflow } from '@core/blackboard/root-doc';

function createTaskNode(taskId: string, status: string, result: unknown): Y.Map<unknown> {
  const node = new Y.Map<unknown>();
  node.set('id', taskId);
  node.set('type', 'llm_inference');
  node.set('description', `task ${taskId}`);
  node.set('status', status);
  node.set('claimedBy', null);
  node.set('args', {});
  node.set('result', result);
  node.set('error', null);
  node.set('createdAt', Date.now());
  node.set('startedAt', Date.now());
  node.set('completedAt', status === 'completed' ? Date.now() : null);
  return node;
}

function seedWorkflow(
  doc: Y.Doc,
  workflowId: string,
  tasks: Array<{ id: string; status: string; result: unknown }>,
): Y.Map<unknown> {
  const workflow = createWorkflow(doc, workflowId, 'worker-1', 'test prompt');
  const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;

  for (const task of tasks) {
    dagMap.set(task.id, createTaskNode(task.id, task.status, task.result));
  }

  workflow.set('taskCount', tasks.length);
  workflow.set('completedCount', tasks.filter((task) => task.status === 'completed').length);
  workflow.set('failedCount', tasks.filter((task) => task.status === 'failed').length);

  return workflow;
}

describe('SynthesizerAgent', () => {
  it('persists a structured workflow result when all tasks are completed', async () => {
    const doc = createRootDoc();
    const workflow = seedWorkflow(doc, 'wf-1', [
      { id: 'task-1', status: 'completed', result: { output: 'Primary answer', confidence: 0.9 } },
      { id: 'task-2', status: 'completed', result: { output: 'Duplicate answer', confidence: 0.9 } },
      { id: 'task-3', status: 'completed', result: { output: 'Primary answer', confidence: 0.9 } },
    ]);
    const edges = workflow.get('edges') as Y.Array<unknown>;
    edges.push([{ id: 'edge-1', source: 'task-1', target: 'task-2', type: 'sequential' }]);
    edges.push([{ id: 'edge-2', source: 'task-2', target: 'task-3', type: 'sequential' }]);

    const agent = new SynthesizerAgent(doc);

    await (
      agent as unknown as { checkForReadyWorkflows: () => Promise<void> }
    ).checkForReadyWorkflows();

    expect(workflow.get('state')).toBe('completed');
    expect(workflow.get('completedAt')).not.toBeNull();
    expect(workflow.get('error')).toBeNull();

    const result = workflow.get('result') as {
      type: string;
      content: string;
      fragments: Array<{ taskId: string; confidence: number }>;
      metadata: { totalCompletedTasks: number; deduplicatedCount: number; fragmentCount: number };
    };

    expect(result.type).toBe('synthesis_result');
    expect(result.content).toContain('[Task task-1]');
    expect(result.content).toContain('[Task task-2]');
    expect(result.content).not.toContain('[Task task-3]');
    expect(result.fragments.map((fragment) => fragment.taskId)).toEqual(['task-1', 'task-2']);
    expect(result.metadata).toMatchObject({
      totalCompletedTasks: 3,
      deduplicatedCount: 2,
      fragmentCount: 2,
    });
  });

  it('does not synthesize workflows that are not fully completed', async () => {
    const doc = createRootDoc();
    const workflow = seedWorkflow(doc, 'wf-2', [
      { id: 'task-1', status: 'completed', result: { output: 'done' } },
      { id: 'task-2', status: 'pending', result: null },
    ]);
    const agent = new SynthesizerAgent(doc);

    await (
      agent as unknown as { checkForReadyWorkflows: () => Promise<void> }
    ).checkForReadyWorkflows();

    expect(workflow.get('state')).toBe('active');
    expect(workflow.get('result')).toBeNull();
    expect(workflow.get('completedAt')).toBeNull();
  });

  it('fails workflows that are ready but have no usable synthesis results', async () => {
    const doc = createRootDoc();
    const workflow = seedWorkflow(doc, 'wf-3', [
      { id: 'task-1', status: 'completed', result: null },
      { id: 'task-2', status: 'completed', result: null },
    ]);
    const agent = new SynthesizerAgent(doc);

    await (
      agent as unknown as { checkForReadyWorkflows: () => Promise<void> }
    ).checkForReadyWorkflows();

    expect(workflow.get('state')).toBe('failed');
    expect(workflow.get('result')).toBeNull();
    expect(workflow.get('error')).toBe('Workflow is ready for synthesis but no completed task results were found');
  });
});
