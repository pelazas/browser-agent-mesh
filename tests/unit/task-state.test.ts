import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { createRootDoc, createWorkflow } from '@core/blackboard/root-doc';
import { completeTask, failTask, markTaskRunning } from '@core/blackboard/task-state';

function seedTask(doc: Y.Doc, workflowId: string, taskId: string): { workflow: Y.Map<unknown>; node: Y.Map<unknown> } {
  const workflow = createWorkflow(doc, workflowId, 'worker-1', 'test prompt');
  const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
  const node = new Y.Map<unknown>();
  node.set('id', taskId);
  node.set('type', 'llm_inference');
  node.set('description', 'test');
  node.set('status', 'pending');
  node.set('claimedBy', null);
  node.set('args', {});
  node.set('result', null);
  node.set('error', null);
  node.set('createdAt', Date.now());
  node.set('startedAt', null);
  node.set('completedAt', null);
  dagMap.set(taskId, node);
  return { workflow, node };
}

describe('task-state helpers', () => {
  it('marks a task running with claimer and startedAt', () => {
    const doc = createRootDoc();
    const { node } = seedTask(doc, 'wf-1', 'task-1');

    expect(markTaskRunning(doc, 'wf-1', 'task-1', 'worker-1')).toBe(true);
    expect(node.get('status')).toBe('running');
    expect(node.get('claimedBy')).toBe('worker-1');
    expect(node.get('startedAt')).not.toBeNull();
  });

  it('persists result when completing a task', () => {
    const doc = createRootDoc();
    const { node } = seedTask(doc, 'wf-1', 'task-1');
    const result = { output: 'hello' };

    expect(completeTask(doc, 'wf-1', 'task-1', result)).toBe(true);
    expect(node.get('status')).toBe('completed');
    expect(node.get('result')).toEqual(result);
    expect(node.get('error')).toBeNull();
    expect(node.get('completedAt')).not.toBeNull();
  });

  it('marks workflow failed when a task fails', () => {
    const doc = createRootDoc();
    const { workflow } = seedTask(doc, 'wf-2', 'task-1');

    expect(failTask(doc, 'wf-2', 'task-1', 'boom')).toBe(true);
    expect(workflow.get('state')).toBe('failed');
    expect(workflow.get('failedCount')).toBe(1);
  });
});
