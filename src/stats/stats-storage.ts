import { RedundantStore } from '../shared/redundant-store.js';
import { StorageManager } from '../shared/storage-manager.js';
import { mergeStatistics } from '../shared/statistics-utils.js';
import type { Statistics } from '../shared/types';

const STORAGE_KEY = 'wordStatistics';

export interface StatsStorage {
  getStatistics(): Promise<Statistics>;
}

export class StatsStorageClient implements StatsStorage {
  constructor(private readonly store: RedundantStore) {}

  async getStatistics(): Promise<Statistics> {
    return this.store.read<Statistics>(STORAGE_KEY, (sync, local) =>
      mergeStatistics(sync ?? {}, local ?? {})
    );
  }
}

export const statsStorage = new StatsStorageClient(
  new RedundantStore(new StorageManager(chrome.storage.sync, chrome.storage.local))
);
