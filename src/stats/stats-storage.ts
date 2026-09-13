import { RedundantStore } from '../shared/redundant-store.js';
import { STATISTICS_KEY, statisticsStore } from '../shared/statistics-store.js';
import { reconcileStatistics } from '../shared/statistics-utils.js';
import type { Statistics } from '../shared/types';

export interface StatsStorage {
  getStatistics(): Promise<Statistics>;
  clearStatistics(): Promise<void>;
}

export class StatsStorageClient implements StatsStorage {
  constructor(private readonly store: RedundantStore) {}

  async getStatistics(): Promise<Statistics> {
    return this.store.read<Statistics>(STATISTICS_KEY, reconcileStatistics);
  }

  /** Both areas are emptied — a read reconciles them, so clearing one is not enough. */
  async clearStatistics(): Promise<void> {
    await this.store.writeBoth<Statistics>(STATISTICS_KEY, {});
  }
}

export const statsStorage = new StatsStorageClient(statisticsStore);
