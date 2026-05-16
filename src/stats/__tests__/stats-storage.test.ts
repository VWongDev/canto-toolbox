import { describe, it, expect, vi } from 'vitest';
import { StatsStorageClient } from '../stats-storage.js';
import { RedundantStore } from '../../shared/redundant-store.js';
import { StorageManager } from '../../shared/storage-manager.js';
import { mergeStatistics } from '../../shared/statistics-utils.js';
import type { Statistics } from '../../shared/types.js';

const makeArea = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

const makeClient = (sync: chrome.storage.StorageArea, local: chrome.storage.StorageArea) =>
  new StatsStorageClient(new RedundantStore(new StorageManager(sync, local)));

describe('StatsStorageClient.getStatistics', () => {
  it('merges sync and local statistics via mergeStatistics', async () => {
    const now = Date.now();
    const sync: Statistics = { 你好: { count: 3, firstSeen: now, lastSeen: now } };
    const local: Statistics = { 你好: { count: 2, firstSeen: now - 1000, lastSeen: now + 1000 } };

    const syncArea = makeArea();
    const localArea = makeArea();
    vi.mocked(syncArea.get).mockResolvedValue({ wordStatistics: sync } as unknown as void);
    vi.mocked(localArea.get).mockResolvedValue({ wordStatistics: local } as unknown as void);

    const result = await makeClient(syncArea, localArea).getStatistics();

    expect(result).toEqual(mergeStatistics(sync, local));
    expect(result['你好']).toEqual({ count: 5, firstSeen: now - 1000, lastSeen: now + 1000 });
  });

  it('returns an empty object when neither area has data', async () => {
    const result = await makeClient(makeArea(), makeArea()).getStatistics();
    expect(result).toEqual({});
  });

  it('falls back to one area when the other is empty', async () => {
    const now = Date.now();
    const only: Statistics = { 好: { count: 1, firstSeen: now, lastSeen: now } };
    const syncArea = makeArea();
    vi.mocked(syncArea.get).mockResolvedValue({ wordStatistics: only } as unknown as void);

    const result = await makeClient(syncArea, makeArea()).getStatistics();

    expect(result).toEqual(only);
  });
});
