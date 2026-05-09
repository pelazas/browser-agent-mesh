import * as Y from 'yjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRootDoc, createWorkflow } from '@core/blackboard/root-doc';
import { NodeWorkerAgent } from '@agents/worker/worker';
import type { GPUProfile, TaskNode } from '@core/blackboard/schema';
import {
  chat,
  getCurrentModel,
  getEngineStatus,
  loadModel,
  selectBestModel,
} from '@webllm/index';

vi.mock('@webllm/index', () => ({
  loadModel: vi.fn(),
  chat: vi.fn(),
  getEngineStatus: vi.fn(),
  getCurrentModel: vi.fn(),
  selectBestModel: vi.fn(),
}));

const mockedLoadModel = vi.mocked(loadModel);
const mockedChat = vi.mocked(chat);
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

  it('executes llm_inference tasks with chat()', async () => {
    mockedSelectBestModel.mockReturnValue(selectedModel);
    mockedGetEngineStatus.mockReturnValue('ready');
    mockedGetCurrentModel.mockReturnValue('Llama-3.2-3B-Instruct-q4f32_1-MLC');
    mockedChat.mockResolvedValue({
      message: { role: 'assistant', content: 'hello from model' },
      tokensGenerated: 12,
      tokensPerSec: 24,
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

    expect(mockedChat).toHaveBeenCalledWith([{ role: 'user', content: 'Summarize this text' }]);
    expect(result).toMatchObject({
      type: 'llm_result',
      output: 'hello from model',
      modelId: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
      tokensGenerated: 12,
      tokensPerSec: 24,
    });
  });

  it('persists task result into the DAG node on completion', () => {
    const agent = new NodeWorkerAgent({ gpuProfile });
    const doc = (agent as unknown as { doc: Y.Doc }).doc;
    const seededDoc = createRootDoc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seededDoc));
    const workflow = createWorkflow(doc, 'wf-1', 'worker-1', 'test prompt');
    const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
    const node = new Y.Map<unknown>();
    node.set('id', 'task-1');
    node.set('type', 'llm_inference');
    node.set('description', 'test');
    node.set('status', 'running');
    node.set('claimedBy', 'worker-1');
    node.set('args', {});
    node.set('result', null);
    node.set('error', null);
    node.set('createdAt', Date.now());
    node.set('startedAt', Date.now());
    node.set('completedAt', null);
    dagMap.set('task-1', node);

    const result = { type: 'llm_result', output: 'stored output' };
    (agent as unknown as { completeTask: (workflowId: string, taskId: string, result: unknown) => void }).completeTask('wf-1', 'task-1', result);

    expect(node.get('status')).toBe('completed');
    expect(node.get('result')).toEqual(result);
    expect(node.get('completedAt')).not.toBeNull();
  });
});
