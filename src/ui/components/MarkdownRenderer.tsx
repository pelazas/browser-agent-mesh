import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownRendererProps {
  text: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => {
  const html = useMemo(() => {
    return marked.parse(text, { async: false }) as string;
  }, [text]);

  return (
    <div
      className="markdown-renderer"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
