import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function createResponse(init: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string;
  text?: string;
}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: new Map([['content-type', init.contentType ?? 'text/html']]),
    text: vi.fn().mockResolvedValue(init.text ?? '<html></html>'),
  } as unknown as Response;
}

async function loadScrape(): Promise<typeof import('@agents/bridge/scraper').scrape> {
  vi.resetModules();
  const module = await import('@agents/bridge/scraper');
  return module.scrape;
}

describe('bridge scraper', () => {
  const originalFetch = globalThis.fetch;
  const originalDOMParser = globalThis.DOMParser;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.DOMParser = originalDOMParser;
    vi.unstubAllEnvs();
  });

  it('returns full html on direct fetch success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createResponse({ text: '<html><body><h1>Hi</h1></body></html>' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const scrape = await loadScrape();

    const result = await scrape({ url: 'https://example.com' });

    expect(result).toBe('<html><body><h1>Hi</h1></body></html>');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('retries through the configured proxy when direct fetch throws TypeError', async () => {
    vi.stubEnv('VITE_CORS_PROXY_URL', 'https://proxy.local/scrape');
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(createResponse({ text: '<html><body>proxied</body></html>' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const scrape = await loadScrape();

    const result = await scrape({ url: 'https://docs.aws.amazon.com/some.pdf' });

    expect(result).toBe('<html><body>proxied</body></html>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://docs.aws.amazon.com/some.pdf',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://proxy.local/scrape?url=https%3A%2F%2Fdocs.aws.amazon.com%2Fsome.pdf',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws a clear proxy guidance message when direct fetch throws TypeError and no proxy is configured', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as typeof fetch;
    const scrape = await loadScrape();

    await expect(scrape({ url: 'https://docs.aws.amazon.com/some.pdf' }))
      .rejects
      .toThrow(/VITE_CORS_PROXY_URL/);
  });

  it('returns the selected element html when a selector is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(createResponse({
      text: '<html><body><div class="price">19 EUR</div></body></html>',
    })) as unknown as typeof fetch;

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

    const scrape = await loadScrape();
    const result = await scrape({ url: 'https://example.com', selector: '.price' });

    expect(result).toBe('<div class="price">19 EUR</div>');
  });

  it('fails when the requested selector is not present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(createResponse({
      text: '<html><body><div>missing</div></body></html>',
    })) as unknown as typeof fetch;

    globalThis.DOMParser = class extends MockDOMParser {
      constructor() {
        super(() => ({ querySelector: () => null }));
      }
    } as unknown as typeof DOMParser;

    const scrape = await loadScrape();

    await expect(scrape({ url: 'https://example.com', selector: '.price' }))
      .rejects
      .toThrow('Selector ".price" not found for https://example.com');
  });

  it('rejects unsupported content types such as application/pdf', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(createResponse({
      contentType: 'application/pdf',
    })) as unknown as typeof fetch;
    const scrape = await loadScrape();

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
      headers: new Map([['content-type', 'text/html']]),
      text,
    }) as typeof fetch;
    const scrape = await loadScrape();

    await expect(scrape({ url: 'https://example.com/missing' }))
      .rejects
      .toThrow('Scrape request failed for https://example.com/missing: HTTP 404 Not Found');

    expect(text).not.toHaveBeenCalled();
  });
});
