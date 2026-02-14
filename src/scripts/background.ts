import { lookupWord } from '../utils/dictionary.js';
import { createBatchedDebounce } from '../utils/debounce.js';
import { BoundedMap } from '../utils/bounded-map.js';
import type { BackgroundMessage, BackgroundResponse, Statistics, StatisticsResponse, TrackWordResponse, LookupResponse, ErrorResponse } from '../types';

export class MessageManager {
  private readonly chromeRuntime: typeof chrome.runtime;
  private readonly storageManager: StorageManager;

  constructor(chromeRuntime: typeof chrome.runtime, storageManager: StorageManager) {
    this.chromeRuntime = chromeRuntime;
    this.storageManager = storageManager;
  }

  private handleError(callback: (response: ErrorResponse) => void, defaultError: string, response?: BackgroundResponse): void {
    const error = this.chromeRuntime.lastError?.message || (response && 'error' in response ? response.error : defaultError);
    callback({ success: false, error });
  }

  lookupWord(word: string, callback: (response: LookupResponse | ErrorResponse) => void): void {
    this.chromeRuntime.sendMessage({ type: 'lookup_word', word }, (response) => {
      if (this.chromeRuntime.lastError || !response?.success || !('definition' in response)) {
        this.handleError(callback, 'Lookup failed', response);
        return;
      }
      callback(response as LookupResponse);
    });
  }

  trackWord(word: string, callback: (response: TrackWordResponse | ErrorResponse) => void): void {
    this.chromeRuntime.sendMessage({ type: 'track_word', word }, (response) => {
      if (this.chromeRuntime.lastError || !response?.success) {
        this.handleError(callback, 'Tracking failed', response);
        return;
      }
      callback(response as TrackWordResponse);
    });
  }

  getStatistics(callback: (response: StatisticsResponse | ErrorResponse) => void): void {
    this.chromeRuntime.sendMessage({ type: 'get_statistics' }, (response) => {
      if (this.chromeRuntime.lastError || !response?.success || !('statistics' in response)) {
        this.handleError(callback, 'Failed to get statistics', response);
        return;
      }
      callback(response as StatisticsResponse);
    });
  }

  private handleLookupWordMessage(word: string, sendResponse: (response: BackgroundResponse) => void): void {
    try {
      const definition = lookupWord(word);
      this.storageManager.updateStatistics(definition?.word || word);
      sendResponse({ success: true, definition });
    } catch (error) {
      console.error('[Background] Lookup error:', error);
      const err = error as Error;
      sendResponse({ success: false, error: err.message || 'Unknown error', errorName: err.name });
    }
  }

  private handleGetStatisticsMessage(sendResponse: (response: BackgroundResponse) => void): void {
    this.storageManager.getStatistics()
      .then(stats => sendResponse({ success: true, statistics: stats }))
      .catch(error => {
        console.error('[Background] Error getting statistics:', error);
        sendResponse({ success: false, error: error?.message || 'Unknown error' });
      });
  }

  private handleTrackWordMessage(word: string, sendResponse: (response: BackgroundResponse) => void): void {
    this.storageManager.updateStatistics(word);
    sendResponse({ success: true } as TrackWordResponse);
  }

  init(): void {
    this.chromeRuntime.onMessage.addListener((
      message: BackgroundMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: BackgroundResponse) => void
    ): boolean => {
      if (message.type === 'lookup_word') {
        this.handleLookupWordMessage(message.word, sendResponse);
        return true;
      }
      if (message.type === 'get_statistics') {
        this.handleGetStatisticsMessage(sendResponse);
        return true;
      }
      if (message.type === 'track_word') {
        this.handleTrackWordMessage(message.word, sendResponse);
        return true;
      }
      return false;
    });
  }
}

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
      if (syncStats[word]) {
        merged[word] = {
          count: (syncStats[word].count || 0) + (localStats[word].count || 0),
          firstSeen: Math.min(syncStats[word].firstSeen || Date.now(), localStats[word].firstSeen || Date.now()),
          lastSeen: Math.max(syncStats[word].lastSeen || 0, localStats[word].lastSeen || 0)
        };
      }
    }

    return merged;
  }
}

export const messageManager = new MessageManager(chrome.runtime, new StorageManager(chrome.storage.sync, chrome.storage.local));
messageManager.init();
