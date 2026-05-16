import { describe, it, expect, vi } from 'vitest';
import { PopupStorageClient } from '../popup-storage.js';
import { RedundantStore } from '../../shared/redundant-store.js';
import { StorageManager } from '../../shared/storage-manager.js';

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
});
