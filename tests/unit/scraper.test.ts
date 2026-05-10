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
      headers: new Map([['content-type', 'text/html']]),
      text: vi.fn().mockResolvedValue('<html><body><h1>Hi</h1></body></html>'),
    }) as unknown as typeof fetch;

    const result = await scrape({ url: 'https://example.com' });

    expect(result).toBe('<html><body><h1>Hi</h1></body></html>');
  });

  it('returns the selected element html when a selector is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: vi.fn().mockResolvedValue('<html><body><div class="price">19 EUR</div></body></html>'),
    }) as unknown as typeof fetch;

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
      headers: new Map([['content-type', 'text/html']]),
      text: vi.fn().mockResolvedValue('<html><body><div>missing</div></body></html>'),
    }) as unknown as typeof fetch;

    globalThis.DOMParser = class extends MockDOMParser {
      constructor() {
        super(() => ({ querySelector: () => null }));
      }
    } as unknown as typeof DOMParser;

    await expect(scrape({ url: 'https://example.com', selector: '.price' }))
      .rejects
      .toThrow('Selector ".price" not found for https://example.com');
  });

  it('surfaces a clear CORS error when fetch throws a TypeError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as typeof fetch;

    await expect(scrape({ url: 'https://docs.aws.amazon.com/some.pdf' }))
      .rejects
      .toThrow(/Cross-origin request blocked by CORS/);
  });

  it('rejects unsupported content types such as application/pdf', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/pdf']]),
      text: vi.fn(),
    }) as unknown as typeof fetch;

    await expect(scrape({ url: 'https://example.com/doc.pdf' }))
      .rejects
      .toThrow(/Unsupported content type "application\/pdf"/);
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
