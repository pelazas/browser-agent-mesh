import { describe, expect, it } from 'vitest';
import { SentinelAgent } from '@agents/sentinel/sentinel';
import {
  createPromptRequest,
  createRootDoc,
  getActiveWorkflows,
  getPromptRequests,
} from '@core/blackboard/root-doc';
import * as Y from 'yjs';

describe('SentinelAgent prompt requests', () => {
  it('processes pending prompt requests into workflows', async () => {
    const doc = createRootDoc();
    const agent = new SentinelAgent(doc);

    const request = createPromptRequest(doc, 'summarize the quarterly update', 'ui-main-thread');
    const requestId = request.get('id') as string;

    const processedCount = await agent.processPendingPromptRequests();

    expect(processedCount).toBe(1);

    const requests = getPromptRequests(doc);
    const storedRequest = requests.get(requestId);
    expect(storedRequest?.get('status')).toBe('processed');

    const workflowId = storedRequest?.get('workflowId');
    expect(typeof workflowId).toBe('string');

    const workflows = getActiveWorkflows(doc);
    expect(workflows.size).toBe(1);

    const workflow = workflows.get(workflowId as string);
    expect(workflow?.get('prompt')).toBe('summarize the quarterly update');
    expect(workflow?.get('taskCount')).toBeGreaterThan(0);
  });

  it('preserves scrape URL input in scrape task args', () => {
    const doc = createRootDoc();
    const agent = new SentinelAgent(doc);

    const workflowId = agent.handlePrompt('scrape https://example.com/products selector ".price"');
    const workflow = getActiveWorkflows(doc).get(workflowId);
    const dagMap = workflow?.get('dag') as Y.Map<Y.Map<unknown>> | undefined;

    expect(dagMap).toBeDefined();

    const scrapeNode = dagMap
      ? Array.from(dagMap.values()).find((node) => node.get('type') === 'scrape')
      : undefined;

    expect(scrapeNode).toBeDefined();
    expect(scrapeNode?.get('args')).toEqual({
      prompt: 'scrape https://example.com/products selector ".price"',
      url: 'https://example.com/products',
      selector: '.price',
    });
  });

  it('trims trailing punctuation from scrape URLs stored in task args', () => {
    const doc = createRootDoc();
    const agent = new SentinelAgent(doc);

    const workflowId = agent.handlePrompt('scrape https://example.com/products, please');
    const workflow = getActiveWorkflows(doc).get(workflowId);
    const dagMap = workflow?.get('dag') as Y.Map<Y.Map<unknown>> | undefined;

    expect(dagMap).toBeDefined();

    const scrapeNode = dagMap
      ? Array.from(dagMap.values()).find((node) => node.get('type') === 'scrape')
      : undefined;

    expect(scrapeNode).toBeDefined();
    expect(scrapeNode?.get('args')).toEqual({
      prompt: 'scrape https://example.com/products, please',
      url: 'https://example.com/products',
    });
  });
});
