import React from 'react';
import { getKeywordPattern } from '@agents/keywords';

interface Segment {
  type: 'text' | 'keyword';
  content: string;
  key: string;
}

export function parseSegments(text: string): Segment[] {
  const pattern = getKeywordPattern();
  const keywordCounts = new Map<string, number>();
  const segments: Segment[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
        key: `txt-${lastIndex}`,
      });
    }

    const word = match[0];
    const lower = word.toLowerCase();
    const count = keywordCounts.get(lower) ?? 0;
    keywordCounts.set(lower, count + 1);

    segments.push({
      type: 'keyword',
      content: word,
      key: `kw-${lower}-${count}`,
    });

    lastIndex = match.index + word.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
      key: `txt-${lastIndex}`,
    });
  }

  return segments;
}

function KeywordChars({ word }: { word: string }): React.ReactElement {
  return (
    <span className="rainbow-keyword">
      {Array.from(word).map((char, i) => (
        <span
          key={i}
          className="rainbow-char"
          style={{ '--char-index': i } as React.CSSProperties}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

export function KeywordText({ text }: { text: string }): React.ReactElement {
  const segments = parseSegments(text);

  return (
    <>
      {segments.map((seg) => {
        if (seg.type === 'keyword') {
          return <KeywordChars key={seg.key} word={seg.content} />;
        }
        return <span key={seg.key}>{seg.content}</span>;
      })}
    </>
  );
}
