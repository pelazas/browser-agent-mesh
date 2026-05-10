import { describe, expect, it } from 'vitest';
import { highlightKeywords } from '@ui/components/useRichPromptInput';

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
      '<span class="rainbow-keyword">research</span> this',
    );
  });

  it('wraps multiple keywords', () => {
    expect(highlightKeywords('research and scrape')).toBe(
      '<span class="rainbow-keyword">research</span> and <span class="rainbow-keyword">scrape</span>',
    );
  });

  it('is case insensitive', () => {
    expect(highlightKeywords('ScRaPe')).toBe(
      '<span class="rainbow-keyword">ScRaPe</span>',
    );
  });

  it('does not match partial words', () => {
    expect(highlightKeywords('researching')).toBe('researching');
    expect(highlightKeywords('my findings')).toBe('my findings');
  });

  it('matches british spelling summarise', () => {
    expect(highlightKeywords('summarise this')).toBe(
      '<span class="rainbow-keyword">summarise</span> this',
    );
  });

  it('matches find and search', () => {
    expect(highlightKeywords('find the answer')).toBe(
      '<span class="rainbow-keyword">find</span> the answer',
    );
    expect(highlightKeywords('search for it')).toBe(
      '<span class="rainbow-keyword">search</span> for it',
    );
  });

  it('matches extract', () => {
    expect(highlightKeywords('extract data')).toBe(
      '<span class="rainbow-keyword">extract</span> data',
    );
  });

  it('matches summarize', () => {
    expect(highlightKeywords('summarize report')).toBe(
      '<span class="rainbow-keyword">summarize</span> report',
    );
  });

  it('preserves newlines', () => {
    expect(highlightKeywords('research\nscrape')).toBe(
      '<span class="rainbow-keyword">research</span>\n<span class="rainbow-keyword">scrape</span>',
    );
  });
});
