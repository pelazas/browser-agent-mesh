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
const roomName = 'legion-mesh';

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
  log.info('network shared worker initialized');
}

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  if (!port) return;

  let agentNodeId: string | null = null;

  port.onmessage = (msg: MessageEvent<{ type: string; payload: unknown }>) => {
    const { type, payload } = msg.data;

    if (type === 'connect') {
      agentNodeId = (payload as { nodeId: string }).nodeId;
      const role = (payload as { role: string }).role;

      agentPorts.set(agentNodeId, { port, nodeId: agentNodeId, role });

      const update = Y.encodeStateAsUpdate(sync.getDoc());
      port.postMessage({
        type: 'connect_ack',
        payload: { stateVector: update },
      });

      sync.registerSelfAsNode(role, null);

      log.info('agent connected', { nodeId: agentNodeId, role });
    }

    if (type === 'sync_update') {
      const { update } = payload as { update: Uint8Array };
      Y.applyUpdate(sync.getDoc(), update);

      // Relay to all other agents
      for (const [id, agent] of agentPorts) {
        if (id !== agentNodeId) {
          agent.port.postMessage({
            type: 'sync_update',
            payload: { update },
          });
        }
      }
    }

    if (type === 'claim') {
      const { workflowId, taskId } = payload as { workflowId: string; taskId: string };
      // Relay claim request to be evaluated on the authoritative doc
      // For now, always grant
      port.postMessage({
        type: 'claim_ack',
        payload: { workflowId, taskId, acquired: true },
      });
    }
  };

  port.start();

  // Send existing doc state
  const update = Y.encodeStateAsUpdate(sync.getDoc());
  port.postMessage({
    type: 'connect_ack',
    payload: { stateVector: update },
  });
};

init().catch((err) => log.error('init failed', { error: String(err) }));
