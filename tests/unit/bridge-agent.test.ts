import * as Y from 'yjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeAgent } from '@agents/bridge/bridge';
import { SentinelAgent } from '@agents/sentinel/sentinel';
import { acquireLock } from '@core/blackboard/lock';
import { createRootDoc, createWorkflow } from '@core/blackboard/root-doc';
import { scrape } from '@agents/bridge/scraper';

vi.mock('@agents/bridge/scraper', () => ({
  scrape: vi.fn(),
}));

const mockedScrape = vi.mocked(scrape);

function seedScrapeTask(doc: Y.Doc, args: Record<string, unknown>, description = 'Scrape https://example.com'):
{ workflow: Y.Map<unknown>; node: Y.Map<unknown> } {
  const workflow = createWorkflow(doc, 'wf-1', 'bridge-1', 'test prompt');
  const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
  const node = new Y.Map<unknown>();

  node.set('id', 'task-1');
  node.set('type', 'scrape');
  node.set('description', description);
  node.set('status', 'pending');
  node.set('claimedBy', null);
  node.set('args', args);
  node.set('result', null);
  node.set('error', null);
  node.set('createdAt', Date.now());
  node.set('startedAt', null);
  node.set('completedAt', null);

  dagMap.set('task-1', node);
  workflow.set('taskCount', 1);

  return { workflow, node };
}

describe('BridgeAgent scrape execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a ready scrape task and stores a structured result', async () => {
    mockedScrape.mockResolvedValue('<html>ok</html>');

    const agent = new BridgeAgent();
    const doc = (agent as unknown as { doc: Y.Doc }).doc;
    const seededDoc = createRootDoc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seededDoc));
    const { workflow, node } = seedScrapeTask(doc, { url: 'https://example.com' });

    await (agent as unknown as { pollForToolCalls: () => Promise<void> }).pollForToolCalls();

    expect(mockedScrape).toHaveBeenCalledWith({
      url: 'https://example.com/',
      selector: undefined,
      timeout: undefined,
    });
    expect(node.get('status')).toBe('completed');
    expect(node.get('error')).toBeNull();
    expect(node.get('completedAt')).not.toBeNull();
    expect(node.get('result')).toEqual({
      type: 'scrape_result',
      url: 'https://example.com/',
      contentType: 'text/html',
      html: '<html>ok</html>',
      bytes: 15,
      selector: null,
    });
    expect(workflow.get('completedCount')).toBe(1);
  });

  it('marks a claimed scrape task running before completion', async () => {
    let resolveScrape: ((value: string) => void) | null = null;
    mockedScrape.mockImplementation(() => new Promise((resolve) => {
      resolveScrape = resolve;
    }));

    const agent = new BridgeAgent();
    const doc = (agent as unknown as { doc: Y.Doc }).doc;
    const seededDoc = createRootDoc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seededDoc));
    const { node } = seedScrapeTask(doc, { url: 'https://example.com' });

    const pollPromise = (agent as unknown as { pollForToolCalls: () => Promise<void> }).pollForToolCalls();
    await Promise.resolve();

    expect(node.get('status')).toBe('running');
    expect(node.get('claimedBy')).toBe((agent as unknown as { nodeId: string }).nodeId);
    expect(node.get('startedAt')).not.toBeNull();

    resolveScrape?.('<html>ok</html>');
    await pollPromise;

    expect(node.get('status')).toBe('completed');
  });

  it('fails malformed scrape tasks explicitly', async () => {
    const agent = new BridgeAgent();
    const doc = (agent as unknown as { doc: Y.Doc }).doc;
    const seededDoc = createRootDoc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seededDoc));
    const { workflow, node } = seedScrapeTask(doc, { prompt: 'Scrape this page' }, 'Scrape target');

    await (agent as unknown as { pollForToolCalls: () => Promise<void> }).pollForToolCalls();

    expect(mockedScrape).not.toHaveBeenCalled();
    expect(node.get('status')).toBe('failed');
    expect(node.get('result')).toBeNull();
    expect(String(node.get('error'))).toContain('missing a valid URL');
    expect(workflow.get('failedCount')).toBe(1);
    expect(workflow.get('state')).toBe('failed');
  });

  it('trims trailing punctuation from fallback prompt URLs before scraping', async () => {
    mockedScrape.mockResolvedValue('<html>ok</html>');

    const agent = new BridgeAgent();
    const doc = (agent as unknown as { doc: Y.Doc }).doc;
    const seededDoc = createRootDoc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seededDoc));
    const { node } = seedScrapeTask(doc, { prompt: 'Scrape https://example.com/products, please' }, 'Scrape target');

    await (agent as unknown as { pollForToolCalls: () => Promise<void> }).pollForToolCalls();

    expect(mockedScrape).toHaveBeenCalledWith({
      url: 'https://example.com/products',
      selector: undefined,
      timeout: undefined,
    });
    expect(node.get('status')).toBe('completed');
  });

  it('scrapes the trimmed Sentinel-generated URL from a prompt workflow', async () => {
    mockedScrape.mockResolvedValue('<html>ok</html>');

    const sentinelDoc = createRootDoc();
    const sentinel = new SentinelAgent(sentinelDoc);
    sentinel.handlePrompt('scrape https://example.com/products, please');

    const bridge = new BridgeAgent();
    const bridgeDoc = (bridge as unknown as { doc: Y.Doc }).doc;
    Y.applyUpdate(bridgeDoc, Y.encodeStateAsUpdate(sentinelDoc));

    await (bridge as unknown as { pollForToolCalls: () => Promise<void> }).pollForToolCalls();

    expect(mockedScrape).toHaveBeenCalledWith({
      url: 'https://example.com/products',
      selector: undefined,
      timeout: undefined,
    });
  });

  it('skips scrape tasks locked by another node', async () => {
    mockedScrape.mockResolvedValue('<html>ok</html>');

    const agent = new BridgeAgent();
    const doc = (agent as unknown as { doc: Y.Doc }).doc;
    const seededDoc = createRootDoc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seededDoc));
    const { node } = seedScrapeTask(doc, { url: 'https://example.com' });

    const lock = acquireLock(doc, 'wf-1', 'task-1', 'other-bridge');
    expect(lock.acquired).toBe(true);

    await (agent as unknown as { pollForToolCalls: () => Promise<void> }).pollForToolCalls();

    expect(mockedScrape).not.toHaveBeenCalled();
    expect(node.get('status')).toBe('pending');
    expect(node.get('result')).toBeNull();
  });
});
