import { createLogger } from '@utils/logging';

const log = createLogger('scraper');

const SUPPORTED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];

export interface ScrapeOptions {
  url: string;
  selector?: string;
  timeout?: number;
}

function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPES.some((t) => contentType.startsWith(t));
}

export async function scrape(opts: ScrapeOptions): Promise<string> {
  log.info('scraping', { url: opts.url, selector: opts.selector ?? null });

  let response: Response;
  try {
    response = await fetch(opts.url, {
      signal: AbortSignal.timeout(opts.timeout ?? 10_000),
    });
  } catch (err) {
    const message = err instanceof TypeError
      ? `Cross-origin request blocked by CORS or network failure for ${opts.url}. The target server did not allow access.`
      : String(err);
    log.error('scrape fetch failed', { url: opts.url, error: message });
    throw new Error(message);
  }

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : '';
    throw new Error(`Scrape request failed for ${opts.url}: HTTP ${response.status}${statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !isSupportedContentType(contentType)) {
    throw new Error(`Unsupported content type "${contentType}" for ${opts.url}. Only HTML/text scraping is currently supported.`);
  }

  const html = await response.text();

  if (!opts.selector) {
    log.info('scrape succeeded', { url: opts.url, bytes: html.length });
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const selected = doc.querySelector(opts.selector);

  if (!selected) {
    throw new Error(`Selector "${opts.selector}" not found for ${opts.url}`);
  }

  const selectedHtml = selected.outerHTML;
  log.info('scrape succeeded', { url: opts.url, selector: opts.selector, bytes: selectedHtml.length });

  return selectedHtml;
}
