import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrape } from '@agents/bridge/scraper';

interface MockElement {
  outerHTML: string;
}

interface MockDocument {
  querySelector: (selector: string) => MockElement | null;
}

class MockDOMParser {
  constructor(private readonly factory: (html: string) => MockDocument) {}

  parseFromString(html: string): MockDocument {
    return this.factory(html);
  }
}

describe('bridge scraper', () => {
  const originalFetch = globalThis.fetch;
  const originalDOMParser = globalThis.DOMParser;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.DOMParser = originalDOMParser;
  });

  it('returns full html when no selector is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('<html><body><h1>Hi</h1></body></html>'),
    }) as typeof fetch;

    const result = await scrape({ url: 'https://example.com' });

    expect(result).toBe('<html><body><h1>Hi</h1></body></html>');
  });

  it('returns the selected element html when a selector is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('<html><body><div class="price">19 EUR</div></body></html>'),
    }) as typeof fetch;

    globalThis.DOMParser = class {
      parseFromString(): MockDocument {
        return {
          querySelector: (selector: string) => {
            if (selector === '.price') {
              return { outerHTML: '<div class="price">19 EUR</div>' };
            }
            return null;
          },
        };
      }
    } as unknown as typeof DOMParser;

    const result = await scrape({ url: 'https://example.com', selector: '.price' });

    expect(result).toBe('<div class="price">19 EUR</div>');
  });

  it('fails when the requested selector is not present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('<html><body><div>missing</div></body></html>'),
    }) as typeof fetch;

    globalThis.DOMParser = class extends MockDOMParser {
      constructor() {
        super(() => ({ querySelector: () => null }));
      }
    } as unknown as typeof DOMParser;

    await expect(scrape({ url: 'https://example.com', selector: '.price' }))
      .rejects
      .toThrow('Selector ".price" not found for https://example.com');
  });

  it('fails on non-2xx responses instead of returning error-page html', async () => {
    const text = vi.fn().mockResolvedValue('<html><body>Not found</body></html>');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text,
    }) as typeof fetch;

    await expect(scrape({ url: 'https://example.com/missing' }))
      .rejects
      .toThrow('Scrape request failed for https://example.com/missing: HTTP 404 Not Found');

    expect(text).not.toHaveBeenCalled();
  });
});
