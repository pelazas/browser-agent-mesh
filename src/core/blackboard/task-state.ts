import * as Y from 'yjs';
import { getActiveWorkflows } from './root-doc';

function getWorkflowAndNode(doc: Y.Doc, workflowId: string, taskId: string): {
  workflow: Y.Map<unknown>;
  node: Y.Map<unknown>;
} | null {
  const workflow = getActiveWorkflows(doc).get(workflowId);
  if (!workflow) return null;

  const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
  const node = dagMap.get(taskId);
  if (!node) return null;

  return { workflow, node };
}

function getWorkflow(doc: Y.Doc, workflowId: string): Y.Map<unknown> | null {
  return getActiveWorkflows(doc).get(workflowId) ?? null;
}

export function markTaskRunning(doc: Y.Doc, workflowId: string, taskId: string, nodeId: string): boolean {
  const target = getWorkflowAndNode(doc, workflowId, taskId);
  if (!target) return false;

  doc.transact(() => {
    target.node.set('status', 'running');
    target.node.set('claimedBy', nodeId);
    target.node.set('startedAt', Date.now());
    target.workflow.set('updatedAt', Date.now());
  });

  return true;
}

export function completeTask(doc: Y.Doc, workflowId: string, taskId: string, result: unknown): boolean {
  const target = getWorkflowAndNode(doc, workflowId, taskId);
  if (!target) return false;

  doc.transact(() => {
    target.node.set('status', 'completed');
    target.node.set('result', result);
    target.node.set('error', null);
    target.node.set('completedAt', Date.now());

    const completedCount = (target.workflow.get('completedCount') as number) + 1;
    target.workflow.set('completedCount', completedCount);
    target.workflow.set('updatedAt', Date.now());
  });

  return true;
}

export function failTask(doc: Y.Doc, workflowId: string, taskId: string, error: string): boolean {
  const target = getWorkflowAndNode(doc, workflowId, taskId);
  if (!target) return false;

  doc.transact(() => {
    target.node.set('status', 'failed');
    target.node.set('error', error);
    target.node.set('completedAt', Date.now());

    const failedCount = (target.workflow.get('failedCount') as number) + 1;
    target.workflow.set('failedCount', failedCount);
    target.workflow.set('state', 'failed');
    target.workflow.set('updatedAt', Date.now());
  });

  return true;
}

export function completeWorkflow(doc: Y.Doc, workflowId: string, result: unknown): boolean {
  const workflow = getWorkflow(doc, workflowId);
  if (!workflow) return false;

  let completed = false;

  doc.transact(() => {
    if (workflow.get('state') !== 'active') return;

    const now = Date.now();
    workflow.set('state', 'completed');
    workflow.set('result', result);
    workflow.set('error', null);
    workflow.set('completedAt', now);
    workflow.set('updatedAt', now);
    completed = true;
  });

  return completed;
}

export function failWorkflow(doc: Y.Doc, workflowId: string, error: string): boolean {
  const workflow = getWorkflow(doc, workflowId);
  if (!workflow) return false;

  let failed = false;

  doc.transact(() => {
    if (workflow.get('state') !== 'active') return;

    const now = Date.now();
    workflow.set('state', 'failed');
    workflow.set('error', error);
    workflow.set('completedAt', now);
    workflow.set('updatedAt', now);
    failed = true;
  });

  return failed;
}
