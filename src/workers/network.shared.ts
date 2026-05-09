import * as Y from 'yjs';
import { createRootDoc } from '@core/blackboard/root-doc';
import { SwarmNode } from '@core/network/swarm';
import { MCPServer } from '@core/network/mcp/server';
import { GossipTelemetry } from '@core/network/gossip';
import { generateId } from '@utils/id';
import { createLogger } from '@utils/logging';

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

const nodeId = generateId();
const doc: Y.Doc = createRootDoc();

const gossiper = new GossipTelemetry({
  publishIntervalMs: 10_000,
  nodeId,
});

void new MCPServer();

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

sharedSelf.onconnect = (e: MessageEvent) => {
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
