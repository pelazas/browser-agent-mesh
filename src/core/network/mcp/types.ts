import type { ToolDescriptor } from '@core/blackboard/schema';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  callId: string;
  content: unknown;
  error?: string;
}

export interface MCPListToolsRequest {
  type: 'list_tools';
}

export interface MCPListToolsResponse {
  type: 'list_tools_response';
  tools: ToolDescriptor[];
}

export interface MCPCallToolRequest {
  type: 'call_tool';
  call: MCPToolCall;
}

export interface MCPCallToolResponse {
  type: 'call_tool_response';
  result: MCPToolResult;
}

export type MCPMessage =
  | MCPListToolsRequest
  | MCPListToolsResponse
  | MCPCallToolRequest
  | MCPCallToolResponse;

export const MCP_PROTOCOL = '/legion-mcp/1.0.0';
export const GOSSIP_TOPIC = '/legion-telemetry/1.0.0';
