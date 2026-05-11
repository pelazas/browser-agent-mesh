import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { WorkerSyncProvider } from '@core/blackboard/worker-provider';

describe('WorkerSyncProvider sync pipe timing', () => {
  it('applies connect_ack even if port.start races with onmessage setup', () => {
    // Simulate a MessagePort that delivers queued messages synchronously
    // when start() is called, before onmessage is set (the real browser race).
    const queuedMessages: Array<{ data: unknown }> = [];
    let started = false;
    let handler: ((e: MessageEvent) => void) | null = null;

    const mockPort = {
      start: vi.fn(() => {
        started = true;
        // Synchronously drain queued messages before onmessage is set
        // This simulates the browser delivering messages immediately on start()
        const toDeliver = [...queuedMessages];
        queuedMessages.length = 0;
        for (const msg of toDeliver) {
          if (handler) {
            handler(msg as MessageEvent);
          }
        }
      }),
      postMessage: vi.fn(),
      close: vi.fn(),
      get onmessage() {
        return handler;
      },
      set onmessage(fn: ((e: MessageEvent) => void) | null) {
        handler = fn;
      },
      _queueMessage: (data: unknown) => {
        queuedMessages.push({ data } as MessageEvent);
        if (started && handler) {
          handler({ data } as MessageEvent);
        }
      },
    } as unknown as MessagePort;

    // Create a doc with some state
    const sharedDoc = new Y.Doc();
    const rootMap = sharedDoc.getMap('root');
    rootMap.set('test', 'value');

    // Queue a connect_ack BEFORE the provider is created
    const stateVector = Y.encodeStateAsUpdate(sharedDoc);
    (mockPort as unknown as { _queueMessage: (d: unknown) => void })._queueMessage({
      type: 'connect_ack',
      payload: { stateVector },
    });

    // Now create the provider. With the old code (start before onmessage),
    // the queued connect_ack would be lost.
    const agentDoc = new Y.Doc();
    const provider = new WorkerSyncProvider(agentDoc, mockPort);

    // The agent doc should have received the state
    expect((agentDoc.getMap('root').get('test') as string | undefined)).toBe('value');
  });

  it('does not lose connect_ack when message delivery is deferred', async () => {
    const queuedMessages: Array<{ data: unknown }> = [];
    let started = false;
    let handler: ((e: MessageEvent) => void) | null = null;

    const mockPort = {
      start: vi.fn(() => {
        started = true;
        // Defer delivery to next microtask (closer to real browser behavior)
        Promise.resolve().then(() => {
          const toDeliver = [...queuedMessages];
          queuedMessages.length = 0;
          for (const msg of toDeliver) {
            if (handler) {
              handler(msg as MessageEvent);
            }
          }
        });
      }),
      postMessage: vi.fn(),
      close: vi.fn(),
      get onmessage() {
        return handler;
      },
      set onmessage(fn: ((e: MessageEvent) => void) | null) {
        handler = fn;
      },
      _queueMessage: (data: unknown) => {
        queuedMessages.push({ data } as MessageEvent);
        if (started && handler) {
          Promise.resolve().then(() => {
            handler({ data } as MessageEvent);
          });
        }
      },
    } as unknown as MessagePort;

    const sharedDoc = new Y.Doc();
    sharedDoc.getMap('root').set('test', 'value');

    (mockPort as unknown as { _queueMessage: (d: unknown) => void })._queueMessage({
      type: 'connect_ack',
      payload: { stateVector: Y.encodeStateAsUpdate(sharedDoc) },
    });

    const agentDoc = new Y.Doc();
    const provider = new WorkerSyncProvider(agentDoc, mockPort);

    // Wait for deferred microtask delivery
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should still work because onmessage is set before start()
    expect(agentDoc.getMap('root').get('test')).toBe('value');
  });

  it('syncs already-present local state when connecting after doc hydration', () => {
    const sharedDoc = new Y.Doc();
    let handler: ((e: MessageEvent) => void) | null = null;

    const mockPort = {
      start: vi.fn(),
      close: vi.fn(),
      get onmessage() {
        return handler;
      },
      set onmessage(fn: ((e: MessageEvent) => void) | null) {
        handler = fn;
      },
      postMessage: vi.fn((message: { type: string; payload: unknown }) => {
        if (message.type === 'connect') {
          handler?.({
            data: {
              type: 'connect_ack',
              payload: { stateVector: Y.encodeStateAsUpdate(sharedDoc) },
            },
          } as MessageEvent);
          return;
        }

        if (message.type === 'sync_update') {
          const payload = message.payload as { update: Uint8Array };
          Y.applyUpdate(sharedDoc, payload.update);
        }
      }),
    } as unknown as MessagePort;

    const mainDoc = new Y.Doc();
    mainDoc.getMap('root').set('workflowId', 'wf-1');

    const provider = new WorkerSyncProvider(mainDoc, mockPort);
    provider.connect('ui-main-thread', 'ui');

    expect(sharedDoc.getMap('root').get('workflowId')).toBe('wf-1');
  });
});
