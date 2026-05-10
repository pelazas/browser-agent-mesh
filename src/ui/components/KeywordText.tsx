import React from 'react';
import {
  parseSegments,
  parseWorkflowSegments,
  type KeywordTextVariant,
} from '@ui/components/useKeywordText';

function InputKeywordChars({ word }: { word: string }): React.ReactElement {
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

function WorkflowKeyword({ word }: { word: string }): React.ReactElement {
  return <span className="workflow-keyword">{word}</span>;
}

export function KeywordText(
  { text, variant = 'input' }: { text: string; variant?: KeywordTextVariant },
): React.ReactElement {
  const segments = variant === 'workflow'
    ? parseWorkflowSegments(text)
    : parseSegments(text);

  return (
    <>
      {segments.map((seg) => {
        if (seg.type === 'keyword') {
          return variant === 'workflow'
            ? <WorkflowKeyword key={seg.key} word={seg.content} />
            : <InputKeywordChars key={seg.key} word={seg.content} />;
        }
        if (seg.type === 'link') {
          return (
            <a
              key={seg.key}
              className="workflow-link"
              href={seg.content}
              target="_blank"
              rel="noreferrer"
            >
              {seg.content}
            </a>
          );
        }
        return <span key={seg.key}>{seg.content}</span>;
      })}
    </>
  );
}
