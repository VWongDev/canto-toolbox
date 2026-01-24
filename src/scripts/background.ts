import { loadDictionaries, lookupWordInDictionaries } from './dictionary-loader.js';
import type { DefinitionResult, BackgroundMessage, BackgroundResponse, Statistics, StatisticsResponse, TrackWordResponse, DictionaryEntry, LookupResponse, ErrorResponse } from '../types';

export class MessageManager {
  private readonly chromeRuntime: typeof chrome.runtime;

  constructor(chromeRuntime: typeof chrome.runtime) {
    this.chromeRuntime = chromeRuntime;
  }

  lookupWord(word: string, callback: (response: LookupResponse | ErrorResponse) => void): void {
    this.chromeRuntime.sendMessage(
      { type: 'lookup_word', word },
      (response: BackgroundResponse | undefined) => {
        if (this.chromeRuntime.lastError) {
          callback({
            success: false,
            error: this.chromeRuntime.lastError.message || 'Unknown error'
          });
          return;
        }

        if (response && response.success && 'definition' in response) {
          callback(response as LookupResponse);
        } else {
          const errorMsg = response && 'error' in response ? response.error : 'Lookup failed';
          callback({
            success: false,
            error: errorMsg
          });
        }
      }
    );
  }

  trackWord(word: string, callback: (response: TrackWordResponse | ErrorResponse) => void): void {
    this.chromeRuntime.sendMessage(
      { type: 'track_word', word },
      (response: BackgroundResponse | undefined) => {
        if (this.chromeRuntime.lastError) {
          callback({
            success: false,
            error: this.chromeRuntime.lastError.message || 'Unknown error'
          });
          return;
        }

        if (response && response.success) {
          callback(response as TrackWordResponse);
        } else {
          const errorMsg = response && 'error' in response ? response.error : 'Tracking failed';
          callback({
            success: false,
            error: errorMsg
          });
        }
      }
    );
  }

