import * as Y from 'yjs';
import { generateId } from '@/utils/id';

export const ROOT_DOC_KEY = 'bam-blackboard';

export function createRootDoc(): Y.Doc {
  const doc = new Y.Doc();

  const rootMap = doc.getMap(ROOT_DOC_KEY);
  if (!rootMap.has('activeWorkflows')) {
    rootMap.set('activeWorkflows', new Y.Map());
  }
  if (!rootMap.has('nodes')) {
    rootMap.set('nodes', new Y.Map());
  }
  if (!rootMap.has('promptRequests')) {
    rootMap.set('promptRequests', new Y.Map());
  }
  if (!rootMap.has('tools')) {
    rootMap.set('tools', new Y.Map());
  }
  if (!rootMap.has('telemetry')) {
    rootMap.set('telemetry', new Y.Map());
  }
  if (!rootMap.has('locks')) {
    rootMap.set('locks', new Y.Map());
  }

  return doc;
}

export function getRootMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(ROOT_DOC_KEY);
}

export function getActiveWorkflows(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return getRootMap(doc).get('activeWorkflows') as Y.Map<Y.Map<unknown>>;
}

export function getNodes(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return getRootMap(doc).get('nodes') as Y.Map<Y.Map<unknown>>;
}

export function getPromptRequests(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return getRootMap(doc).get('promptRequests') as Y.Map<Y.Map<unknown>>;
}

export function getTools(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return getRootMap(doc).get('tools') as Y.Map<Y.Map<unknown>>;
}

export function getTelemetry(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return getRootMap(doc).get('telemetry') as Y.Map<Y.Map<unknown>>;
}

export function getLocks(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return getRootMap(doc).get('locks') as Y.Map<Y.Map<unknown>>;
}

export function getWorkflowDoc(doc: Y.Doc, workflowId: string): Y.Map<unknown> | undefined {
  return getActiveWorkflows(doc).get(workflowId);
}

export function createWorkflow(doc: Y.Doc, workflowId: string, ownerNodeId: string, prompt: string): Y.Map<unknown> {
  const workflows = getActiveWorkflows(doc);

  const workflow = new Y.Map<unknown>();
  workflow.set('id', workflowId);
  workflow.set('prompt', prompt);
  workflow.set('state', 'active');
  workflow.set('createdAt', Date.now());
  workflow.set('updatedAt', Date.now());
  workflow.set('completedAt', null);
  workflow.set('ownerNodeId', ownerNodeId);
  workflow.set('taskCount', 0);
  workflow.set('completedCount', 0);
  workflow.set('failedCount', 0);
  workflow.set('result', null);
  workflow.set('error', null);
  workflow.set('dag', new Y.Map<Y.Map<unknown>>());
  workflow.set('edges', new Y.Array<unknown>());
  workflow.set('locks', new Y.Map<Y.Map<unknown>>());

  workflows.set(workflowId, workflow);
  return workflow;
}

export function createPromptRequest(doc: Y.Doc, prompt: string, requestedByNodeId: string): Y.Map<unknown> {
  const requests = getPromptRequests(doc);
  const requestId = generateId();
  const now = Date.now();

  const request = new Y.Map<unknown>();
  request.set('id', requestId);
  request.set('prompt', prompt);
  request.set('status', 'pending');
  request.set('createdAt', now);
  request.set('updatedAt', now);
  request.set('requestedByNodeId', requestedByNodeId);
  request.set('claimedBy', null);
  request.set('workflowId', null);
  request.set('error', null);

  requests.set(requestId, request);
  return request;
}

export function registerNode(
  doc: Y.Doc,
  nodeId: string,
  role: string,
  gpu: unknown | null,
): Y.Map<unknown> {
  const nodes = getNodes(doc);

  const node = new Y.Map<unknown>();
  node.set('id', nodeId);
  node.set('role', role);
  node.set('gpu', gpu);
  node.set('status', 'idle');
  node.set('joinedAt', Date.now());
  node.set('lastHeartbeat', Date.now());
  node.set('tasks', new Y.Array<string>());

  nodes.set(nodeId, node);
  return node;
}
