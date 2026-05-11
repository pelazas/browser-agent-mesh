import { describe, it, expect } from 'vitest';
import { extractTaskActivities } from '@ui/hooks/useAppView';

describe('extractTaskActivities', () => {
  it('returns empty array when workflow has no dag', () => {
    expect(extractTaskActivities({})).toEqual([]);
  });

  it('returns empty array when dag is null', () => {
    const workflow = { dag: null };
    expect(extractTaskActivities(workflow as unknown as Parameters<typeof extractTaskActivities>[0])).toEqual([]);
  });

  it('extracts completed task with LLM result including modelId and tokens', () => {
    const workflow = {
      dag: {
        'task-1': {
          description: 'Research topic',
          type: 'llm_inference',
          status: 'completed',
          claimedBy: 'node-abc',
          startedAt: 1000,
          completedAt: 5000,
          createdAt: 500,
          error: null,
          result: {
            type: 'llm_result',
            modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
            tokensGenerated: 1200,
            tokensPerSec: 45,
          },
        },
      },
    };

    const result = extractTaskActivities(workflow);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      taskId: 'task-1',
      description: 'Research topic',
      type: 'llm_inference',
      status: 'completed',
      claimedBy: 'node-abc',
      startedAt: 1000,
      completedAt: 5000,
      createdAt: 500,
      error: null,
      modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      tokensGenerated: 1200,
      tokensPerSec: 45,
    });
  });

  it('extracts running task without result fields', () => {
    const workflow = {
      dag: {
        'task-2': {
          description: 'Analyze results',
          type: 'reduce',
          status: 'running',
          claimedBy: 'node-xyz',
          startedAt: 8000,
          completedAt: null,
          createdAt: 2000,
          error: null,
          result: null,
        },
      },
    };

    const result = extractTaskActivities(workflow);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      taskId: 'task-2',
      status: 'running',
      startedAt: 8000,
      completedAt: null,
      modelId: null,
      tokensGenerated: null,
    });
  });

  it('extracts failed task with error message', () => {
    const workflow = {
      dag: {
        'task-3': {
          description: 'Scrape website',
          type: 'scrape',
          status: 'failed',
          claimedBy: null,
          error: 'Connection refused',
          startedAt: null,
          completedAt: null,
          createdAt: 3000,
          result: null,
        },
      },
    };

    const result = extractTaskActivities(workflow);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      status: 'failed',
      error: 'Connection refused',
      claimedBy: null,
    });
  });

  it('handles missing optional fields gracefully', () => {
    const workflow = {
      dag: {
        'task-min': {
          createdAt: 100,
        },
      },
    };

    const result = extractTaskActivities(workflow);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      taskId: 'task-min',
      description: '',
      type: 'unknown',
      status: 'pending',
      claimedBy: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: 100,
      modelId: null,
      tokensGenerated: null,
      tokensPerSec: null,
    });
  });

  it('preserves insertion order of dag entries', () => {
    const workflow = {
      dag: {
        'C': { description: 'task-C', status: 'pending', createdAt: 3 },
        'A': { description: 'task-A', status: 'pending', createdAt: 1 },
        'B': { description: 'task-B', status: 'pending', createdAt: 2 },
      },
    };

    const result = extractTaskActivities(workflow);
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.taskId)).toEqual(['C', 'A', 'B']);
  });

  it('handles result without llm fields', () => {
    const workflow = {
      dag: {
        'task-4': {
          description: 'Fetch API',
          type: 'retrieve',
          status: 'completed',
          createdAt: 0,
          result: { data: [1, 2, 3], status: 200 },
        },
      },
    };

    const result = extractTaskActivities(workflow);
    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBeNull();
    expect(result[0].tokensGenerated).toBeNull();
  });

  it('extracts tokensPerSec from llm result', () => {
    const workflow = {
      dag: {
        'task-5': {
          description: 'Summarize',
          type: 'llm_inference',
          status: 'completed',
          createdAt: 0,
          result: { type: 'llm_result', modelId: 'SmolLM-135M', tokensGenerated: 340, tokensPerSec: 52.5 },
        },
      },
    };

    const result = extractTaskActivities(workflow);
    expect(result).toHaveLength(1);
    expect(result[0].tokensPerSec).toBe(52.5);
    expect(result[0].modelId).toBe('SmolLM-135M');
  });
});
