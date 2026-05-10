import { describe, expect, it } from 'vitest';
import { highlightKeywords } from '@ui/components/useRichPromptInput';

function rainbowKeyword(word: string): string {
  const chars = Array.from(word)
    .map((char, i) => `<span class="rainbow-char" style="--char-index:${i}">${char}</span>`)
    .join('');
  return `<span class="rainbow-keyword">${chars}</span>`;
}

describe('highlightKeywords', () => {
  it('returns empty string for empty input', () => {
    expect(highlightKeywords('')).toBe('');
  });

  it('escapes HTML entities', () => {
    expect(highlightKeywords('<script>')).toBe('&lt;script&gt;');
    expect(highlightKeywords('a & b')).toBe('a &amp; b');
  });

  it('wraps a single keyword', () => {
    expect(highlightKeywords('research this')).toBe(
      `${rainbowKeyword('research')} this`,
    );
  });

  it('wraps multiple keywords', () => {
    expect(highlightKeywords('research and scrape')).toBe(
      `${rainbowKeyword('research')} and ${rainbowKeyword('scrape')}`,
    );
  });

  it('is case insensitive', () => {
    expect(highlightKeywords('ScRaPe')).toBe(rainbowKeyword('ScRaPe'));
  });

  it('does not match partial words', () => {
    expect(highlightKeywords('researching')).toBe('researching');
    expect(highlightKeywords('my findings')).toBe('my findings');
  });

  it('matches british spelling summarise', () => {
    expect(highlightKeywords('summarise this')).toBe(
      `${rainbowKeyword('summarise')} this`,
    );
  });

  it('matches find and search', () => {
    expect(highlightKeywords('find the answer')).toBe(
      `${rainbowKeyword('find')} the answer`,
    );
    expect(highlightKeywords('search for it')).toBe(
      `${rainbowKeyword('search')} for it`,
    );
  });

  it('matches extract', () => {
    expect(highlightKeywords('extract data')).toBe(
      `${rainbowKeyword('extract')} data`,
    );
  });

  it('matches summarize', () => {
    expect(highlightKeywords('summarize report')).toBe(
      `${rainbowKeyword('summarize')} report`,
    );
  });

  it('preserves newlines', () => {
    expect(highlightKeywords('research\nscrape')).toBe(
      `${rainbowKeyword('research')}\n${rainbowKeyword('scrape')}`,
    );
  });
});
