import { lookupWordInDictionaries } from './dictionary-loader.js';
import type { DefinitionResult, BackgroundMessage, BackgroundResponse, Statistics, StatisticsResponse, TrackWordResponse, DictionaryEntry, LookupResponse, ErrorResponse } from '../types';

const MAX_WORD_LENGTH = 4;

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
      this.storageManager.updateStatistics(definition?.word || word).catch(() => {});
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
    this.storageManager.updateStatistics(word)
      .then(() => sendResponse({ success: true } as TrackWordResponse))
      .catch(error => {
        console.error('[Background] Failed to track statistics:', error);
        sendResponse({ success: false, error: error?.message || 'Unknown error' });
      });
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

  private async updateStatisticsInStorage(storage: chrome.storage.StorageArea, word: string): Promise<void> {
    const result = await storage.get([this.STORAGE_KEY]);
    const stats: Statistics = result.wordStatistics || {};
    
    if (!stats[word]) {
      const now = Date.now();
      stats[word] = { count: 0, firstSeen: now, lastSeen: now };
    }
    
    stats[word].count += 1;
    stats[word].lastSeen = Date.now();
    await storage.set({ wordStatistics: stats });
  }

  private async loadStatisticsFromStorage(storage: chrome.storage.StorageArea): Promise<Statistics> {
    try {
      return (await storage.get([this.STORAGE_KEY])).wordStatistics || {};
    } catch (error) {
      console.warn('[Background] Failed to get statistics from storage:', error);
      return {};
    }
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

  async updateStatistics(word: string): Promise<void> {
    if (!word?.trim()) {
      console.warn('[Background] Invalid word for statistics:', word);
      return;
    }

    try {
      await this.updateStatisticsInStorage(chrome.storage.sync, word);
    } catch (error) {
      console.error('[Background] Failed to update statistics in sync storage:', error);
      try {
        await this.updateStatisticsInStorage(chrome.storage.local, word);
      } catch (localError) {
        console.error('[Background] Failed to update local statistics:', localError);
        throw localError;
      }
    }
  }

  async getStatistics(): Promise<Statistics> {
    const [syncStats, localStats] = await Promise.all([
      this.loadStatisticsFromStorage(chrome.storage.sync),
      this.loadStatisticsFromStorage(chrome.storage.local)
    ]);
    return this.mergeStatistics(syncStats, localStats);
  }
}

export const messageManager = new MessageManager(chrome.runtime, new StorageManager());
messageManager.init();

function isDefinitionValid(entries: DictionaryEntry[]): boolean {
  if (!entries.length) return false;
  return entries.some(e => e.definitions.some(d => d.trim().length > 0));
}

function hasValidDefinition(definition: DefinitionResult): boolean {
  return isDefinitionValid(definition.mandarin.entries) || isDefinitionValid(definition.cantonese.entries);
}

function findLongestMatchingWord(word: string): { definition: DefinitionResult; matchedWord: string } | null {
  for (let len = Math.min(word.length, MAX_WORD_LENGTH); len >= 1; len--) {
    const substring = word.substring(0, len);
    const definition = lookupWordInDictionaries(substring);
    if (hasValidDefinition(definition)) {
      return { definition, matchedWord: substring };
    }
  }
  
  return null;
}

function lookupWord(word: string): DefinitionResult {
  const matchResult = findLongestMatchingWord(word);
  if (matchResult) {
    matchResult.definition.word = matchResult.matchedWord;
    return matchResult.definition;
  }
  
  console.error('[Dict] Word not found:', word);
  throw new Error(`Word "${word}" not found in dictionary`);
}
