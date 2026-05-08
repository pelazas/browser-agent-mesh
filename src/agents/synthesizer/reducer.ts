import { createLogger } from '@utils/logging';

const log = createLogger('reducer');

export interface FragmentOutput {
  taskId: string;
  content: unknown;
  confidence: number;
}

export async function consolidate(outputs: FragmentOutput[]): Promise<string> {
  log.info('consolidating outputs', { count: outputs.length });

  const sorted = [...outputs].sort((a, b) => b.confidence - a.confidence);

  const parts = sorted.map((o) =>
    `[Task ${o.taskId}] (confidence: ${(o.confidence * 100).toFixed(0)}%)\n${JSON.stringify(o.content)}`,
  );

  return parts.join('\n\n---\n\n');
}

export function mergeByConfidence(outputs: FragmentOutput[], threshold: number = 0.5): FragmentOutput[] {
  return outputs.filter((o) => o.confidence >= threshold);
}

export function deduplicate(outputs: FragmentOutput[]): FragmentOutput[] {
  const seen = new Set<string>();
  return outputs.filter((o) => {
    const key = JSON.stringify(o.content);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
