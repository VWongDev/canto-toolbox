import { createBatchedDebounce } from '../background/debounce.js';
import { BoundedMap } from '../background/bounded-map.js';
import type { Statistics } from './types';

export class StorageManager {
  private readonly STORAGE_KEY = 'wordStatistics';
  private readonly DEBOUNCE_DELAY = 500;
  private readonly MAX_WORDS = 500;
  private readonly syncStorage: chrome.storage.StorageArea;
  private readonly localStorage: chrome.storage.StorageArea;
  private readonly queueUpdate: (word: string) => void;

  constructor(syncStorage: chrome.storage.StorageArea, localStorage: chrome.storage.StorageArea) {
    this.syncStorage = syncStorage;
    this.localStorage = localStorage;
    this.queueUpdate = createBatchedDebounce(async (updates) => {
      try {
        await this.writeStatistics(this.syncStorage, updates);
      } catch (error) {
        console.error('[Background] Failed to update statistics in sync storage:', error);
        try {
          await this.writeStatistics(this.localStorage, updates);
        } catch (localError) {
          console.error('[Background] Failed to update local statistics:', localError);
        }
      }
    }, this.DEBOUNCE_DELAY);
  }

  async getStatistics(): Promise<Statistics> {
    const [syncStats, localStats] = await Promise.all([
      this.loadStatisticsFromStorage(this.syncStorage),
      this.loadStatisticsFromStorage(this.localStorage)
    ]);
    return this.mergeStatistics(syncStats, localStats);
  }

  updateStatistics(word: string): void {
    if (!word?.trim()) {
      console.warn('[Background] Invalid word for statistics:', word);
      return;
    }
    this.queueUpdate(word);
  }

  private async loadStatisticsFromStorage(storage: chrome.storage.StorageArea): Promise<Statistics> {
    try {
      return (await storage.get([this.STORAGE_KEY])).wordStatistics || {};
    } catch (error) {
      console.warn('[Background] Failed to get statistics from storage:', error);
      return {};
    }
  }

  private async writeStatistics(storage: chrome.storage.StorageArea, updates: Map<string, number>): Promise<void> {
    const result = await storage.get([this.STORAGE_KEY]);
    const existing: Statistics = result.wordStatistics || {};
    const now = Date.now();

    const stats = new BoundedMap<string, Statistics[string]>(
      this.MAX_WORDS,
      (entry) => entry.count,
      Object.entries(existing)
    );

    for (const [word, count] of updates) {
      const entry = stats.get(word) ?? { count: 0, firstSeen: now, lastSeen: now };
      entry.count += count;
      entry.lastSeen = now;
      stats.set(word, entry);
    }

    await storage.set({ wordStatistics: stats.toObject() });
  }

  private mergeStatistics(syncStats: Statistics, localStats: Statistics): Statistics {
    const merged: Statistics = { ...localStats, ...syncStats };

    for (const word in localStats) {
      const syncStat = syncStats[word];
      const localStat = localStats[word];
      if (syncStat && localStat) {
        merged[word] = {
          count: (syncStat.count ?? 0) + (localStat.count ?? 0),
          firstSeen: Math.min(syncStat.firstSeen ?? Date.now(), localStat.firstSeen ?? Date.now()),
          lastSeen: Math.max(syncStat.lastSeen ?? 0, localStat.lastSeen ?? 0)
        };
      }
    }

    return merged;
  }
}
