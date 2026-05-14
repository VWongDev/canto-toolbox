import { StorageManager } from '../shared/storage-manager.js';
import { mergeStatistics } from '../shared/statistics-utils.js';
import type { Statistics } from '../shared/types';

const STORAGE_KEY = 'wordStatistics';

export interface StatsStorage {
  getStatistics(): Promise<Statistics>;
}

export class StatsStorageClient implements StatsStorage {
  constructor(private readonly manager: StorageManager) {}

  async getStatistics(): Promise<Statistics> {
    const [sync, local] = await Promise.all([
      this.manager.readSync(STORAGE_KEY),
      this.manager.readLocal(STORAGE_KEY),
    ]);
    return mergeStatistics((sync as Statistics) ?? {}, (local as Statistics) ?? {});
  }
}

export const statsStorage = new StatsStorageClient(
  new StorageManager(chrome.storage.sync, chrome.storage.local)
);
