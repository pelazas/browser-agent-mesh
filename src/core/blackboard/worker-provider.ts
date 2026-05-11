import * as Y from 'yjs';
import { createRootDoc } from './root-doc';
import type { SyncDebugState } from '@core/network/sync';

export type WorkerMessageType =
  | 'connect'
  | 'connect_ack'
  | 'sync_update'
  | 'observe'
  | 'notify'
  | 'claim'
  | 'claim_ack'
  | 'publish_tool'
  | 'call_tool'
  | 'tool_result'
  | 'peers_update'
  | 'debug_state';

export interface WorkerMessage {
  type: WorkerMessageType;
  payload: unknown;
  requestId?: string;
}

export interface ConnectMessage extends WorkerMessage {
  type: 'connect';
  payload: { nodeId: string; role: string };
}

export interface ConnectAckMessage extends WorkerMessage {
  type: 'connect_ack';
  payload: { stateVector: Uint8Array };
}

export interface SyncUpdateMessage extends WorkerMessage {
  type: 'sync_update';
  payload: { update: Uint8Array };
}

export interface ObserveMessage extends WorkerMessage {
  type: 'observe';
  payload: { path: string };
}

export interface NotifyMessage extends WorkerMessage {
  type: 'notify';
  payload: { path: string; value: unknown };
}

export interface ClaimMessage extends WorkerMessage {
  type: 'claim';
  payload: { workflowId: string; taskId: string };
}

export interface ClaimAckMessage extends WorkerMessage {
  type: 'claim_ack';
  payload: { workflowId: string; taskId: string; acquired: boolean };
}

export class WorkerSyncProvider {
  private doc: Y.Doc;
  private port: MessagePort;
  private pendingObserves: Map<string, (value: unknown) => void> = new Map();
  onPeersUpdate?: (count: number) => void;
  onDebugState?: (state: SyncDebugState) => void;

  constructor(doc: Y.Doc, port: MessagePort) {
    this.doc = doc;
    this.port = port;

    // Set handler BEFORE start() so queued messages (e.g. connect_ack)
    // are not lost if the browser delivers them synchronously on start().
    this.port.onmessage = (e: MessageEvent<WorkerMessage>) => {
      this.handleMessage(e.data);
    };

    this.port.start();

    this.doc.on('update', (update: Uint8Array) => {
      this.port.postMessage({
        type: 'sync_update',
        payload: { update },
      } satisfies SyncUpdateMessage);
    });
  }

  connect(nodeId: string, role: string): void {
    this.port.postMessage({
      type: 'connect',
      payload: { nodeId, role },
    } satisfies ConnectMessage);

    // Push the current local snapshot immediately so peers do not depend on a
    // future mutation to discover state that already existed before connect().
    this.port.postMessage({
      type: 'sync_update',
      payload: { update: Y.encodeStateAsUpdate(this.doc) },
    } satisfies SyncUpdateMessage);
  }

  observe(path: string, callback: (value: unknown) => void): void {
    this.pendingObserves.set(path, callback);
    this.port.postMessage({
      type: 'observe',
      payload: { path },
    } satisfies ObserveMessage);
  }

  claim(workflowId: string, taskId: string): void {
    this.port.postMessage({
      type: 'claim',
      payload: { workflowId, taskId },
    } satisfies ClaimMessage);
  }

  publishTool(name: string, description: string, schema: Record<string, unknown>): void {
    this.port.postMessage({
      type: 'publish_tool',
      payload: { name, description, schema },
    } satisfies WorkerMessage);
  }

  destroy(): void {
    this.port.close();
    this.pendingObserves.clear();
  }

  private handleMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case 'connect_ack': {
        const ack = msg as ConnectAckMessage;
        if (ack.payload.stateVector.length > 0) {
          Y.applyUpdate(this.doc, ack.payload.stateVector);
        }
        break;
      }
      case 'sync_update': {
        const sync = msg as SyncUpdateMessage;
        Y.applyUpdate(this.doc, sync.payload.update);
        break;
      }
      case 'notify': {
        const notify = msg as NotifyMessage;
        const cb = this.pendingObserves.get(notify.payload.path);
        cb?.(notify.payload.value);
        break;
      }
      case 'claim_ack': {
        void (msg as ClaimAckMessage);
        break;
      }
      case 'peers_update': {
        const p = msg as { type: 'peers_update'; payload: { count: number } };
        this.onPeersUpdate?.(p.payload.count);
        break;
      }
      case 'debug_state': {
        const d = msg as { type: 'debug_state'; payload: { state: SyncDebugState; workerNodeId: string; startTime: number; msgCount: unknown } };
        this.onDebugState?.(d.payload.state);
        break;
      }
    }
  }
}

export function createRootDocForSharedWorker(): Y.Doc {
  return createRootDoc();
}

export function createLocalDoc(): Y.Doc {
  return new Y.Doc();
}
