import { describe, it, expect, vi } from 'vitest';
import { RedundantStore } from '../redundant-store.js';
import { StorageManager } from '../storage-manager.js';

const makeArea = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

const makeStore = (sync: chrome.storage.StorageArea, local: chrome.storage.StorageArea) =>
  new RedundantStore(new StorageManager(sync, local));

describe('RedundantStore', () => {
  describe('read', () => {
    it('reconciles values from both areas', async () => {
      const sync = makeArea();
      const local = makeArea();
      vi.mocked(sync.get).mockResolvedValue({ k: { a: 1 } } as unknown as void);
      vi.mocked(local.get).mockResolvedValue({ k: { b: 2 } } as unknown as void);

      const result = await makeStore(sync, local).read<Record<string, number>>(
        'k',
        (s, l) => ({ ...s, ...l }),
      );

      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('passes undefined to reconcile when an area has no value', async () => {
      const reconcile = vi.fn().mockReturnValue('merged');
      await makeStore(makeArea(), makeArea()).read('k', reconcile);
      expect(reconcile).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  describe('mutate', () => {
    it('writes the transformed value to sync', async () => {
      const sync = makeArea();
      const local = makeArea();
      vi.mocked(sync.get).mockResolvedValue({ k: 1 } as unknown as void);

      await makeStore(sync, local).mutate<number>('k', (existing) => (existing ?? 0) + 1);

      expect(sync.set).toHaveBeenCalledWith({ k: 2 });
      expect(local.set).not.toHaveBeenCalled();
    });

    it('falls back to local (re-reading local) when the sync write fails', async () => {
      const sync = makeArea();
      const local = makeArea();
      vi.mocked(sync.set).mockRejectedValue(new Error('QuotaExceededError'));
      vi.mocked(local.get).mockResolvedValue({ k: 10 } as unknown as void);

      await makeStore(sync, local).mutate<number>('k', (existing) => (existing ?? 0) + 1);

      expect(local.set).toHaveBeenCalledWith({ k: 11 });
    });

    it('swallows a failing local write', async () => {
      const sync = makeArea();
      const local = makeArea();
      vi.mocked(sync.set).mockRejectedValue(new Error('sync down'));
      vi.mocked(local.set).mockRejectedValue(new Error('local down'));

      await expect(
        makeStore(sync, local).mutate<number>('k', () => 1),
      ).resolves.toBeUndefined();
    });
  });

  describe('writeBoth', () => {
    it('writes the value to both areas so a read cannot resurrect the other', async () => {
      const sync = makeArea();
      const local = makeArea();

      await makeStore(sync, local).writeBoth('k', {});

      expect(sync.set).toHaveBeenCalledWith({ k: {} });
      expect(local.set).toHaveBeenCalledWith({ k: {} });
    });
  });
});
