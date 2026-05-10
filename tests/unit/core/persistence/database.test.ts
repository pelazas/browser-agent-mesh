import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('checkOpfsAvailable', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).navigator;
    delete (globalThis as Record<string, unknown>).FileSystemFileHandle;
  });

  it('returns false when FileSystemFileHandle is not defined', async () => {
    (globalThis as Record<string, unknown>).window = { crossOriginIsolated: true };
    (globalThis as Record<string, unknown>).navigator = { storage: { getDirectory: vi.fn() } };

    const { checkOpfsAvailable } = await import('@core/persistence/database');
    expect(checkOpfsAvailable()).toBe(false);
  });

  it('returns false when FileSystemFileHandle exists but createSyncAccessHandle is missing', async () => {
    (globalThis as Record<string, unknown>).window = { crossOriginIsolated: true };
    (globalThis as Record<string, unknown>).navigator = { storage: { getDirectory: vi.fn() } };
    (globalThis as Record<string, unknown>).FileSystemFileHandle = class {};

    const { checkOpfsAvailable } = await import('@core/persistence/database');
    expect(checkOpfsAvailable()).toBe(false);
  });

  it('returns false when window.crossOriginIsolated is false', async () => {
    (globalThis as Record<string, unknown>).window = { crossOriginIsolated: false };
    (globalThis as Record<string, unknown>).navigator = { storage: { getDirectory: vi.fn() } };

    const { checkOpfsAvailable } = await import('@core/persistence/database');
    expect(checkOpfsAvailable()).toBe(false);
  });

  it('returns true when all required OPFS APIs are available', async () => {
    (globalThis as Record<string, unknown>).window = { crossOriginIsolated: true };
    (globalThis as Record<string, unknown>).navigator = { storage: { getDirectory: vi.fn() } };
    class MockFileSystemFileHandle {
      createSyncAccessHandle(): void {}
    }
    class MockFileSystemDirectoryHandle {}
    (globalThis as Record<string, unknown>).FileSystemFileHandle = MockFileSystemFileHandle;
    (globalThis as Record<string, unknown>).FileSystemDirectoryHandle = MockFileSystemDirectoryHandle;

    const { checkOpfsAvailable } = await import('@core/persistence/database');
    expect(checkOpfsAvailable()).toBe(true);
  });
});
