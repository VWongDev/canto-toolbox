import { lookupWord, initDictionaries } from './dictionary.js';
import { createBatchedDebounce } from './debounce.js';
import { BoundedMap } from './bounded-map.js';
import type { BackgroundMessage, BackgroundResponse, Statistics } from '../shared/types';

const dictionariesReady = initDictionaries();

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

const storageManager = new StorageManager(chrome.storage.sync, chrome.storage.local);

chrome.runtime.onMessage.addListener((
  message: BackgroundMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: BackgroundResponse) => void
): boolean => {
  if (message.type === 'lookup_word') {
    dictionariesReady.then(() => {
      try {
        const definition = lookupWord(message.word);
        storageManager.updateStatistics(definition?.word || message.word);
        sendResponse({ success: true, type: 'lookup_word', definition });
      } catch (error) {
        console.error('[Background] Lookup error:', error);
        const err = error instanceof Error ? error : new Error(String(error));
        sendResponse({ success: false, error: err.message, errorName: err.name });
      }
    }).catch((error: unknown) => {
      console.error('[Background] Dictionary init failed:', error);
      sendResponse({ success: false, error: 'Dictionary failed to load' });
    });
    return true;
  }
  if (message.type === 'get_statistics') {
    storageManager.getStatistics()
      .then(stats => sendResponse({ success: true, type: 'get_statistics', statistics: stats }))
      .catch((error: unknown) => {
        console.error('[Background] Error getting statistics:', error);
        const err = error instanceof Error ? error : new Error(String(error));
        sendResponse({ success: false, error: err.message || 'Unknown error' });
      });
    return true;
  }
  if (message.type === 'track_word') {
    storageManager.updateStatistics(message.word);
    sendResponse({ success: true, type: 'track_word' });
    return true;
  }
  return false;
});
