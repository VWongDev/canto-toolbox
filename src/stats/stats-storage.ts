import { StorageManager } from '../shared/storage-manager.js';
import type { Statistics } from '../shared/types';

export interface StatsStorage {
  getStatistics(): Promise<Statistics>;
}

export class StatsStorageClient implements StatsStorage {
  constructor(private readonly manager: StorageManager) {}

  getStatistics(): Promise<Statistics> {
    return this.manager.getStatistics();
  }
}

export const statsStorage = new StatsStorageClient(
  new StorageManager(chrome.storage.sync, chrome.storage.local)
);
