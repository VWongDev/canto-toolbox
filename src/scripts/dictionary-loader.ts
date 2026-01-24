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
function formatEntries(entries: DictionaryEntry[]): {
  definition: string;
  romanisation: string;
  entries: DictionaryEntry[];
} {
  if (!entries || entries.length === 0) {
    return { definition: '', romanisation: '', entries: [] };
  }

  // If multiple pronunciations, group by pronunciation
  if (entries.length > 1) {
    const byPronunciation: Record<string, string[]> = {};
    for (const entry of entries) {
      const pronunciation = entry.romanisation || '';
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
      romanisation: pronunciationList,
      definition: formatted,
      entries: entries
    };
  } else {
    // Single entry
    const entry = entries[0];
    const pronunciation = entry.romanisation || '';
    const defs = entry.definitions || [];
    const definition = defs.filter(d => d && String(d).trim().length > 0).join('; ');

    return {
      romanisation: pronunciation,
      definition: definition,
      entries: entries
    };
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
    mandarin: { definition: '', romanisation: '' },
    cantonese: { definition: '', romanisation: '' }
  };

  // Process each dictionary
  const dictionaries = [
    {
      dict: mandarinDict,
      name: 'Mandarin',
      resultKey: 'mandarin' as const,
      filterCantonese: true
    },
    {
      dict: cantoneseDict,
      name: 'Cantonese',
      resultKey: 'cantonese' as const,
      filterCantonese: false
    }
  ];

  for (const { dict, name, resultKey, filterCantonese } of dictionaries) {
    const entries = lookupInDict(dict, word);
    
    if (entries) {
      const processedEntries = filterCantonese 
        ? filterOutCantoneseDefinitions(entries)
        : entries;
      
      const logMessage = filterCantonese
        ? `[Dict] Found ${entries.length} ${name} entry/entries for ${word} (${processedEntries.length} after filtering Cantonese definitions)`
        : `[Dict] Found ${processedEntries.length} ${name} entry/entries for ${word}`;
      console.log(logMessage);
      
      if (processedEntries.length > 0) {
        const formatted = formatEntries(processedEntries);
        result[resultKey] = {
          definition: formatted.definition,
          romanisation: formatted.romanisation,
          entries: formatted.entries
        };
      }
    } else {
      console.log(`[Dict] No exact ${name} entry found for`, word);
    }
  }

  // If no definitions found at all
  if (!result.mandarin.definition && !result.cantonese.definition) {
    result.mandarin.definition = 'Word not found in dictionary';
    // Only set "Not found" for Cantonese if there's also no pronunciation
    if (!result.cantonese.romanisation || result.cantonese.romanisation.trim().length === 0) {
      result.cantonese.definition = 'Not found';
    }
  } else if (!result.cantonese.definition && result.cantonese.romanisation && result.cantonese.romanisation.trim().length > 0) {
    // Cantonese has pronunciation but no definition - leave definition empty (don't set "Not found")
    result.cantonese.definition = '';
  }

  return result;
}
