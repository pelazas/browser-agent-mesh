import * as Y from 'yjs';
import { createRootDoc } from '@core/blackboard/root-doc';
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
const startTime = Date.now();

const doc: Y.Doc = createRootDoc();

const gossiper = new GossipTelemetry({
  publishIntervalMs: 10_000,
  nodeId,
});

const mcpServer = new MCPServer();

let swarm: SwarmNode | null = null;

let msgCount = { received: 0, sent: 0, errors: 0 };

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

  log.info('network shared worker initialized');
}

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  if (!port) return;

  log.info('new connection to shared worker', { portsAvailable: e.ports.length });

  let agentNodeId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

    if (type === 'ui' && msg.ports?.[0]) {
      handleAgentPort(msg.ports[0], 'ui-main-thread', 'ui');
      log.info('main thread UI port connected', { agentPorts: agentPorts.size + 1 });
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

      log.info('agent connected', { nodeId, role, totalAgents: agentPorts.size });
      return;
    }

    const senderId = registeredNodeId ?? tempId;

    if (type === 'sync_update') {
      const { update } = payload as { update: Uint8Array };
      Y.applyUpdate(doc, update);
      for (const [id, agent] of agentPorts) {
        if (id !== senderId) {
          try {
            agent.port.postMessage({ type: 'sync_update', payload: { update } });
            msgCount.sent++;
          } catch {
            msgCount.errors++;
            log.warn('failed to forward sync_update', { targetAgent: id });
          }
        }
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
