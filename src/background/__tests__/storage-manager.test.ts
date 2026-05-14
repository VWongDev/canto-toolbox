import { describe, it, expect, vi } from 'vitest';
import { StorageManager } from '../../shared/storage-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSyncStorage = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

const makeLocalStorage = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

// ---------------------------------------------------------------------------
// StorageManager
// ---------------------------------------------------------------------------

describe('StorageManager', () => {
  describe('getStatistics', () => {
    it('returns empty object when both storages are empty', async () => {
      const manager = new StorageManager(makeSyncStorage(), makeLocalStorage());
      expect(await manager.getStatistics()).toEqual({});
    });

    it('returns sync-only stats when local storage is empty', async () => {
      const sync = makeSyncStorage();
      vi.mocked(sync.get).mockResolvedValue({
        wordStatistics: { 好: { count: 3, firstSeen: 100, lastSeen: 200 } },
      } as unknown as void);
      const manager = new StorageManager(sync, makeLocalStorage());
      const stats = await manager.getStatistics();
      expect(stats['好']!.count).toBe(3);
    });

    it('returns local-only stats when sync storage is empty', async () => {
      const local = makeLocalStorage();
      vi.mocked(local.get).mockResolvedValue({
        wordStatistics: { 字: { count: 1, firstSeen: 50, lastSeen: 150 } },
      } as unknown as void);
      const manager = new StorageManager(makeSyncStorage(), local);
      const stats = await manager.getStatistics();
      expect(stats['字']!.count).toBe(1);
    });

    it('merges counts for a word present in both storages', async () => {
      const sync = makeSyncStorage();
      const local = makeLocalStorage();
      vi.mocked(sync.get).mockResolvedValue({
        wordStatistics: { 好: { count: 3, firstSeen: 100, lastSeen: 200 } },
      } as unknown as void);
      vi.mocked(local.get).mockResolvedValue({
        wordStatistics: { 好: { count: 2, firstSeen: 50, lastSeen: 150 } },
      } as unknown as void);
      const manager = new StorageManager(sync, local);
      const stats = await manager.getStatistics();
      expect(stats['好']!.count).toBe(5);
    });

    it('takes the earliest firstSeen when merging', async () => {
      const sync = makeSyncStorage();
      const local = makeLocalStorage();
      vi.mocked(sync.get).mockResolvedValue({
        wordStatistics: { 好: { count: 1, firstSeen: 200, lastSeen: 200 } },
      } as unknown as void);
      vi.mocked(local.get).mockResolvedValue({
        wordStatistics: { 好: { count: 1, firstSeen: 50, lastSeen: 100 } },
      } as unknown as void);
      const manager = new StorageManager(sync, local);
      const stats = await manager.getStatistics();
      expect(stats['好']!.firstSeen).toBe(50);
    });

    it('takes the latest lastSeen when merging', async () => {
      const sync = makeSyncStorage();
      const local = makeLocalStorage();
      vi.mocked(sync.get).mockResolvedValue({
        wordStatistics: { 好: { count: 1, firstSeen: 100, lastSeen: 300 } },
      } as unknown as void);
      vi.mocked(local.get).mockResolvedValue({
        wordStatistics: { 好: { count: 1, firstSeen: 100, lastSeen: 100 } },
      } as unknown as void);
      const manager = new StorageManager(sync, local);
      const stats = await manager.getStatistics();
      expect(stats['好']!.lastSeen).toBe(300);
    });

    it('handles storage read errors gracefully', async () => {
      const sync = makeSyncStorage();
      vi.mocked(sync.get).mockRejectedValue(new Error('QuotaExceededError'));
      const manager = new StorageManager(sync, makeLocalStorage());
      const stats = await manager.getStatistics();
      expect(stats).toEqual({});
    });
  });

  describe('updateStatistics', () => {
    it('does not throw for a valid word', () => {
      const manager = new StorageManager(makeSyncStorage(), makeLocalStorage());
      expect(() => manager.updateStatistics('好')).not.toThrow();
    });

    it('ignores empty strings', () => {
      const sync = makeSyncStorage();
      const manager = new StorageManager(sync, makeLocalStorage());
      manager.updateStatistics('');
      // no write should be enqueued for blank input
      expect(sync.set).not.toHaveBeenCalled();
    });

    it('ignores whitespace-only strings', () => {
      const sync = makeSyncStorage();
      const manager = new StorageManager(sync, makeLocalStorage());
      manager.updateStatistics('   ');
      expect(sync.set).not.toHaveBeenCalled();
    });
  });
});
