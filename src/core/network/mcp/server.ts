import type { ToolDescriptor } from '@core/blackboard/schema';
import type { MCPToolCall, MCPToolResult } from './types';
import { createLogger } from '@utils/logging';

const log = createLogger('mcp-server');

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export class MCPServer {
  private tools: Map<string, ToolDescriptor> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();
  private onToolRegistered?: (tool: ToolDescriptor) => void;

  onRegister(cb: (tool: ToolDescriptor) => void): void {
    this.onToolRegistered = cb;
  }

  registerTool(descriptor: ToolDescriptor, handler: ToolHandler): void {
    this.tools.set(descriptor.id, descriptor);
    this.handlers.set(descriptor.id, handler);
    this.onToolRegistered?.(descriptor);
    log.info('tool registered', { id: descriptor.id, name: descriptor.name });
  }

  unregisterTool(toolId: string): void {
    this.tools.delete(toolId);
    this.handlers.delete(toolId);
  }

  listTools(): ToolDescriptor[] {
    return Array.from(this.tools.values());
  }

  async handleToolCall(call: MCPToolCall): Promise<MCPToolResult> {
    const handler = this.handlers.get(call.name);
    if (!handler) {
      return { callId: call.id, content: null, error: `tool not found: ${call.name}` };
    }

    try {
      const result = await handler(call.arguments);
      return { callId: call.id, content: result };
    } catch (err) {
      log.error('tool execution failed', { name: call.name, error: String(err) });
      return { callId: call.id, content: null, error: String(err) };
    }
  }

  getTools(): Map<string, ToolDescriptor> {
    return this.tools;
  }
}
