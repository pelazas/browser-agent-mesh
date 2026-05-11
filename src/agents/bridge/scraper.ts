import { createLogger } from '@utils/logging';
import { config } from '@/config';

const log = createLogger('scraper');

const SUPPORTED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];
const DOCUMENT_FALLBACK_PREFIX = 'https://r.jina.ai/http://';

export interface ScrapeResult {
  contentType: string;
  content: string;
  format: 'html' | 'text';
}

export interface ScrapeOptions {
  url: string;
  selector?: string;
  timeout?: number;
}

function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPES.some((t) => contentType.startsWith(t));
}

function buildProxyUrl(targetUrl: string): string {
  return `${config.corsProxyUrl}?url=${encodeURIComponent(targetUrl)}`;
}

function buildDocumentFallbackUrl(targetUrl: string): string {
  return `${DOCUMENT_FALLBACK_PREFIX}${targetUrl.replace(/^https?:\/\//u, '')}`;
}

function isPdfUrl(targetUrl: string): boolean {
  try {
    return new URL(targetUrl).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return targetUrl.toLowerCase().endsWith('.pdf');
  }
}

function isPdfContentType(contentType: string): boolean {
  return contentType.startsWith('application/pdf');
}

function createHtmlResult(contentType: string, content: string): ScrapeResult {
  return {
    contentType: contentType || 'text/html',
    content,
    format: 'html',
  };
}

function createTextResult(contentType: string, content: string): ScrapeResult {
  return {
    contentType: contentType || 'text/plain',
    content,
    format: 'text',
  };
}

async function fetchDocumentFallback(url: string, options: RequestInit): Promise<ScrapeResult> {
  const fallbackUrl = buildDocumentFallbackUrl(url);
  const response = await fetch(fallbackUrl, options);

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : '';
    throw new Error(`Document fallback failed for ${url}: HTTP ${response.status}${statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? 'text/plain';
  const content = await response.text();

  log.info('document fallback succeeded', { url, fallbackUrl, bytes: content.length });
  return createTextResult(contentType, content);
}

async function fetchWithCorsProxyFallback(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (!(err instanceof TypeError)) {
      throw err;
    }

    if (!config.corsProxyUrl) {
      throw new Error(
        `Cross-origin request blocked for ${url}. `
        + 'Set VITE_CORS_PROXY_URL in your environment to route requests through a proxy.',
      );
    }

    const proxyUrl = buildProxyUrl(url);

    try {
      return await fetch(proxyUrl, options);
    } catch (proxyErr) {
      const directMessage = err.message || 'TypeError';
      const proxyMessage = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      throw new Error(
        `Direct fetch failed for ${url}: ${directMessage}. `
        + `Proxy retry failed via ${proxyUrl}: ${proxyMessage}`,
      );
    }
  }
}

export async function scrape(opts: ScrapeOptions): Promise<ScrapeResult> {
  log.info('scraping', { url: opts.url, selector: opts.selector ?? null });

  if (opts.selector && isPdfUrl(opts.url)) {
    throw new Error(`Selectors are only supported for HTML scraping. ${opts.url} looks like a PDF document.`);
  }

  const request = {
    signal: AbortSignal.timeout(opts.timeout ?? 10_000),
  };

  let response: Response;
  try {
    response = await fetchWithCorsProxyFallback(opts.url, request);
  } catch (err) {
    if (err instanceof Error && isPdfUrl(opts.url)) {
      return fetchDocumentFallback(opts.url, request);
    }

    const message = err instanceof Error ? err.message : String(err);
    log.error('scrape fetch failed', { url: opts.url, error: message });
    throw new Error(message);
  }

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : '';
    throw new Error(`Scrape request failed for ${opts.url}: HTTP ${response.status}${statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (isPdfContentType(contentType)) {
    if (opts.selector) {
      throw new Error(`Selectors are only supported for HTML scraping. ${opts.url} returned a PDF document.`);
    }

    return fetchDocumentFallback(opts.url, request);
  }

  if (contentType && !isSupportedContentType(contentType)) {
    throw new Error(`Unsupported content type "${contentType}" for ${opts.url}. Only HTML/text scraping is currently supported.`);
  }

  const html = await response.text();

  if (!opts.selector) {
    log.info('scrape succeeded', { url: opts.url, bytes: html.length });
    return createHtmlResult(contentType, html);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const selected = doc.querySelector(opts.selector);

  if (!selected) {
    throw new Error(`Selector "${opts.selector}" not found for ${opts.url}`);
  }

  const selectedHtml = selected.outerHTML;
  log.info('scrape succeeded', { url: opts.url, selector: opts.selector, bytes: selectedHtml.length });

  return createHtmlResult(contentType, selectedHtml);
}
