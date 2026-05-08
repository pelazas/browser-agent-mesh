import { createLogger } from '@utils/logging';

const log = createLogger('scraper');

export interface ScrapeOptions {
  url: string;
  selector?: string;
  timeout?: number;
}

export async function scrape(opts: ScrapeOptions): Promise<string> {
  log.info('scraping', { url: opts.url });

  try {
    const response = await fetch(opts.url, {
      headers: {
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(opts.timeout ?? 10_000),
    });

    const html = await response.text();
    log.info('scrape succeeded', { url: opts.url, bytes: html.length });

    return html;
  } catch (err) {
    log.error('scrape failed', { url: opts.url, error: String(err) });
    throw err;
  }
}
