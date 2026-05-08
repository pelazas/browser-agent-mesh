import * as Y from 'yjs';
import { YjsSyncProvider } from '@core/network/sync';
import { SwarmNode } from '@core/network/swarm';
import { MCPServer } from '@core/network/mcp/server';
import { GossipTelemetry } from '@core/network/gossip';
import { generateId } from '@utils/id';
import { createLogger } from '@utils/logging';

const log = createLogger('network-shared-worker');

interface AgentPort {
  port: MessagePort;
  nodeId: string;
  role: string;
}

const agentPorts: Map<string, AgentPort> = new Map();

const nodeId = generateId();
const signalingUrl = import.meta.env.VITE_SIGNALING_URL ?? 'ws://localhost:4444';
const roomName = 'browser-agent-mesh';

const sync = new YjsSyncProvider({
  signalingUrl,
  roomName,
});

const gossiper = new GossipTelemetry({
  publishIntervalMs: 10_000,
  nodeId,
});

const mcpServer = new MCPServer();

let swarm: SwarmNode | null = null;

function broadcastPeerCount(count: number): void {
  const msg = { type: 'peers_update', payload: { count } };
  for (const [, agent] of agentPorts) {
    agent.port.postMessage(msg);
  }
}

async function init(): Promise<void> {
  log.info('network shared worker starting', { nodeId });

  sync.registerSelfAsNode('sentinel', null);

  const doc = sync.getDoc();

  gossiper.setPublisher(async (data) => {
    if (swarm) {
      await swarm.publishToGossip(data);
    }
  });

  gossiper.start();

  sync.onPeersChanged((count) => {
    broadcastPeerCount(count);
  });

  // Periodic fallback: broadcast peer count every 2 seconds
  // in case the y-webrtc event fires before agent ports are connected
  setInterval(() => {
    broadcastPeerCount(sync.getPeerCount());
  }, 2000);

  log.info('network shared worker initialized');
}

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  if (!port) return;

  // We don't know nodeId/role yet — wait for 'connect' message
  let agentNodeId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  handleAgentPort(port, agentNodeId, 'agent');

  // Send initial snapshot
  const update = Y.encodeStateAsUpdate(sync.getDoc());
  port.postMessage({
    type: 'connect_ack',
    payload: { stateVector: update },
  });
};

function handleAgentPort(port: MessagePort, tempId: string, defaultRole: string): void {
  let registeredNodeId: string | null = null;

  port.onmessage = (msg: MessageEvent<{ type: string; payload: unknown }>) => {
    const { type, payload } = msg.data;

    if (type === 'ui' && msg.ports?.[0]) {
      handleAgentPort(msg.ports[0], 'ui-main-thread', 'ui');
      log.info('main thread UI port connected');
      return;
    }

    if (type === 'connect') {
      const { nodeId, role } = payload as { nodeId: string; role: string };
      registeredNodeId = nodeId;

      agentPorts.delete(tempId);
      agentPorts.set(nodeId, { port, nodeId, role });

      sync.registerSelfAsNode(role, null);

      // Send initial state snapshot
      const update = Y.encodeStateAsUpdate(sync.getDoc());
      port.postMessage({ type: 'connect_ack', payload: { stateVector: update } });

      log.info('agent connected', { nodeId, role });
      return;
    }

    // Use registeredNodeId or tempId for messages before connect
    const senderId = registeredNodeId ?? tempId;

    if (type === 'sync_update') {
      const { update } = payload as { update: Uint8Array };
      Y.applyUpdate(sync.getDoc(), update);
      for (const [id, agent] of agentPorts) {
        if (id !== senderId) {
          agent.port.postMessage({ type: 'sync_update', payload: { update } });
        }
      }
    }

    if (type === 'claim') {
      const { workflowId, taskId } = payload as { workflowId: string; taskId: string };
      port.postMessage({ type: 'claim_ack', payload: { workflowId, taskId, acquired: true } });
    }
  };
  port.start();
}

init().catch((err) => log.error('init failed', { error: String(err) }));
