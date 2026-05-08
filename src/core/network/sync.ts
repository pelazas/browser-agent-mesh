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

export class YjsSyncProvider {
  private doc: Y.Doc;
  private provider: WebrtcProvider;
  private nodeId: string;

  constructor(config: SyncConfig) {
    this.doc = createRootDoc();
    this.nodeId = generateId();
    this.provider = new WebrtcProvider(config.roomName, this.doc, {
      signaling: [config.signalingUrl],
    });

    this.provider.on('status', (event: { connected: boolean }) => {
      log.info('sync status changed', { connected: event.connected });
    });

    this.provider.on('peers', (event: { webrtcPeers: string[] }) => {
      log.debug('peers changed', { count: event.webrtcPeers.length });
    });

    log.info('sync provider initialized', { room: config.roomName, nodeId: this.nodeId });
  }

  getDoc(): Y.Doc {
    return this.doc;
  }

  getNodeId(): string {
    return this.nodeId;
  }

  getPeerCount(): number {
    return this.provider.awareness.getStates().size - 1;
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


