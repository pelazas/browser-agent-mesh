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
  return seedReduceWorkflowWithResult(doc, {
    content: scrapeContent,
    contentType: 'text/plain',
    format: 'text',
  });
}

function seedReduceWorkflowWithResult(
  doc: Y.Doc,
  scrapeResult: { content: string; contentType: string; format: 'html' | 'text' },
): TaskNode {
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
      contentType: scrapeResult.contentType,
      format: scrapeResult.format,
      content: scrapeResult.content,
      bytes: scrapeResult.content.length,
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

function expectToContainKeywords(value: string, keywords: string[]): void {
  for (const keyword of keywords) {
    expect(value).toContain(keyword);
  }
}

function forceHeuristicReducePath(): void {
  mockedSelectBestModel.mockReturnValue(selectedModel);
  mockedGetEngineStatus.mockReturnValue('unloaded');
  mockedGetCurrentModel.mockReturnValue(null);
}

describe('NodeWorkerAgent WebLLM integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it('returns a structured reduce_result when reducing scrape task output', async () => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflow(
      doc,
      [
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
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(result.type).toBe('reduce_result');
    expect(result.title).toBeTypeOf('string');
    expect((result.title as string).trim().length).toBeGreaterThan(0);
    expect(result.summary).toBeTypeOf('string');
    expect((result.summary as string).trim().length).toBeGreaterThan(40);
    expect(result).not.toHaveProperty('sectionSummaries');
    expect(result).not.toHaveProperty('description');

    expectNoReaderNoise(result.title as string);
    expectNoReaderNoise(result.summary as string);
  });

  it('strips reader-noise markers from reduced scrape summaries', async () => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflow(
      doc,
      [
        'URL Source: https://example.com/source',
        'Published Time: 2026-05-11T09:30:00Z',
        'Markdown Content:',
        '# Example Article',
        'The actual article content starts here and should be summarized cleanly.',
        '## Details',
        'Concrete detail copied from the source section.',
      ].join('\n'),
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(result.type).toBe('reduce_result');
    expect(result.title).toBeTypeOf('string');
    expect((result.title as string).trim().length).toBeGreaterThan(0);
    expect(result.summary).toBeTypeOf('string');
    expect((result.summary as string).trim().length).toBeGreaterThan(0);

    expectNoReaderNoise(result.title as string);
    expectNoReaderNoise(result.summary as string);
  });

  it('keeps heuristic PDF reduce summaries anchored in body content instead of front matter', async () => {
    forceHeuristicReducePath();

    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflowWithResult(
      doc,
      {
        contentType: 'application/pdf',
        format: 'text',
        content: [
          '# Incident Response Manual',
          '',
          'Confidential internal draft for training distribution only.',
          '',
          'Table of Contents',
          '1. Escalation model',
          '2. Severity rubric',
          '3. Recovery checkpoints',
          '',
          'This manual explains how service owners classify incidents, coordinate cross-team escalation, and restore customer-facing systems during business-critical outages.',
          '',
          'It also defines who makes severity decisions, which communications channels are required, and how teams confirm recovery before closing an event.',
        ].join('\n'),
      },
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(result.type).toBe('reduce_result');
    expectToContainKeywords(result.summary as string, ['incidents', 'escalation', 'outages']);
    expect(result.summary).not.toContain('Confidential internal draft');
    expect(result.summary).not.toContain('Table of Contents');
    expect(result.summary).not.toContain('Escalation model');
  });

  it('keeps heuristic PDF reduce summaries anchored in late body content', async () => {
    forceHeuristicReducePath();

    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflowWithResult(
      doc,
      {
        contentType: 'application/pdf',
        format: 'text',
        content: [
          '# Procurement Playbook',
          '',
          'Prepared for vendor onboarding workshops.',
          '',
          'Revision 7.2',
          '',
          'Page 1 of 18',
          '',
          'Document Control',
          'Owner: Operations',
          '',
          'Approval Log',
          'Finance, Legal, Security',
          '',
          'This playbook explains how procurement teams evaluate vendor risk, negotiate renewal terms, and document cost-saving decisions before contracts are approved.',
          '',
          'It highlights the checkpoints that matter for legal review, security validation, and executive sign-off on larger spend commitments.',
        ].join('\n'),
      },
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(result.type).toBe('reduce_result');
    expectToContainKeywords(result.summary as string, ['vendor', 'security', 'contracts']);
    expect(result.summary).not.toContain('Prepared for vendor onboarding workshops');
    expect(result.summary).not.toContain('Revision 7.2');
    expect(result.summary).not.toContain('Page 1 of 18');
    expect(result.summary).not.toContain('Document Control');
  });

  it('fails reduce tasks without a workflow context', async () => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const task = createTask({
      id: 'reduce-1',
      type: 'reduce',
      description: 'Process and structure extracted data',
      args: { prompt: 'Process and structure extracted data' },
    });

    await expect(
      (agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }).executeTask(task),
    ).rejects.toThrow(/requires workflowId/);
  });

  it('fails reduce tasks with no usable scrape predecessor content', async () => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = createTask({
      id: 'reduce-1',
      type: 'reduce',
      description: 'Process and structure extracted data',
      args: { prompt: 'Process and structure extracted data' },
    });

    seedWorkflow(doc, 'wf-reduce', [reduceTask]);

    await expect(
      (agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }).executeTask(
        reduceTask,
        'wf-reduce',
      ),
    ).rejects.toThrow(/No usable scrape content was available/);
  });

  it('uses the document title as a fallback summary when cleaned scrape content has no body text', async () => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflow(
      doc,
      '# Example Article',
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(result.type).toBe('reduce_result');
    expect(result.title).toBe('Example Article');
    expect(result.summary).toBe('Example Article');
  });

  it('uses LLM chatStream to summarize scrape content', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChatStream.mockResolvedValue({
      message: { role: 'assistant', content: '{"title":"AWS Cloud Patterns","summary":"This guide explains how AWS design patterns help teams modernize systems, improve resilience, and make architectural tradeoffs across common cloud migration scenarios.","highlights":["Explains when to apply common modernization patterns.","Connects each pattern to reliability and migration decisions."]}' },
      tokensGenerated: 50,
      tokensPerSec: 25,
    });

    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflow(
      doc,
      [
        '# Example Article',
        '',
        'Lead paragraph with concrete details.',
        '',
        '## Key Facts',
        'The first sourced fact.',
      ].join('\n'),
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(mockedChatStream).toHaveBeenCalledTimes(2);
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).toContain('Document chunk 1 of 1');
    expect(mockedChatStream.mock.calls[1]?.[0]?.[0]?.content).toContain('Chunk summaries');
    expect(result.type).toBe('reduce_result');
    expect(result.title).toBe('AWS Cloud Patterns');
    expect(result.summary).toContain('AWS design patterns');
    expect(result.highlights).toEqual([
      'Explains when to apply common modernization patterns.',
      'Connects each pattern to reliability and migration decisions.',
    ]);
  });

  it('summarizes extracted text instead of raw HTML markup for HTML scrapes', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChatStream.mockResolvedValue({
      message: { role: 'assistant', content: '{"title":"Release Notes","summary":"This page summarizes release updates, rollout notes, and migration guidance for product teams.","highlights":["Includes rollout guidance."]}' },
      tokensGenerated: 30,
      tokensPerSec: 20,
    });

    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflowWithResult(
      doc,
      {
        contentType: 'text/html',
        format: 'html',
        content: '<article><h1>Release Notes</h1><p>This page summarizes release updates, rollout notes, and migration guidance for product teams.</p><p>Includes rollout guidance.</p></article>',
      },
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(mockedChatStream).toHaveBeenCalledTimes(1);
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).toContain('Document text:');
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).not.toContain('Document chunk 1 of 1');
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).toContain('Release Notes');
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).toContain('This page summarizes release updates');
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).not.toContain('<article>');
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).not.toContain('<p>');
    expect(result).toMatchObject({
      type: 'reduce_result',
      title: 'Release Notes',
      summary: 'This page summarizes release updates, rollout notes, and migration guidance for product teams.',
      highlights: ['Includes rollout guidance.'],
    });
  });

  it('summarizes PDF scrape content through prepared chunks and final synthesis', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChatStream
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'This chunk covers incident classification, escalation ownership, and outage recovery steps.',
        },
        tokensGenerated: 25,
        tokensPerSec: 20,
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: '{"title":"Incident Response Manual","summary":"This manual explains how teams classify incidents, coordinate escalation, and verify service recovery during critical outages.","highlights":["Defines severity decision ownership.","Requires specific communications channels during incidents."]}',
        },
        tokensGenerated: 45,
        tokensPerSec: 22,
      });

    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflowWithResult(
      doc,
      {
        contentType: 'application/pdf',
        format: 'text',
        content: [
          '# Incident Response Manual',
          '',
          'Confidential internal draft for training distribution only.',
          '',
          'This manual explains how teams classify incidents, coordinate escalation, and restore customer-facing systems during business-critical outages.',
          '',
          'It also defines severity decision owners, required communications channels, and how service owners confirm recovery before closing an event.',
        ].join('\n'),
      },
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(mockedChatStream).toHaveBeenCalledTimes(2);
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).toContain('Document chunk 1 of 1');
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).not.toContain('Confidential internal draft');
    expect(mockedChatStream.mock.calls[1]?.[0]?.[0]?.content).toContain('Chunk summaries');
    expect(result).toMatchObject({
      type: 'reduce_result',
      title: 'Incident Response Manual',
      summary: 'This manual explains how teams classify incidents, coordinate escalation, and verify service recovery during critical outages.',
      highlights: [
        'Defines severity decision ownership.',
        'Requires specific communications channels during incidents.',
      ],
    });
  });

  it('parses final synthesis JSON wrapped in prose and fenced markdown', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChatStream
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'This chunk covers vendor risk review, contract approvals, and security checkpoints.',
        },
        tokensGenerated: 20,
        tokensPerSec: 19,
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: [
            'Here is the synthesized result:',
            '',
            '```json',
            '{"title":"Procurement Playbook","summary":"This playbook explains how procurement teams evaluate vendors, coordinate legal and security review, and approve contracts with clearer spending controls.","highlights":["Covers vendor risk review.","Explains legal and security checkpoints."]}',
            '```',
          ].join('\n'),
        },
        tokensGenerated: 40,
        tokensPerSec: 23,
      });

    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflowWithResult(
      doc,
      {
        contentType: 'application/pdf',
        format: 'text',
        content: [
          '# Procurement Playbook',
          '',
          'Prepared for vendor onboarding workshops.',
          '',
          'This playbook explains how procurement teams evaluate vendor risk, negotiate renewal terms, and document cost-saving decisions before contracts are approved.',
          '',
          'It highlights the checkpoints that matter for legal review, security validation, and executive sign-off on larger spend commitments.',
        ].join('\n'),
      },
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(mockedChatStream).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      type: 'reduce_result',
      title: 'Procurement Playbook',
      summary: 'This playbook explains how procurement teams evaluate vendors, coordinate legal and security review, and approve contracts with clearer spending controls.',
      highlights: [
        'Covers vendor risk review.',
        'Explains legal and security checkpoints.',
      ],
    });
  });

  it('falls back to heuristic reduce when LLM returns unparseable JSON', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChatStream.mockResolvedValue({
      message: { role: 'assistant', content: 'This is not JSON at all' },
      tokensGenerated: 10,
      tokensPerSec: 20,
    });

    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

    const reduceTask = seedReduceWorkflow(
      doc,
      [
        '# Example Article',
        '',
        'Lead paragraph with concrete details.',
      ].join('\n'),
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(mockedChatStream).toHaveBeenCalledTimes(2);
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).toContain('Document chunk 1 of 1');
    expect(mockedChatStream.mock.calls[1]?.[0]?.[0]?.content).toContain('Chunk summaries');
    expect(result.type).toBe('reduce_result');
    expect(result.title).toBeTypeOf('string');
    expect(result.summary).toBeTypeOf('string');
  });

  it('falls back to title-only summary when chunk JSON cannot be parsed and prepared body text is empty', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChatStream.mockResolvedValue({
      message: { role: 'assistant', content: 'not json' },
      tokensGenerated: 10,
      tokensPerSec: 10,
    });

    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);
    const reduceTask = seedReduceWorkflow(
      doc,
      [
        '# Incident Response Manual',
        '',
        'Confidential internal draft for training distribution only.',
        '',
        'Table of Contents',
        '1. Escalation model',
        '2. Severity rubric',
      ].join('\n'),
    );

    const result = await (
      agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }
    ).executeTask(reduceTask, 'wf-reduce') as Record<string, unknown>;

    expect(mockedChatStream).toHaveBeenCalledTimes(2);
    expect(mockedChatStream.mock.calls[0]?.[0]?.[0]?.content).toContain('Document chunk 1 of 1');
    expect(mockedChatStream.mock.calls[1]?.[0]?.[0]?.content).toContain('Chunk summaries');
    expect(result.title).toBe('Incident Response Manual');
    expect(result.summary).toBe('Incident Response Manual');
    expect(result.highlights).toEqual([]);
  });

  it('fails reduce tasks when scrape content is empty after cleanup', async () => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = seedAgentDoc(agent);

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
        content: 'URL Source: https://example.com/source\nPublished Time: 2026-05-11T09:30:00Z\nMarkdown Content:',
        bytes: 100,
        selector: null,
      },
    });

    const reduceTask = createTask({
      id: 'reduce-1',
      type: 'reduce',
      description: 'Process and structure extracted data',
      args: { prompt: 'Process and structure extracted data' },
    });

    seedWorkflow(doc, 'wf-reduce', [scrapeTask, reduceTask], [
      { id: 'edge-scrape-reduce', source: 'scrape-1', target: 'reduce-1', type: 'sequential' },
    ]);

    await expect(
      (agent as unknown as { executeTask: (task: TaskNode, workflowId?: string) => Promise<unknown> }).executeTask(
        reduceTask,
        'wf-reduce',
      ),
    ).rejects.toThrow(/empty after cleanup/);
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
