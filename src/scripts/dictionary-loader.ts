// dictionary-loader.ts - Load pre-processed dictionaries

import type { Dictionary, DictionaryEntry, DefinitionResult } from '../types';

// Dictionary data - loaded from pre-processed JSON files
let mandarinDict: Dictionary | null = null;
let cantoneseDict: Dictionary | null = null;
let dictionariesLoaded = false;

/**
 * Load pre-processed dictionary files
 */
export async function loadDictionaries(): Promise<{ mandarinDict: Dictionary | null; cantoneseDict: Dictionary | null }> {
  if (dictionariesLoaded) {
    return { mandarinDict, cantoneseDict };
  }

  try {
    // Load pre-processed Mandarin dictionary
    const mandarinUrl = chrome.runtime.getURL('src/data/mandarin.json');
    const mandarinResponse = await fetch(mandarinUrl);
    
    if (mandarinResponse.ok) {
      mandarinDict = await mandarinResponse.json() as Dictionary;
      console.log('[Dict] Loaded Mandarin dictionary:', Object.keys(mandarinDict).length, 'entries');
    } else {
      console.error('[Dict] Failed to load Mandarin dictionary:', mandarinResponse.status);
    }

    // Load pre-processed Cantonese dictionary
    const cantoneseUrl = chrome.runtime.getURL('src/data/cantonese.json');
    const cantoneseResponse = await fetch(cantoneseUrl);
    
    if (cantoneseResponse.ok) {
      cantoneseDict = await cantoneseResponse.json() as Dictionary;
      console.log('[Dict] Loaded Cantonese dictionary:', Object.keys(cantoneseDict).length, 'entries');
    } else {
      console.error('[Dict] Failed to load Cantonese dictionary:', cantoneseResponse.status);
    }

    dictionariesLoaded = true;
    return { mandarinDict, cantoneseDict };
  } catch (error) {
    console.error('[Dict] Error loading dictionaries:', error);
    return { mandarinDict, cantoneseDict };
  }
}

/**
 * Lookup word in a dictionary (unified function for both Mandarin and Cantonese)
 */
function lookupInDict(dict: Dictionary | null, word: string): DictionaryEntry[] | null {
  if (!dict || typeof dict !== 'object') {
    return null;
  }

  const entries = dict[word];
  if (!entries) {
    return null;
  }

  // Handle both array (multiple pronunciations) and single entry (backward compatibility)
  const entryArray = Array.isArray(entries) ? entries : [entries];
  
  if (entryArray.length === 0) {
    return null;
  }

  return entryArray;
}

/**
 * Format entries for display
 */
function formatEntries(entries: DictionaryEntry[], pronunciationKey: 'pinyin' | 'jyutping'): {
  definition: string;
  pinyin?: string;
  jyutping?: string;
  entries: DictionaryEntry[];
} {
  if (!entries || entries.length === 0) {
    return { definition: '', [pronunciationKey]: '', entries: [] };
  }

  // If multiple pronunciations, group by pronunciation
  if (entries.length > 1) {
    const byPronunciation: Record<string, string[]> = {};
    for (const entry of entries) {
      const pronunciation = entry[pronunciationKey] || '';
      if (!byPronunciation[pronunciation]) {
        byPronunciation[pronunciation] = [];
      }
      const defs = entry.definitions || [];
      byPronunciation[pronunciation].push(...defs.filter(d => d && String(d).trim().length > 0));
    }

    const pronunciationList = Object.keys(byPronunciation).join(', ');
    const formatted = Object.entries(byPronunciation)
      .map(([pronunciation, defs]) => {
        const defsStr = defs.join('; ');
        return `${pronunciation}: ${defsStr}`;
      })
      .join(' | ');

    return {
      [pronunciationKey]: pronunciationList,
      definition: formatted,
      entries: entries
    } as { definition: string; pinyin?: string; jyutping?: string; entries: DictionaryEntry[] };
  } else {
    // Single entry
    const entry = entries[0];
    const pronunciation = entry[pronunciationKey] || '';
    const defs = entry.definitions || [];
    const definition = defs.filter(d => d && String(d).trim().length > 0).join('; ');

    return {
      [pronunciationKey]: pronunciation,
      definition: definition,
      entries: entries
    } as { definition: string; pinyin?: string; jyutping?: string; entries: DictionaryEntry[] };
  }
}

/**
 * Filter out definitions marked as Cantonese from Mandarin entries
 * Definitions containing "(Cantonese)" are considered Cantonese-specific
 */
function filterOutCantoneseDefinitions(mandarinEntries: DictionaryEntry[]): DictionaryEntry[] {
  const filteredEntries: DictionaryEntry[] = [];
  
  for (const entry of mandarinEntries) {
    const filteredDefs = (entry.definitions || []).filter(
      def => !def.toLowerCase().includes('(cantonese)')
    );
    
    // Only include entry if it still has definitions after filtering
    if (filteredDefs.length > 0) {
      filteredEntries.push({
        ...entry,
        definitions: filteredDefs
      });
    }
  }

  return filteredEntries;
}

/**
 * Search for a word in the dictionaries
 */
export async function lookupWordInDictionaries(word: string): Promise<DefinitionResult> {
  // Ensure dictionaries are loaded
  await loadDictionaries();

  console.log('[Dict] Looking up word:', word);

  const result: DefinitionResult = {
    word: word,
    mandarin: { definition: '', pinyin: '' },
    cantonese: { definition: '', jyutping: '' }
  };

  // Lookup in Mandarin dictionary
  const mandarinEntries = lookupInDict(mandarinDict, word);

  // Process Mandarin entries, filtering out definitions marked as Cantonese
  if (mandarinEntries) {
    const filteredMandarinEntries = filterOutCantoneseDefinitions(mandarinEntries);
    console.log('[Dict] Found', mandarinEntries.length, 'Mandarin entry/entries for', word, 
      '(', filteredMandarinEntries.length, 'after filtering Cantonese definitions)');
    
    if (filteredMandarinEntries.length > 0) {
      const formatted = formatEntries(filteredMandarinEntries, 'pinyin');
      result.mandarin = {
        definition: formatted.definition,
        pinyin: formatted.pinyin || '',
        entries: formatted.entries
      };
    }
  } else {
    console.log('[Dict] No exact Mandarin entry found for', word);
  }

  // Lookup in Cantonese dictionary
  const cantoneseEntries = lookupInDict(cantoneseDict, word);
  if (cantoneseEntries) {
    console.log('[Dict] Found', cantoneseEntries.length, 'Cantonese entry/entries for', word);
    const formatted = formatEntries(cantoneseEntries, 'jyutping');
    result.cantonese = {
      definition: formatted.definition,
      jyutping: formatted.jyutping || '',
      entries: formatted.entries
    };
  } else {
    console.log('[Dict] No exact Cantonese entry found for', word);
  }

  // If no definitions found at all
  if (!result.mandarin.definition && !result.cantonese.definition) {
    result.mandarin.definition = 'Word not found in dictionary';
    result.cantonese.definition = 'Not found';
  }

  return result;
}
