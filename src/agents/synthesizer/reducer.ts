import { createLogger } from '@utils/logging';

const log = createLogger('reducer');

export interface FragmentOutput {
  taskId: string;
  content: unknown;
  confidence: number;
}

function formatReduceResult(content: unknown): string | null {
  if (
    typeof content === 'object' &&
    content !== null &&
    (content as { type?: unknown }).type === 'reduce_result'
  ) {
    const r = content as {
      title?: string;
      summary?: string;
      highlights?: string[];
    };

    const parts: string[] = [];
    if (r.title) {
      parts.push(`# **${r.title}**`);
    }
    if (r.summary) {
      parts.push(r.summary);
    }

    if (r.highlights && r.highlights.length > 0) {
      parts.push('## **Highlights**');
      for (const takeaway of r.highlights) {
        parts.push(`- ${takeaway}`);
      }
    }
    return parts.join('\n\n');
  }
  return null;
}

export async function consolidate(outputs: FragmentOutput[]): Promise<string> {
  log.info('consolidating outputs', { count: outputs.length });

  const hasReduceResult = outputs.some((o) => {
    const content = o.content;
    return typeof content === 'object' && content !== null && (content as { type?: unknown }).type === 'reduce_result';
  });

  const filtered = hasReduceResult
    ? outputs.filter((o) => {
        const content = o.content;
        return !(typeof content === 'object' && content !== null && (content as { type?: unknown }).type === 'scrape_result');
      })
    : outputs;

  const sorted = [...filtered].sort((a, b) => b.confidence - a.confidence);

  const parts = sorted.map((o) => {
    const formatted = formatReduceResult(o.content);
    const body = formatted !== null ? formatted : JSON.stringify(o.content);
    return `[Task ${o.taskId}] (confidence: ${(o.confidence * 100).toFixed(0)}%)\n${body}`;
  });

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
