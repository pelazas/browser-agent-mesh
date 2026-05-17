import { createLogger } from '@utils/logging';
import { BridgeAgent } from '@agents/bridge/bridge';
import { scrape } from '@agents/bridge/scraper';
import type { ScrapeResult } from '@agents/bridge/scraper';

const log = createLogger('bridge-worker');

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

class BridgeWorkerAgent extends BridgeAgent {
  private toolHandlers = new Map<string, ToolHandler>();

  registerTools(): void {
    this.registerToolHandler('web_scrape', 'Scrape content from a URL', {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to scrape' },
        selector: { type: 'string', description: 'CSS selector to extract' },
      },
      required: ['url'],
    }, async (args) => {
      const url = String(args.url ?? '');
      const selector = args.selector ? String(args.selector) : undefined;
      const result: ScrapeResult = await scrape({ url, selector });
      return {
        type: 'scrape_result',
        url,
        contentType: result.contentType,
        format: result.format,
        content: result.content,
        bytes: result.content.length,
        selector: selector ?? null,
      };
    });

    this.registerToolHandler('opfs_read', 'Read a file from OPFS storage', {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to OPFS root' },
      },
      required: ['path'],
    }, async (args) => {
      // OPFS read — uses the bridge worker's OPFS access
      const path = String(args.path ?? '');
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(path);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return { path, content: text, size: text.length };
      } catch (err) {
        throw new Error(`OPFS read failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    this.registerToolHandler('opfs_write', 'Write a file to OPFS storage', {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to OPFS root' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    }, async (args) => {
      const path = String(args.path ?? '');
      const content = String(args.content ?? '');
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(path, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return { path, written: content.length };
      } catch (err) {
        throw new Error(`OPFS write failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  private registerToolHandler(
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: ToolHandler,
  ): void {
    this.publishTool(name, description, schema);
    this.toolHandlers.set(name, handler);
  }

  wireMCPHandler(): void {
    if (!this.provider) return;
    this.provider.onToolCall = async (name: string, args: Record<string, unknown>, requestId: string) => {
      const handler = this.toolHandlers.get(name);
      if (!handler) {
        this.provider!.sendToolResult(requestId, null, `tool not found: ${name}`);
        return;
      }
      try {
        const result = await handler(args);
        this.provider!.sendToolResult(requestId, result);
      } catch (err) {
        this.provider!.sendToolResult(requestId, null, err instanceof Error ? err.message : String(err));
      }
    };
    log.info('MCP handler wired', { tools: Array.from(this.toolHandlers.keys()) });
  }
}

let agent: BridgeWorkerAgent | null = null;

function init(port: MessagePort, tabId: string): void {
  agent = new BridgeWorkerAgent(tabId);
  agent.connect(port);
  agent.registerTools();
  agent.wireMCPHandler();
  void agent.start().catch((err) => log.error('agent failed', { error: String(err) }));

  log.info('bridge worker initialized');
  self.postMessage({ type: 'ready', role: 'bridge' });
}

self.onmessage = (e: MessageEvent<{ type: string; port: MessagePort; tabId: string }>) => {
  if (e.data.type === 'init') {
    init(e.data.port, e.data.tabId);
  }
};
