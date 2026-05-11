import * as Y from 'yjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRootDoc, createWorkflow, registerNode, getNodes } from '@core/blackboard/root-doc';
import { NodeWorkerAgent } from '@agents/worker/worker';
import type { Edge, GPUProfile, TaskNode } from '@core/blackboard/schema';
import {
  chatStream,
  getCurrentModel,
  getEngineStatus,
  loadModel,
  selectBestModel,
} from '@webllm/index';

vi.mock('@webllm/index', () => ({
  loadModel: vi.fn(),
  chatStream: vi.fn(),
  getEngineStatus: vi.fn(),
  getCurrentModel: vi.fn(),
  selectBestModel: vi.fn(),
}));

const mockedLoadModel = vi.mocked(loadModel);
const mockedChatStream = vi.mocked(chatStream);
const mockedGetEngineStatus = vi.mocked(getEngineStatus);
const mockedGetCurrentModel = vi.mocked(getCurrentModel);
const mockedSelectBestModel = vi.mocked(selectBestModel);

const gpuProfile: GPUProfile = {
  maxBufferSize: 1,
  maxStorageBufferBindingSize: 1,
  maxComputeWorkgroupStorageSize: 1,
  vramEstimateMB: 4096,
  benchmarkScore: 100,
  compatibleModels: ['Llama-3.2-3B-Instruct-q4f32_1-MLC'],
};

const selectedModel = {
  id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
  name: 'Llama 3.2 3B',
  sizeMB: 1800,
  minVramMB: 2560,
  description: 'Balanced performance',
};

function createYMap(fields: Record<string, unknown>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();

  for (const [key, value] of Object.entries(fields)) {
    map.set(key, value);
  }

  return map;
}

function createTaskEntry(task: TaskNode): Y.Map<unknown> {
  return createYMap(task as unknown as Record<string, unknown>);
}

function createTask(overrides: Partial<TaskNode> & Pick<TaskNode, 'id' | 'type' | 'description'>): TaskNode {
  return {
    id: overrides.id,
    type: overrides.type,
    description: overrides.description,
    status: overrides.status ?? 'pending',
    claimedBy: overrides.claimedBy ?? null,
    args: overrides.args ?? {},
    result: overrides.result ?? null,
    error: overrides.error ?? null,
    createdAt: overrides.createdAt ?? Date.now(),
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
  };
}

function seedAgentDoc(agent: NodeWorkerAgent): Y.Doc {
  const doc = (agent as unknown as { doc: Y.Doc }).doc;
  const seededDoc = createRootDoc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(seededDoc));
  return doc;
}

function seedWorkflow(
  doc: Y.Doc,
  workflowId: string,
  tasks: TaskNode[],
  edgesInput: Edge[] = [],
): Y.Map<unknown> {
  const workflow = createWorkflow(doc, workflowId, 'worker-1', 'test prompt');
  const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
  const edges = workflow.get('edges') as Y.Array<unknown>;

  doc.transact(() => {
    for (const task of tasks) {
      dagMap.set(task.id, createTaskEntry(task));
    }

    for (const edge of edgesInput) {
      edges.push([edge]);
    }

    workflow.set('taskCount', tasks.length);
    workflow.set('completedCount', tasks.filter((task) => task.status === 'completed').length);
    workflow.set('failedCount', tasks.filter((task) => task.status === 'failed').length);
  });

  return workflow;
}

function seedReduceWorkflow(doc: Y.Doc, scrapeContent: string): TaskNode {
  const now = Date.now();

  const scrapeTask = createTask({
    id: 'scrape-1',
    type: 'scrape',
    description: 'Scrape example source',
    status: 'completed',
    claimedBy: 'bridge-1',
    args: { url: 'https://example.com/source' },
    result: {
      type: 'scrape_result',
      url: 'https://example.com/source',
      contentType: 'text/plain',
      format: 'text',
      content: scrapeContent,
      bytes: scrapeContent.length,
      selector: null,
    },
    createdAt: now,
    startedAt: now,
    completedAt: now,
  });

  const reduceTask = createTask({
    id: 'reduce-1',
    type: 'reduce',
    description: 'Summarize the scraped source',
    args: { prompt: 'Summarize the scraped source' },
    createdAt: now,
  });

  seedWorkflow(doc, 'wf-reduce', [scrapeTask, reduceTask], [
    { id: 'edge-scrape-reduce', source: scrapeTask.id, target: reduceTask.id, type: 'sequential' },
  ]);

  return reduceTask;
}

