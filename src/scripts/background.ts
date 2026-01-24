import { loadDictionaries, lookupWordInDictionaries } from './dictionary-loader.js';
import type { DefinitionResult, BackgroundMessage, BackgroundResponse, Statistics, StatisticsResponse, TrackWordResponse, DictionaryEntry, LookupResponse, ErrorResponse } from '../types';

export class MessageManager {
  private readonly chromeRuntime: typeof chrome.runtime;

  constructor(chromeRuntime: typeof chrome.runtime) {
    this.chromeRuntime = chromeRuntime;
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
}

interface CacheEntry {
  data: DefinitionResult;
  timestamp: number;
}

const lookupCache = new Map<string, CacheEntry>();
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'wordStatistics';
const MAX_WORD_LENGTH = 4;

let dictionariesLoadPromise: Promise<void> | null = null;

function preloadDictionaries(): Promise<void> {
  if (dictionariesLoadPromise) return dictionariesLoadPromise;
  
  dictionariesLoadPromise = loadDictionaries()
    .then(() => {})
    .catch(error => {
      console.error('[Background] Failed to pre-load dictionaries:', error);
      dictionariesLoadPromise = null;
    });
  
  return dictionariesLoadPromise;
}

preloadDictionaries();

function handleLookupWordMessage(word: string, sendResponse: (response: BackgroundResponse) => void): void {
  lookupWord(word)
    .then(definition => {
      updateStatistics(definition?.word || word).catch(() => {});
      sendResponse({ success: true, definition });
    })
    .catch(error => {
      console.error('[Background] Lookup error:', error);
      sendResponse({ success: false, error: error.message || 'Unknown error', errorName: error.name });
    });
}

function handleGetStatisticsMessage(sendResponse: (response: BackgroundResponse) => void): void {
  getStatistics()
    .then(stats => sendResponse({ success: true, statistics: stats }))
    .catch(error => {
      console.error('[Background] Error getting statistics:', error);
      sendResponse({ success: false, error: error?.message || 'Unknown error' });
    });
}

function handleTrackWordMessage(word: string, sendResponse: (response: BackgroundResponse) => void): void {
  updateStatistics(word)
    .then(() => sendResponse({ success: true } as TrackWordResponse))
    .catch(error => {
      console.error('[Background] Failed to track statistics:', error);
      sendResponse({ success: false, error: error?.message || 'Unknown error' });
    });
}

chrome.runtime.onMessage.addListener((
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: BackgroundResponse) => void
): boolean => {
  if (message.type === 'lookup_word') {
    handleLookupWordMessage(message.word, sendResponse);
    return true;
  }
  if (message.type === 'get_statistics') {
    handleGetStatisticsMessage(sendResponse);
    return true;
  }
  if (message.type === 'track_word') {
    handleTrackWordMessage(message.word, sendResponse);
    return true;
  }
  console.warn('[Background] Unhandled message type:', (message as any).type);
  return false;
});

function isDefinitionValid(entries: DictionaryEntry[] | undefined): boolean {
  if (!entries?.length) return false;
  const defs = entries.flatMap(e => e.definitions || []).join(' ').toLowerCase();
  return defs.trim().length > 0 && !defs.includes('not found') && !defs.includes('not loaded');
}

function hasValidDefinition(definition: DefinitionResult | null): boolean {
  return definition ? (isDefinitionValid(definition.mandarin.entries) || isDefinitionValid(definition.cantonese.entries)) : false;
}

async function findLongestMatchingWord(word: string): Promise<{ definition: DefinitionResult; matchedWord: string } | null> {
  await preloadDictionaries();
  
  for (let len = Math.min(word.length, MAX_WORD_LENGTH); len >= 1; len--) {
    const substring = word.substring(0, len);
    const definition = await lookupWordInDictionaries(substring);
    if (hasValidDefinition(definition)) {
      return { definition, matchedWord: substring };
    }
  }
  
  if (word.length > 1) {
    const definition = await lookupWordInDictionaries(word[0]);
    if (hasValidDefinition(definition)) {
      return { definition, matchedWord: word[0] };
    }
  }
  
  return null;
}

async function lookupWord(word: string): Promise<DefinitionResult> {
  const cached = lookupCache.get(word);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached.data;
  }

  const matchResult = await findLongestMatchingWord(word);
  if (matchResult) {
    matchResult.definition.word = matchResult.matchedWord;
    lookupCache.set(word, { data: matchResult.definition, timestamp: Date.now() });
    return matchResult.definition;
  }
  
  console.error('[Dict] Word not found:', word);
  throw new Error(`Word "${word}" not found in dictionary`);
}

async function updateStatisticsInStorage(storage: chrome.storage.StorageArea, word: string): Promise<void> {
  const result = await storage.get([STORAGE_KEY]);
  const stats: Statistics = result.wordStatistics || {};
  
  if (!stats[word]) {
    const now = Date.now();
    stats[word] = { count: 0, firstSeen: now, lastSeen: now };
  }
  
  stats[word].count += 1;
  stats[word].lastSeen = Date.now();
  await storage.set({ wordStatistics: stats });
}

async function updateStatistics(word: string): Promise<void> {
  if (!word?.trim()) {
    console.warn('[Background] Invalid word for statistics:', word);
    return;
  }

  try {
    await updateStatisticsInStorage(chrome.storage.sync, word);
  } catch (error) {
    console.error('[Background] Failed to update statistics in sync storage:', error);
    try {
      await updateStatisticsInStorage(chrome.storage.local, word);
    } catch (localError) {
      console.error('[Background] Failed to update local statistics:', localError);
      throw localError;
    }
  }
}

async function loadStatisticsFromStorage(storage: chrome.storage.StorageArea): Promise<Statistics> {
  try {
    return (await storage.get([STORAGE_KEY])).wordStatistics || {};
  } catch (error) {
    console.warn('[Background] Failed to get statistics from storage:', error);
    return {};
  }
}

function mergeStatistics(syncStats: Statistics, localStats: Statistics): Statistics {
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

async function getStatistics(): Promise<Statistics> {
  const [syncStats, localStats] = await Promise.all([
    loadStatisticsFromStorage(chrome.storage.sync),
    loadStatisticsFromStorage(chrome.storage.local)
  ]);
  return mergeStatistics(syncStats, localStats);
}
