import { describe, it, expect, vi } from 'vitest';
import { PopupStorageClient } from '../popup-storage.js';
import { RedundantStore } from '../../shared/redundant-store.js';
import { StorageManager } from '../../shared/storage-manager.js';
import type { Statistics } from '../../shared/types.js';

const makeStore = (sync: chrome.storage.StorageArea, local: chrome.storage.StorageArea) =>
  new RedundantStore(new StorageManager(sync, local));

const makeSyncStorage = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

const makeLocalStorage = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

describe('PopupStorageClient', () => {
  describe('updateStatistics', () => {
    it('does not throw for a valid word', () => {
      const client = new PopupStorageClient(makeStore(makeSyncStorage(), makeLocalStorage()));
      expect(() => client.updateStatistics('好')).not.toThrow();
    });

    it('ignores empty strings', () => {
      const sync = makeSyncStorage();
      const client = new PopupStorageClient(makeStore(sync, makeLocalStorage()));
      client.updateStatistics('');
      expect(sync.set).not.toHaveBeenCalled();
    });

    it('ignores whitespace-only strings', () => {
      const sync = makeSyncStorage();
      const client = new PopupStorageClient(makeStore(sync, makeLocalStorage()));
      client.updateStatistics('   ');
      expect(sync.set).not.toHaveBeenCalled();
    });
  });

  describe('eviction', () => {
    /** Fill past the 500-word cap with words that all outrank a rare one on count. */
    function crowdedStatistics(): Statistics {
      const stats: Statistics = {};
      for (let i = 0; i < 600; i++) {
        stats[`字${i}`] = { count: 100, firstSeen: 1, lastSeen: 2 };
      }
      return stats;
    }

    async function flush(existing: Statistics): Promise<Statistics> {
      const sync = makeSyncStorage();
      (sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({ wordStatistics: existing });

      const client = new PopupStorageClient(makeStore(sync, makeLocalStorage()));
      client.updateStatistics('觸發');
      await vi.waitFor(() => expect(sync.set).toHaveBeenCalled());

      return (sync.set as ReturnType<typeof vi.fn>).mock.calls[0]![0].wordStatistics as Statistics;
    }

    it('keeps a reviewed word that hover count alone would evict', async () => {
      const stats = crowdedStatistics();
      stats['稀有'] = {
        count: 1,
        firstSeen: 1,
        lastSeen: 2,
        flashcard: { reviews: 3, consecutiveCorrect: 2 },
      };

      const written = await flush(stats);

      expect(Object.keys(written)).toHaveLength(500);
      expect(written['稀有']).toBeDefined();
    });

    it('still evicts unreviewed words down to the cap', async () => {
      const written = await flush(crowdedStatistics());
      expect(Object.keys(written)).toHaveLength(500);
    });
  });
});
