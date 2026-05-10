import { describe, expect, it } from 'vitest';
import { extractWorkflowResponse } from '@ui/hooks/useAppView';

describe('extractWorkflowResponse', () => {
  it('prefers llm fragment output and model metadata', () => {
    const workflow = {
      result: {
        type: 'synthesis_result',
        content: 'fallback synthesis text',
        fragments: [
          {
            taskId: 'task-1',
            content: {
              type: 'llm_result',
              prompt: 'what is a llm?',
              output: 'A large language model is a neural network trained on text.',
              modelId: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
            },
            confidence: 1,
          },
        ],
      },
    };

    expect(extractWorkflowResponse(workflow)).toEqual({
      modelId: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
      responseText: 'A large language model is a neural network trained on text.',
    });
  });

  it('falls back to synthesized content when no llm fragment exists', () => {
    const workflow = {
      result: {
        type: 'synthesis_result',
        content: 'Synthesized workflow summary',
        fragments: [],
      },
    };

    expect(extractWorkflowResponse(workflow)).toEqual({
      modelId: null,
      responseText: 'Synthesized workflow summary',
    });
  });
});
