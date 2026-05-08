import type { ToolDescriptor } from '@core/blackboard/schema';
import type { MCPToolCall, MCPToolResult } from './types';
import { createLogger } from '@utils/logging';

const log = createLogger('mcp-client');

export interface RemoteToolProxy {
  descriptor: ToolDescriptor;
  call(args: Record<string, unknown>): Promise<MCPToolResult>;
}

export class MCPClient {
  private tools: Map<string, RemoteToolProxy> = new Map();
  private pending: Map<string, (result: MCPToolResult) => void> = new Map();
  private sendFn?: (msg: Uint8Array) => void;

  setSender(fn: (msg: Uint8Array) => void): void {
    this.sendFn = fn;
  }

  registerRemoteTools(tools: ToolDescriptor[]): void {
    for (const t of tools) {
      this.tools.set(t.id, {
        descriptor: t,
        call: (args) => this.callTool(t.id, args),
      });
    }
    log.info('remote tools discovered', { count: tools.length });
  }

  unregisterRemoteTool(toolId: string): void {
    this.tools.delete(toolId);
  }

  listRemoteTools(): ToolDescriptor[] {
    return Array.from(this.tools.values()).map((p) => p.descriptor);
  }

  getTool(name: string): RemoteToolProxy | undefined {
    return this.tools.get(name);
  }

  async callTool(toolId: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const proxy = this.tools.get(toolId);
    if (!proxy) {
      return { callId: '', content: null, error: `remote tool not found: ${toolId}` };
    }

    const call: MCPToolCall = {
      id: crypto.randomUUID(),
      name: proxy.descriptor.name,
      arguments: args,
    };

    return new Promise<MCPToolResult>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(call.id);
        resolve({ callId: call.id, content: null, error: 'tool call timed out' });
      }, 30_000);

      this.pending.set(call.id, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });

      this.sendMessage({ type: 'call_tool', call });
    });
  }

  handleResponse(result: MCPToolResult): void {
    const resolve = this.pending.get(result.callId);
    if (resolve) {
      this.pending.delete(result.callId);
      resolve(result);
    }
  }

  private sendMessage(msg: unknown): void {
    if (this.sendFn) {
      this.sendFn(new TextEncoder().encode(JSON.stringify(msg)));
    } else {
      log.warn('no sender set, message dropped', { msg });
    }
  }
}
