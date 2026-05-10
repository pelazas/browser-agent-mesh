import { describe, expect, it } from 'vitest';
import { parseSegments } from '@ui/components/useKeywordText';

describe('parseSegments', () => {
  it('returns single text segment for text with no keywords', () => {
    expect(parseSegments('hello world')).toEqual([
      { type: 'text', content: 'hello world', key: 'txt-0' },
    ]);
  });

  it('escapes nothing (segments are raw text)', () => {
    expect(parseSegments('<script>')).toEqual([
      { type: 'text', content: '<script>', key: 'txt-0' },
    ]);
  });

  it('wraps a single keyword', () => {
    const segments = parseSegments('research this');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      type: 'keyword',
      content: 'research',
      key: 'kw-research-0',
    });
    expect(segments[1]).toEqual({
      type: 'text',
      content: ' this',
      key: 'txt-8',
    });
  });

  it('wraps multiple keywords', () => {
    const segments = parseSegments('research and scrape');
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({
      type: 'keyword',
      content: 'research',
      key: 'kw-research-0',
    });
    expect(segments[1]).toEqual({
      type: 'text',
      content: ' and ',
      key: 'txt-8',
    });
    expect(segments[2]).toEqual({
      type: 'keyword',
      content: 'scrape',
      key: 'kw-scrape-0',
    });
  });

  it('is case insensitive', () => {
    const segments = parseSegments('ScRaPe');
    expect(segments[0]).toEqual({
      type: 'keyword',
      content: 'ScRaPe',
      key: 'kw-scrape-0',
    });
  });

  it('does not match partial words', () => {
    expect(parseSegments('researching')).toEqual([
      { type: 'text', content: 'researching', key: 'txt-0' },
    ]);
    expect(parseSegments('my findings')).toEqual([
      { type: 'text', content: 'my findings', key: 'txt-0' },
    ]);
  });

  it('matches british spelling summarise', () => {
    const segments = parseSegments('summarise this');
    expect(segments[0]).toEqual({
      type: 'keyword',
      content: 'summarise',
      key: 'kw-summarise-0',
    });
  });

  it('matches find and search', () => {
    expect(parseSegments('find the answer')[0]).toEqual({
      type: 'keyword',
      content: 'find',
      key: 'kw-find-0',
    });
    expect(parseSegments('search for it')[0]).toEqual({
      type: 'keyword',
      content: 'search',
      key: 'kw-search-0',
    });
  });

  it('matches extract', () => {
    expect(parseSegments('extract data')[0]).toEqual({
      type: 'keyword',
      content: 'extract',
      key: 'kw-extract-0',
    });
  });

  it('matches summarize', () => {
    expect(parseSegments('summarize report')[0]).toEqual({
      type: 'keyword',
      content: 'summarize',
      key: 'kw-summarize-0',
    });
  });

  it('counts occurrences per keyword', () => {
    const segments = parseSegments('research and research');
    expect(segments[0]).toEqual({
      type: 'keyword',
      content: 'research',
      key: 'kw-research-0',
    });
    expect(segments[2]).toEqual({
      type: 'keyword',
      content: 'research',
      key: 'kw-research-1',
    });
  });

  it('preserves newlines', () => {
    const segments = parseSegments('research\nscrape');
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({
      type: 'keyword',
      content: 'research',
      key: 'kw-research-0',
    });
    expect(segments[1]).toEqual({
      type: 'text',
      content: '\n',
      key: 'txt-8',
    });
    expect(segments[2]).toEqual({
      type: 'keyword',
      content: 'scrape',
      key: 'kw-scrape-0',
    });
  });
});
