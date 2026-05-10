import { getKeywordPattern } from '@agents/keywords';

export interface KeywordSegment {
  type: 'text' | 'keyword';
  content: string;
  key: string;
}

export interface WorkflowSegment {
  type: 'text' | 'keyword' | 'link';
  content: string;
  key: string;
}

export type KeywordTextVariant = 'input' | 'workflow';

export function parseSegments(text: string): KeywordSegment[] {
  const pattern = getKeywordPattern();
  const keywordCounts = new Map<string, number>();
  const segments: KeywordSegment[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index), key: `txt-${lastIndex}` });
    }

    const word = match[0];
    const lower = word.toLowerCase();
    const count = keywordCounts.get(lower) ?? 0;
    keywordCounts.set(lower, count + 1);
    segments.push({ type: 'keyword', content: word, key: `kw-${lower}-${count}` });
    lastIndex = match.index + word.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex), key: `txt-${lastIndex}` });
  }

  return segments;
}

function trimTrailingUrlPunctuation(value: string): { url: string; trailing: string } {
  const match = value.match(/^(.*?)([.,!?;:'"\]\}>]+)?$/u);
  return { url: match?.[1] ?? value, trailing: match?.[2] ?? '' };
}

export function parseWorkflowSegments(text: string): WorkflowSegment[] {
  const urlPattern = /https?:\/\/[^\s)]+/gi;
  const segments: WorkflowSegment[] = [];
  let lastIndex = 0;

  const pushKeywordSegments = (value: string, offset: number): void => {
    for (const segment of parseSegments(value)) {
      segments.push({ ...segment, key: `${segment.key}-${offset}` });
    }
  };

  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushKeywordSegments(text.slice(lastIndex, match.index), lastIndex);
    }

    const { url, trailing } = trimTrailingUrlPunctuation(match[0]);
    segments.push({ type: 'link', content: url, key: `link-${match.index}` });
    if (trailing) {
      segments.push({ type: 'text', content: trailing, key: `trail-${match.index}` });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    pushKeywordSegments(text.slice(lastIndex), lastIndex);
  }

  return segments;
}
