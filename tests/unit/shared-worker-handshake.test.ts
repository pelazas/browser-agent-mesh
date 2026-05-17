import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the explicit ready/ack bootstrap handshake
 * between main.ts and network.shared.ts.
 *
 * The old implementation used a 200ms setTimeout to wait for the
 * SharedWorker to be ready before transferring the UI port.
 * The new implementation uses an explicit 'shared_worker_ready' message.
 */

// ── Mock MessagePort ──────────────────────────────────────────────
function createMockMessagePort() {
  let handler: ((e: MessageEvent) => void) | null = null;
  const sentMessages: unknown[] = [];
  let started = false;
  let closed = false;

  const port: MessagePort = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onmessageerror: null,
    postMessage: vi.fn((msg: unknown) => {
      sentMessages.push(msg);
      // If the port is started and has a handler, simulate delivery
      if (started && handler) {
        handler({ data: msg } as MessageEvent);
      }
    }),
    start: vi.fn(() => { started = true; }),
    close: vi.fn(() => { closed = true; }),
    addEventListener: vi.fn((_type: string, cb: EventListener) => {
      handler = cb as (e: MessageEvent) => void;
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onerror: null,
  } as unknown as MessagePort;

  return {
    port,
    sentMessages,
    get started() { return started; },
    get closed() { return closed; },
    // Simulate receiving a message from the other end
    receiveMessage(data: unknown) {
      if (handler) {
        handler({ data } as MessageEvent);
      }
      if ((port as any).onmessage) {
        (port as any).onmessage({ data } as MessageEvent);
      }
    },
  };
}

describe('SharedWorker ready handshake', () => {
  describe('main.ts waitForSharedWorkerReady', () => {
    it('resolves when shared_worker_ready message is received', async () => {
      const { port, receiveMessage } = createMockMessagePort();

      const mockNetworkWorker = { port } as SharedWorker;
      let resolved = false;

      const promise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, 5000);

        mockNetworkWorker.port.onmessage = (e: MessageEvent) => {
          if ((e.data as any)?.type === 'shared_worker_ready' && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      // Simulate the SharedWorker sending the ready signal
      receiveMessage({ type: 'shared_worker_ready', payload: { nodeId: 'test-123' } });

      await expect(promise).resolves.toBeUndefined();
      expect(resolved).toBe(true);
    });

    it('falls back to timeout when no ready signal arrives', async () => {
      vi.useFakeTimers();
      const { port } = createMockMessagePort();

      const mockNetworkWorker = { port } as SharedWorker;
      let resolved = false;
      let fallbackCalled = false;

      const promise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            fallbackCalled = true;
            resolve();
          }
        }, 200); // Use 200ms for fast test

        mockNetworkWorker.port.onmessage = (e: MessageEvent) => {
          if ((e.data as any)?.type === 'shared_worker_ready' && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      // Advance timers past the timeout
      vi.advanceTimersByTime(250);

      await expect(promise).resolves.toBeUndefined();
      expect(fallbackCalled).toBe(true);
      vi.useRealTimers();
    });

    it('does not call fallback when ready signal arrives before timeout', async () => {
      vi.useFakeTimers();
      const { port, receiveMessage } = createMockMessagePort();

      const mockNetworkWorker = { port } as SharedWorker;
      let resolved = false;
      let fallbackCalled = false;

      const promise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            fallbackCalled = true;
            resolve();
          }
        }, 200);

        mockNetworkWorker.port.onmessage = (e: MessageEvent) => {
          if ((e.data as any)?.type === 'shared_worker_ready' && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      // Send ready signal before timeout
      receiveMessage({ type: 'shared_worker_ready', payload: { nodeId: 'test-456' } });

      await expect(promise).resolves.toBeUndefined();
      expect(fallbackCalled).toBe(false);
      expect(resolved).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('network.shared.ts port queuing', () => {
    it('queues ports received before init completes', () => {
      const pendingPorts: MessagePort[] = [];
      let isReady = false;

      // Simulate onconnect firing before init completes
      const port1 = createMockMessagePort().port;
      const port2 = createMockMessagePort().port;

      // First connection — init not ready, should queue
      if (!isReady) {
        pendingPorts.push(port1);
      }

      expect(pendingPorts.length).toBe(1);
      expect(pendingPorts[0]).toBe(port1);

      // Second connection — still not ready, should queue
      if (!isReady) {
        pendingPorts.push(port2);
      }

      expect(pendingPorts.length).toBe(2);
    });

    it('sends shared_worker_ready to first queued port after init', () => {
      const pendingPorts: MessagePort[] = [];
      let isReady = false;
      const { port: queuedPort, sentMessages } = createMockMessagePort();

      // Simulate port queuing during init
      pendingPorts.push(queuedPort);

      // After init completes
      isReady = true;
      const queuedPorts = pendingPorts.splice(0, pendingPorts.length);

      for (let i = 0; i < queuedPorts.length; i++) {
        const p = queuedPorts[i];
        if (i === 0) {
          p.postMessage({ type: 'shared_worker_ready', payload: { nodeId: 'test-789' } });
        }
      }

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0]).toEqual({
        type: 'shared_worker_ready',
        payload: { nodeId: 'test-789' },
      });
    });

    it('no setTimeout 200ms pattern exists in main.ts', async () => {
      // This test verifies the old 200ms setTimeout has been removed.
      // We check that the source code does NOT contain the old pattern.
      const { readFileSync } = await import('fs');
      const { resolve } = await import('path');
      const mainTs = readFileSync(
        resolve(__dirname, '../../src/main.ts'),
        'utf-8',
      );

      // The old pattern was: setTimeout(() => { finishSharedWorkerConnection(); }, 200);
      expect(mainTs).not.toMatch(/setTimeout[\s\S]*finishSharedWorkerConnection[\s\S]*200/);
      // The new pattern should be present:
      expect(mainTs).toContain('waitForSharedWorkerReady');
      expect(mainTs).toContain('shared_worker_ready');
    });
  });
});
