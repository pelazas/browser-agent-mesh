import * as Y from 'yjs';
import { createRootDoc } from '@core/blackboard/root-doc';
import { SwarmNode } from '@core/network/swarm';
import { MCPServer } from '@core/network/mcp/server';
import type { ToolDescriptor } from '@core/blackboard/schema';
import type { MCPToolCall, MCPToolResult } from '@core/network/mcp/types';
import { GossipTelemetry } from '@core/network/gossip';
import { generateId } from '@utils/id';
import { createLogger } from '@utils/logging';
import { config } from '@/config';

const log = createLogger('network-shared-worker');
const sharedSelf = self as unknown as SharedWorkerGlobalScope;

interface AgentPort {
  port: MessagePort;
  nodeId: string;
  role: string;
}

const agentPorts: Map<string, AgentPort> = new Map();

// Queue for sync updates that arrive before any agent is connected.
// Delivered to each newly connecting agent so late workers do not miss state.
const pendingUpdates: Uint8Array[] = [];
const MAX_PENDING_UPDATES = 100;

// Queue for MessagePorts that connect before init() finishes.
// The first port in this queue receives the 'shared_worker_ready' signal.
const pendingPorts: MessagePort[] = [];
let isReady = false;

const nodeId = generateId();
const doc: Y.Doc = createRootDoc();

const gossiper = new GossipTelemetry({
  publishIntervalMs: 10_000,
  nodeId,
});

const mcpServer = new MCPServer();

let swarm: SwarmNode | null = null;

const msgCount = { received: 0, sent: 0, errors: 0 };

// Pending MCP tool calls awaiting responses from agent workers.
// Keyed by requestId, resolved when the agent sends tool_result back.
const pendingToolCalls = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

async function init(): Promise<void> {
  log.info('network shared worker starting', {
    nodeId,
    rtcPeerConnectionExists: typeof RTCPeerConnection !== 'undefined',
    broadcastChannelExists: typeof BroadcastChannel !== 'undefined',
  });

  gossiper.setPublisher(async (data) => {
    if (swarm) {
      await swarm.publishToGossip(data);
    }
  });

  gossiper.start();

  swarm = new SwarmNode({
    signalingUrl: config.signalingUrl,
    bootstrapPeers: [],
  });
  await swarm.start();

  log.info('swarm node started', { peerId: swarm.getPeerId() });

  swarm.handleMCPStream(async (data: Uint8Array, _peerId: string): Promise<Uint8Array> => {
    const call: MCPToolCall = JSON.parse(new TextDecoder().decode(data)) as MCPToolCall;
    const result: MCPToolResult = await mcpServer.handleToolCall(call);
    return new TextEncoder().encode(JSON.stringify(result));
  });

  log.info('network shared worker initialized');

  // Mark as ready and signal the first queued port (the UI main thread).
  isReady = true;

  // Process any ports that connected while init() was running.
  const queuedPorts = pendingPorts.splice(0, pendingPorts.length);
  for (let i = 0; i < queuedPorts.length; i++) {
    const port = queuedPorts[i];
    if (i === 0) {
      // First port is the UI main thread — send the ready signal.
      port.postMessage({ type: 'shared_worker_ready', payload: { nodeId } });
      port.start();
      log.info('sent ready signal to UI main thread');
    } else {
      // Subsequent ports are normal agent connections.
      const agentNodeId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      handleAgentPort(port, agentNodeId, 'agent');
      port.postMessage({
        type: 'connect_ack',
        payload: { stateVector: Y.encodeStateAsUpdate(doc) },
      });
    }
  }
}

sharedSelf.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  if (!port) return;

  log.info('new connection to shared worker', { portsAvailable: e.ports.length });

  if (!isReady) {
    // init() hasn't finished yet — queue this port for later.
    pendingPorts.push(port);
    return;
  }

  // SharedWorker is ready: normal connection handling.
  const agentNodeId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  handleAgentPort(port, agentNodeId, 'agent');

  const update = Y.encodeStateAsUpdate(doc);
  port.postMessage({
    type: 'connect_ack',
    payload: { stateVector: update },
  });
};

