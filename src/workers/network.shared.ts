import * as Y from 'yjs';
import { YjsSyncProvider, type SyncDebugState } from '@core/network/sync';
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

const startTime = Date.now();

log.info('shared worker context info', {
  rtcPeerConnectionExists: typeof RTCPeerConnection !== 'undefined',
  broadcastChannelExists: typeof BroadcastChannel !== 'undefined',
  navigatorExists: typeof navigator !== 'undefined',
  nodeId,
});

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

// Message counters for observability
let msgCount = { received: 0, sent: 0, errors: 0 };

function broadcastDebugState(state: SyncDebugState): void {
  const msg = { type: 'debug_state', payload: { state, workerNodeId: nodeId, startTime, msgCount } };
  for (const [, agent] of agentPorts) {
    try {
      agent.port.postMessage(msg);
    } catch {
      // Port might be closed
    }
  }
}

function broadcastPeerCount(count: number): void {
  const msg = { type: 'peers_update', payload: { count } };
  for (const [, agent] of agentPorts) {
    try {
      agent.port.postMessage(msg);
    } catch {
      // Port might be closed
    }
  }
}

async function init(): Promise<void> {
  log.info('network shared worker starting', { nodeId, url: signalingUrl, room: roomName });

  sync.registerSelfAsNode('sentinel', null);

  const doc = sync.getDoc();

  gossiper.setPublisher(async (data) => {
    if (swarm) {
      await swarm.publishToGossip(data);
    }
  });

  gossiper.start();

  sync.onPeersChanged((count) => {
    log.info('peer count changed', { count });
    broadcastPeerCount(count);
  });

  // Broadcast full debug state every 2 seconds
  setInterval(() => {
    const state = sync.getDebugState();
    broadcastDebugState(state);
    broadcastPeerCount(sync.getPeerCount());
  }, 2000);

  // Log connection state every 10 seconds for visibility
  setInterval(() => {
    const state = sync.getDebugState();
    log.info('connection summary', {
      signalingConnected: state.signalingConnected,
      synced: state.synced,
      webrtcPeers: state.webrtcPeers,
      awarenessStates: state.awarenessStates,
      peerCount: sync.getPeerCount(),
      rtcAvailable: state.rtcPeerConnectionAvailable,
      agentPortCount: agentPorts.size,
      uptime: (Date.now() - startTime) / 1000,
    });
  }, 10_000);

  log.info('network shared worker initialized');
}

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  if (!port) return;

  log.info('new connection to shared worker', { portsAvailable: e.ports.length });

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

      sync.registerSelfAsNode(role, null);

      const update = Y.encodeStateAsUpdate(sync.getDoc());
      port.postMessage({ type: 'connect_ack', payload: { stateVector: update } });
      msgCount.sent++;

      // Send initial debug state immediately
      const debugState = sync.getDebugState();
      port.postMessage({
        type: 'debug_state',
        payload: { state: debugState, workerNodeId: nodeId, startTime, msgCount },
      });

      log.info('agent connected', { nodeId, role, totalAgents: agentPorts.size });
      return;
    }

    // Use registeredNodeId or tempId for messages before connect
    const senderId = registeredNodeId ?? tempId;

    if (type === 'sync_update') {
      const { update } = payload as { update: Uint8Array };
      Y.applyUpdate(sync.getDoc(), update);
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