function expectNoReaderNoise(value: string): void {
  expect(value).not.toContain('URL Source:');
  expect(value).not.toContain('Published Time:');
  expect(value).not.toContain('Markdown Content:');
}

function expectReduceResult(
  result: Record<string, unknown>,
  expectedSections: Array<{ heading: string; content: string }>,
  expectedSummarySnippet?: string,
): void {
  expect(result.type).toBe('reduce_result');
  expect(result.title).toBe('Example Article');
  expect(result.summary).toBeTypeOf('string');

  const summary = result.summary as string;
  expect(summary.trim().length).toBeGreaterThan(0);
  expect(summary).toBe(summary.trim());

  if (expectedSummarySnippet) {
    expect(summary).toContain(expectedSummarySnippet);
  }

  expectNoReaderNoise(result.title as string);
  expectNoReaderNoise(summary);
  expect(result.sections).toEqual(
    expectedSections.map((section) =>
      expect.objectContaining({
        heading: section.heading,
        content: expect.stringContaining(section.content),
      }),
    ),
  );

  for (const section of result.sections as Array<{ heading: string; content: string }>) {
    expectNoReaderNoise(section.heading);
    expectNoReaderNoise(section.content);
  }
}

describe('NodeWorkerAgent WebLLM integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadModel.mockResolvedValue(undefined);
  });

  it('loads one compatible model before polling starts', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('unloaded');
    mockedGetCurrentModel.mockReturnValue(null);

    const agent = new NodeWorkerAgent({ gpuProfile });

    await (agent as unknown as { ensureModelReady: () => Promise<void> }).ensureModelReady();

    expect(mockedSelectBestModel).toHaveBeenCalledWith(4096, 'medium');
    expect(mockedLoadModel).toHaveBeenCalledWith('Llama-3.2-3B-Instruct-q4f32_1-MLC');
  });

  it('stores the selected model on the worker node metadata', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('unloaded');
    mockedGetCurrentModel.mockReturnValue(null);

    const agent = new NodeWorkerAgent({ gpuProfile, tabId: 'tab-1' });
    const doc = (agent as unknown as { doc: Y.Doc }).doc;
    const nodeId = (agent as unknown as { nodeId: string }).nodeId;
    registerNode(doc, nodeId, 'worker', gpuProfile, 'tab-1');

    await (agent as unknown as { ensureModelReady: () => Promise<void> }).ensureModelReady();

    const node = getNodes(doc).get(nodeId);
    expect(node?.get('selectedModelId')).toBe('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    expect(node?.get('tabId')).toBe('tab-1');
  });

  it('executes llm_inference tasks with streamed chat()', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChatStream.mockImplementation(async (_messages, _config, onProgress) => {
      onProgress?.({
        text: 'hello',
        chunkText: 'hello',
        tokensGenerated: 5,
        tokensPerSec: 20,
      });
      onProgress?.({
        text: 'hello from model',
        chunkText: ' from model',
        tokensGenerated: 12,
        tokensPerSec: 24,
      });

      return {
        message: { role: 'assistant', content: 'hello from model' },
        tokensGenerated: 12,
        tokensPerSec: 24,
      };
    });

    const agent = new NodeWorkerAgent({ gpuProfile });
    const task: TaskNode = {
      id: 'task-1',
      type: 'llm_inference',
      description: 'Summarize this text',
      status: 'pending',
      claimedBy: null,
      args: { prompt: 'Summarize this text' },
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    };

    const result = await (agent as unknown as { executeTask: (task: TaskNode) => Promise<unknown> }).executeTask(task) as Record<string, unknown>;

    expect(mockedChatStream).toHaveBeenCalledWith([{ role: 'user', content: 'Summarize this text' }], undefined, expect.any(Function));
    expect(result).toMatchObject({
      type: 'llm_result',
      output: 'hello from model',
      modelId: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
      tokensGenerated: 12,
      tokensPerSec: 24,
    });
  });

  it('publishes a live workflow preview while streaming inference', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChatStream.mockImplementation(async (_messages, _config, onProgress) => {
      onProgress?.({
        text: 'Partial answer',
        chunkText: 'Partial answer',
        tokensGenerated: 8,
        tokensPerSec: 32,
      });

      return {
        message: { role: 'assistant', content: 'Partial answer complete' },
        tokensGenerated: 15,
        tokensPerSec: 30,
      };
    });

    const agent = new NodeWorkerAgent({ gpuProfile });
    const task: TaskNode = {
      id: 'task-stream',
      type: 'llm_inference',
      description: 'Stream this text',
      status: 'running',
      claimedBy: 'worker-1',
      args: { prompt: 'Stream this text' },
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: Date.now(),
      completedAt: null,
    };
    const doc = seedAgentDoc(agent);
    const workflow = seedWorkflow(doc, 'wf-stream', [task]);

    await (agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }).executeTask(task, 'wf-stream');

    expect(workflow.get('result')).toEqual({
      type: 'llm_result_partial',
      prompt: 'Stream this text',
      output: 'Partial answer complete',
      modelId: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
      tokensGenerated: 15,
      tokensPerSec: 30,
    });
  });

  it.each([
    {
      name: 'returns a structured reduce_result when reducing scrape task output',
      scrapeContent: [
        '# Example Article',
        '',
        'Lead paragraph with concrete details that should produce a non-empty cleaned summary.',
        '',
        '## Key Facts',
        'The first sourced fact belongs under the Key Facts section.',
        '',
        '## Risks',
        'The second sourced fact belongs under the Risks section.',
      ].join('\n'),
      expectedSections: [
        {
          heading: 'Key Facts',
          content: 'The first sourced fact belongs under the Key Facts section.',
        },
        {
          heading: 'Risks',
          content: 'The second sourced fact belongs under the Risks section.',
        },
      ],
    },
    {
      name: 'strips reader-noise markers from reduced scrape summaries',
      scrapeContent: [
        'URL Source: https://example.com/source',
        'Published Time: 2026-05-11T09:30:00Z',
        'Markdown Content:',
        '# Example Article',
        'The actual article content starts here and should be summarized cleanly.',
        '## Details',
        'Concrete detail copied from the source section.',
      ].join('\n'),
      expectedSections: [{ heading: 'Details', content: 'Concrete detail copied from the source section.' }],
      expectedSummarySnippet: 'actual article content starts here',
    },
  ])('$name', async ({ scrapeContent, expectedSections, expectedSummarySnippet }) => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);
    const reduceTask = seedReduceWorkflow(doc, scrapeContent);

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expectReduceResult(result, expectedSections, expectedSummarySnippet);
  });

  it('persists task result into the DAG node on completion', () => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);
    const runningTask = createTask({
      id: 'task-1',
      type: 'llm_inference',
      description: 'test',
      status: 'running',
      claimedBy: 'worker-1',
      startedAt: Date.now(),
    });
    const workflow = seedWorkflow(doc, 'wf-1', [runningTask]);
    const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
    const node = dagMap.get('task-1') as Y.Map<unknown>;

    const result = { type: 'llm_result', output: 'stored output' };
    (agent as unknown as { completeTask: (workflowId: string, taskId: string, result: unknown) => void }).completeTask('wf-1', 'task-1', result);

    expect(node.get('status')).toBe('completed');
    expect(node.get('result')).toEqual(result);
    expect(node.get('completedAt')).not.toBeNull();
  });
});