function handleAgentPort(port: MessagePort, tempId: string, defaultRole: string): void {
  let registeredNodeId: string | null = null;

  port.onmessage = (msg: MessageEvent<{ type: string; payload: unknown }>) => {
    const { type, payload } = msg.data;
    msgCount.received++;

    if ((type === 'ui' || type === 'agent') && msg.ports?.[0]) {
      const role = ((payload as { role?: string } | undefined)?.role) ?? defaultRole;
      const routedId = type === 'ui'
        ? 'ui-main-thread'
        : `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      handleAgentPort(msg.ports[0], routedId, role);
      log.info('agent port routed through shared worker', { type, role, agentPorts: agentPorts.size + 1 });
      return;
    }

    if (type === 'connect') {
      const { nodeId, role } = payload as { nodeId: string; role: string };
      registeredNodeId = nodeId;

      agentPorts.delete(tempId);
      agentPorts.set(nodeId, { port, nodeId, role });

      const update = Y.encodeStateAsUpdate(doc);
      port.postMessage({ type: 'connect_ack', payload: { stateVector: update } });
      msgCount.sent++;

      if (pendingUpdates.length > 0) {
        log.info('replaying pending updates to new agent', {
          nodeId,
          count: pendingUpdates.length,
        });
        for (const pendingUpdate of pendingUpdates) {
          try {
            port.postMessage({ type: 'sync_update', payload: { update: pendingUpdate } });
            msgCount.sent++;
          } catch {
            msgCount.errors++;
            log.warn('failed to replay sync_update', { targetAgent: nodeId });
          }
        }
      }

      log.info('agent connected', { nodeId, role, totalAgents: agentPorts.size });
      return;
    }

    const senderId = registeredNodeId ?? tempId;

    if (type === 'publish_tool') {
      const { name, description, schema } = payload as { name: string; description: string; schema: Record<string, unknown> };
      const toolId = `${senderId}:${name}`;
      mcpServer.registerTool(
        { id: toolId, name, description, ownerNodeId: senderId, schema } satisfies ToolDescriptor,
        async (args: Record<string, unknown>) => {
          const requestId = generateId();
          return new Promise<unknown>((resolve, reject) => {
            pendingToolCalls.set(requestId, { resolve, reject });
            port.postMessage({ type: 'call_tool', payload: { name, arguments: args, requestId } });
            log.info('forwarded MCP call to agent', { toolName: name, agentId: senderId, requestId });
          });
        },
      );
      log.info('tool registered via publish_tool', { toolName: name, agentId: senderId });
      return;
    }

    if (type === 'tool_result') {
      const { requestId, result, error } = payload as { requestId: string; result?: unknown; error?: string };
      const pending = pendingToolCalls.get(requestId);
      if (pending) {
        pendingToolCalls.delete(requestId);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
        log.info('MCP tool result received', { requestId, hasError: !!error });
      }
      return;
    }

    if (type === 'sync_update') {
      const { update } = payload as { update: Uint8Array };
      Y.applyUpdate(doc, update);
      let forwardedCount = 0;
      for (const [id, agent] of agentPorts) {
        if (id !== senderId) {
          try {
            agent.port.postMessage({ type: 'sync_update', payload: { update } });
            msgCount.sent++;
            forwardedCount++;
          } catch {
            msgCount.errors++;
            log.warn('failed to forward sync_update', { targetAgent: id });
          }
        }
      }
      if (forwardedCount === 0) {
        if (pendingUpdates.length >= MAX_PENDING_UPDATES) {
          pendingUpdates.shift();
        }
        pendingUpdates.push(update);
        log.info('queued sync_update for late agents', { queueSize: pendingUpdates.length });
      }
    }

    if (type === 'claim') {
      const { workflowId, taskId } = payload as { workflowId: string; taskId: string };
      port.postMessage({ type: 'claim_ack', payload: { workflowId, taskId, acquired: true } });
      msgCount.sent++;
    }
  };

  port.start();
}

init().catch((err) => log.error('init failed', { error: String(err) }));
