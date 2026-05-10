export const SENTINEL_KEYWORDS = [
  'research',
  'find',
  'search',
  'scrape',
  'extract',
  'summarize',
  'summarise',
] as const;

export type SentinelKeyword = (typeof SENTINEL_KEYWORDS)[number];

let keywordPattern: RegExp | null = null;

export function getKeywordPattern(): RegExp {
  if (keywordPattern === null) {
    const joined = SENTINEL_KEYWORDS.join('|');
    keywordPattern = new RegExp(`\\b(${joined})\\b`, 'gi');
  }
  return keywordPattern;
}
