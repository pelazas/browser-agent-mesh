import type * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { createRootDoc, registerNode } from '@core/blackboard/root-doc';
import { createLogger } from '@utils/logging';
import { generateId } from '@utils/id';

const log = createLogger('sync-provider');

export interface SyncConfig {
  signalingUrl: string;
  roomName: string;
}

export interface SyncDebugState {
  signalingConnected: boolean;
  synced: boolean;
  webrtcPeers: string[];
  bcPeers: string[];
  awarenessStates: number;
  localClientId: number;
  nodeId: string;
  roomName: string;
  signalingUrl: string;
  lastEvent: { time: number; event: string; detail: unknown } | null;
  eventTimeline: Array<{ time: number; event: string; detail: unknown }>;
  rtcPeerConnectionAvailable: boolean;
  createdAt: number;
}

export class YjsSyncProvider {
  private doc: Y.Doc;
  private provider: WebrtcProvider;
  private nodeId: string;
  public debugState: SyncDebugState;

  constructor(config: SyncConfig) {
    this.doc = createRootDoc();
    this.nodeId = generateId();

    const rtcAvailable = typeof RTCPeerConnection !== 'undefined';
    log.info('RTCPeerConnection available in this context', { available: rtcAvailable });

    if (!rtcAvailable) {
      log.error('RTCPeerConnection not available — WebRTC peer connections will fail');
    }

    this.debugState = {
      signalingConnected: false,
      synced: false,
      webrtcPeers: [],
      bcPeers: [],
      awarenessStates: 0,
      localClientId: this.doc.clientID,
      nodeId: this.nodeId,
      roomName: config.roomName,
      signalingUrl: config.signalingUrl,
      lastEvent: null,
      eventTimeline: [],
      rtcPeerConnectionAvailable: rtcAvailable,
      createdAt: Date.now(),
    };

    this.provider = new WebrtcProvider(config.roomName, this.doc, {
      signaling: [config.signalingUrl],
    });

    this.provider.on('status', (event: { connected: boolean }) => {
      const ts = Date.now();
      this.debugState.signalingConnected = event.connected;
      this.debugState.lastEvent = { time: ts, event: 'status', detail: event };
      this.debugState.eventTimeline.push({ time: ts, event: 'status', detail: event });
      log.info('signaling status', {
        connected: event.connected,
        room: config.roomName,
        url: config.signalingUrl,
      });
    });

    this.provider.on('peers', (event: { webrtcPeers: string[]; bcPeers: string[] }) => {
      const ts = Date.now();
      this.debugState.webrtcPeers = [...event.webrtcPeers];
      this.debugState.bcPeers = [...event.bcPeers];
      this.debugState.awarenessStates = this.provider.awareness.getStates().size;
      this.debugState.lastEvent = { time: ts, event: 'peers', detail: event };
      this.debugState.eventTimeline.push({ time: ts, event: 'peers', detail: event });
      log.info('WebRTC peers changed', {
        webrtcCount: event.webrtcPeers.length,
        bcCount: event.bcPeers.length,
        webrtcPeers: event.webrtcPeers,
        awarenessStates: this.debugState.awarenessStates,
      });
    });

    this.provider.on('synced', (event: { synced: boolean }) => {
      const ts = Date.now();
      this.debugState.synced = event.synced;
      this.debugState.lastEvent = { time: ts, event: 'synced', detail: event };
      this.debugState.eventTimeline.push({ time: ts, event: 'synced', detail: event });
      log.info('sync document synced', { synced: event.synced });
    });

    const awareness = this.provider.awareness;
    awareness.on('update', () => {
      const states = awareness.getStates();
      this.debugState.awarenessStates = states.size;
      let remoteCount = 0;
      const remoteIds: number[] = [];
      states.forEach((state, clientId) => {
        if (clientId !== this.doc.clientID) {
          remoteCount++;
          remoteIds.push(clientId);
        }
      });
      if (remoteIds.length > 0) {
        log.info('awareness updated', {
          totalStates: states.size,
          remoteStates: remoteIds,
        });
      }
    });

    log.info('sync provider initialized', {
      room: config.roomName,
      nodeId: this.nodeId,
      clientId: this.doc.clientID,
    });
  }

  getDoc(): Y.Doc {
    return this.doc;
  }

  getNodeId(): string {
    return this.nodeId;
  }

  getProvider(): WebrtcProvider {
    return this.provider;
  }

  getPeerCount(): number {
    return this.provider.awareness.getStates().size - 1;
  }

  getDebugState(): SyncDebugState {
    return this.debugState;
  }

  onPeersChanged(callback: (count: number) => void): () => void {
    const handler = () => {
      callback(this.getPeerCount());
    };
    this.provider.on('peers', handler);
    return () => {
      this.provider.off('peers', handler);
    };
  }

  setLocalState(key: string, value: unknown): void {
    const state = this.provider.awareness.getLocalState() ?? {};
    this.provider.awareness.setLocalState({ ...state, [key]: value });
  }

  getRemoteState(nodeId: string): unknown {
    const states = this.provider.awareness.getStates();
    return states.get(nodeId);
  }

  getAllStates(): Map<number, unknown> {
    return this.provider.awareness.getStates();
  }

  registerSelfAsNode(role: string, gpu: unknown | null): void {
    const nodeId = this.getNodeId();
    registerNode(this.doc, nodeId, role, gpu);
    this.setLocalState('role', role);
    this.setLocalState('nodeId', nodeId);
  }

  destroy(): void {
    this.provider.destroy();
    this.doc.destroy();
  }
}


