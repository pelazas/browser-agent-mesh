import { createLogger } from '@utils/logging';

const log = createLogger('scraper');

export interface ScrapeOptions {
  url: string;
  selector?: string;
  timeout?: number;
}

export async function scrape(opts: ScrapeOptions): Promise<string> {
  log.info('scraping', { url: opts.url, selector: opts.selector ?? null });

  try {
    const response = await fetch(opts.url, {
      headers: {
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(opts.timeout ?? 10_000),
    });

    if (!response.ok) {
      const statusText = response.statusText ? ` ${response.statusText}` : '';
      throw new Error(`Scrape request failed for ${opts.url}: HTTP ${response.status}${statusText}`);
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
  } catch (err) {
    log.error('scrape failed', { url: opts.url, error: String(err) });
    throw err;
  }
}
