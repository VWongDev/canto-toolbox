import { describe, it, expect, vi } from 'vitest';
import { StorageManager } from '../storage-manager.js';

const makeSyncStorage = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

const makeLocalStorage = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

describe('StorageManager', () => {
  it('readSync returns the keyed value', async () => {
    const sync = makeSyncStorage();
    vi.mocked(sync.get).mockResolvedValue({ myKey: 'hello' } as unknown as void);
    const manager = new StorageManager(sync, makeLocalStorage());
    expect(await manager.readSync('myKey')).toBe('hello');
  });

  it('readSync returns undefined on error', async () => {
    const sync = makeSyncStorage();
    vi.mocked(sync.get).mockRejectedValue(new Error('QuotaExceededError'));
    const manager = new StorageManager(sync, makeLocalStorage());
    expect(await manager.readSync('myKey')).toBeUndefined();
  });

  it('readLocal returns the keyed value', async () => {
    const local = makeLocalStorage();
    vi.mocked(local.get).mockResolvedValue({ myKey: 42 } as unknown as void);
    const manager = new StorageManager(makeSyncStorage(), local);
    expect(await manager.readLocal('myKey')).toBe(42);
  });

  it('readLocal returns undefined on error', async () => {
    const local = makeLocalStorage();
    vi.mocked(local.get).mockRejectedValue(new Error('StorageError'));
    const manager = new StorageManager(makeSyncStorage(), local);
    expect(await manager.readLocal('myKey')).toBeUndefined();
  });

  it('writeSync calls storage.set with correct shape', async () => {
    const sync = makeSyncStorage();
    const manager = new StorageManager(sync, makeLocalStorage());
    await manager.writeSync('myKey', { count: 1 });
    expect(sync.set).toHaveBeenCalledWith({ myKey: { count: 1 } });
  });

  it('writeLocal calls storage.set with correct shape', async () => {
    const local = makeLocalStorage();
    const manager = new StorageManager(makeSyncStorage(), local);
    await manager.writeLocal('myKey', { count: 2 });
    expect(local.set).toHaveBeenCalledWith({ myKey: { count: 2 } });
  });
});
