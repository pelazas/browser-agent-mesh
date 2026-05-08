import { createLogger } from '@utils/logging';

const log = createLogger('model-loader');

export interface ModelEntry {
  id: string;
  name: string;
  sizeMB: number;
  minVramMB: number;
  description: string;
}

const AVAILABLE_MODELS: ModelEntry[] = [
  {
    id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.2 1B',
    sizeMB: 650,
    minVramMB: 1024,
    description: 'Smallest viable model. Suitable for simple classification and short completions.',
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.2 3B',
    sizeMB: 1800,
    minVramMB: 2560,
    description: 'Balanced performance. Good for RAG and summarization.',
  },
  {
    id: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.1 8B',
    sizeMB: 4800,
    minVramMB: 6144,
    description: 'Full capability. Complex reasoning, multi-step tasks, quality outputs.',
  },
  {
    id: 'Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC',
    name: 'Qwen 2.5 Coder 1.5B',
    sizeMB: 950,
    minVramMB: 1536,
    description: 'Code generation specialist. Optimized for programming tasks.',
  },
  {
    id: 'TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC',
    name: 'TinyLlama 1.1B',
    sizeMB: 600,
    minVramMB: 768,
    description: 'Ultra-lightweight. Suitable for constrained devices.',
  },
];

export function getAvailableModels(availableVramMB: number): ModelEntry[] {
  return AVAILABLE_MODELS.filter((m) => m.minVramMB <= availableVramMB);
}

export function getModelById(id: string): ModelEntry | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

export function selectBestModel(availableVramMB: number, taskComplexity: 'simple' | 'medium' | 'complex'): ModelEntry | null {
  const compatible = getAvailableModels(availableVramMB);
  if (compatible.length === 0) return null;

  const sorted = [...compatible].sort((a, b) => b.sizeMB - a.sizeMB);

  switch (taskComplexity) {
    case 'simple':
      return compatible.find((m) => m.name.includes('1B') || m.name.includes('1.1B')) ?? sorted[sorted.length - 1];
    case 'medium':
      return compatible.find((m) => m.name.includes('3B')) ?? sorted[Math.floor(sorted.length / 2)];
    case 'complex':
      return sorted[0];
    default:
      return sorted[0];
  }
}

export async function warmupCache(modelId: string, onProgress?: (pct: number) => void): Promise<void> {
  log.info('warming model cache', { modelId });
  onProgress?.(0);

  try {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    await CreateMLCEngine(modelId, {
      initProgressCallback: (report: { progress: number }) => {
        onProgress?.(report.progress);
      },
    });
    onProgress?.(100);
    log.info('model cache warmed', { modelId });
  } catch (err) {
    log.error('cache warmup failed', { modelId, error: String(err) });
    throw err;
  }
}