  getStatistics(callback: (response: StatisticsResponse | ErrorResponse) => void): void {
    this.chromeRuntime.sendMessage(
      { type: 'get_statistics' },
      (response: BackgroundResponse | undefined) => {
        if (this.chromeRuntime.lastError) {
          callback({
            success: false,
            error: this.chromeRuntime.lastError.message || 'Unknown error'
          });
          return;
        }

        if (response && response.success && 'statistics' in response) {
          callback(response as StatisticsResponse);
        } else {
          const errorMsg = response && 'error' in response ? response.error : 'Failed to get statistics';
          callback({
            success: false,
            error: errorMsg
          });
        }
      }
    );
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

let dictionariesLoading = false;
let dictionariesLoadPromise: Promise<void> | null = null;

function preloadDictionaries(): Promise<void> {
  if (dictionariesLoadPromise) {
    return dictionariesLoadPromise;
  }
  
  if (dictionariesLoading) {
    return Promise.resolve();
  }
  
  dictionariesLoading = true;
  dictionariesLoadPromise = loadDictionaries()
    .then(() => {
      dictionariesLoading = false;
    })
    .catch(error => {
      console.error('[Background] Failed to pre-load dictionaries:', error);
      dictionariesLoading = false;
      dictionariesLoadPromise = null;
    });
  
  return dictionariesLoadPromise;
}

preloadDictionaries();

function isCacheValid(cached: CacheEntry | undefined): boolean {
  if (!cached) return false;
  return Date.now() - cached.timestamp < CACHE_DURATION_MS;
}

function handleLookupWordMessage(word: string, sendResponse: (response: BackgroundResponse) => void): void {
  lookupWord(word)
    .then(definition => {
      const wordToTrack = definition?.word || word;
      updateStatistics(wordToTrack).catch(error => {
        console.error('[Background] Failed to track statistics:', error);
      });
      sendResponse({ success: true, definition });
    })
    .catch(error => {
      console.error('[Background] Lookup error:', error);
      console.error('[Background] Error details:', error.name, error.message, error.stack);
      sendResponse({ 
        success: false, 
        error: error.message || 'Unknown error',
        errorName: error.name
      });
    });
}

function handleGetStatisticsMessage(sendResponse: (response: BackgroundResponse) => void): void {
  getStatistics()
    .then(stats => {
      const response: StatisticsResponse = { success: true, statistics: stats };
      sendResponse(response);
    })
    .catch(error => {
      console.error('[Background] Error getting statistics:', error);
      sendResponse({ success: false, error: error?.message || 'Unknown error' });
    });
}

function handleTrackWordMessage(word: string, sendResponse: (response: BackgroundResponse) => void): void {
  updateStatistics(word)
    .then(() => {
      sendResponse({ success: true } as TrackWordResponse);
    })
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
  if (!entries || entries.length === 0) return false;
  const allDefinitions = entries.flatMap(e => e.definitions || []);
  const joinedDef = allDefinitions.join(' ').toLowerCase();
  return !joinedDef.includes('not found') &&
         !joinedDef.includes('not loaded') &&
         joinedDef.trim().length > 0;
}

function hasValidDefinition(definition: DefinitionResult | null): boolean {
  if (!definition) {
    return false;
  }
  
  const hasMandarin = isDefinitionValid(definition.mandarin.entries);
  const hasCantonese = isDefinitionValid(definition.cantonese.entries);
  
  return hasMandarin || hasCantonese;
}

function createNotFoundResult(word: string): DefinitionResult {
  return {
    word: word,
    mandarin: { 
      entries: [{
        traditional: word,
        simplified: word,
        romanisation: '',
        definitions: ['Word not found in dictionary']
      }]
    },
    cantonese: { 
      entries: []
    }
  };
}

function createErrorResult(word: string): DefinitionResult {
  return {
    word: word,
    mandarin: { 
      entries: [{
        traditional: word,
        simplified: word,
        romanisation: '',
        definitions: ['Dictionary files not loaded. Please ensure dictionaries submodules are initialized.']
      }]
    },
    cantonese: { 
      entries: [{
        traditional: word,
        simplified: word,
        romanisation: '',
        definitions: ['Dictionary files not loaded']
      }]
    }
  };
}

async function findLongestMatchingWord(word: string): Promise<{ definition: DefinitionResult; matchedWord: string } | null> {
  await preloadDictionaries();
  
  for (let len = Math.min(word.length, MAX_WORD_LENGTH); len >= 1; len--) {
    const substring = word.substring(0, len);
    const subDefinition = await lookupWordInDictionaries(substring);
    
    if (hasValidDefinition(subDefinition)) {
      return { definition: subDefinition, matchedWord: substring };
    }
  }
  
  if (word.length > 1) {
    const firstChar = word[0];
    const charDefinition = await lookupWordInDictionaries(firstChar);
    if (hasValidDefinition(charDefinition)) {
      return { definition: charDefinition, matchedWord: firstChar };
    }
  }
  
  return null;
}

async function lookupWord(word: string): Promise<DefinitionResult> {
  const cached = lookupCache.get(word);
  if (isCacheValid(cached)) {
    return cached!.data;
  }

  try {
    const matchResult = await findLongestMatchingWord(word);
    
    if (matchResult) {
      const { definition, matchedWord } = matchResult;
      definition.word = matchedWord;
      
      lookupCache.set(word, {
        data: definition,
        timestamp: Date.now()
      });
      
      return definition;
    }
    
    return createNotFoundResult(word);
  } catch (error) {
    const err = error as Error;
    console.error('[Dict] Dictionary lookup failed:', error);
    console.error('[Dict] Error details:', err.message, err.stack);
    return createErrorResult(word);
  }
}

function isValidWord(word: string): boolean {
  return Boolean(word && typeof word === 'string' && word.trim().length > 0);
}

function createWordStatEntry(): { count: number; firstSeen: number; lastSeen: number } {
  const now = Date.now();
  return {
    count: 0,
    firstSeen: now,
    lastSeen: now
  };
}

function updateWordStat(stats: Statistics, word: string): void {
  if (!stats[word]) {
    stats[word] = createWordStatEntry();
  }
  stats[word].count += 1;
  stats[word].lastSeen = Date.now();
}

async function updateStatisticsInStorage(storage: chrome.storage.StorageArea, word: string): Promise<void> {
  const result = await storage.get([STORAGE_KEY]);
  const stats: Statistics = result.wordStatistics || {};
  updateWordStat(stats, word);
  await storage.set({ wordStatistics: stats });
}

async function updateStatistics(word: string): Promise<void> {
  if (!isValidWord(word)) {
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

async function loadStatisticsFromStorage(storage: chrome.storage.StorageArea, storageName: string): Promise<Statistics> {
  try {
    const result = await storage.get([STORAGE_KEY]);
    const stats = (result.wordStatistics || {}) as Statistics;
    return stats;
  } catch (error) {
    console.warn(`[Background] Failed to get statistics from ${storageName} storage:`, error);
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
  const syncStats = await loadStatisticsFromStorage(chrome.storage.sync, 'sync');
  const localStats = await loadStatisticsFromStorage(chrome.storage.local, 'local');
  const mergedStats = mergeStatistics(syncStats, localStats);
  
  return mergedStats;
}
