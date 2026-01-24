import type { Dictionary, DictionaryEntry, DefinitionResult } from '../types';

const DICTIONARY_PATHS = {
  mandarin: 'src/data/mandarin.json',
  cantonese: 'src/data/cantonese.json'
} as const;

const CANTONESE_MARKER = '(cantonese)';
const NOT_FOUND_MESSAGE = 'Word not found in dictionary';

let mandarinDict: Dictionary | null = null;
let cantoneseDict: Dictionary | null = null;
let dictionariesLoaded = false;

async function loadDictionary(url: string): Promise<Dictionary | null> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      const dict = await response.json() as Dictionary;
      console.log('[Dict] Loaded dictionary:', Object.keys(dict).length, 'entries');
      return dict;
    } else {
      console.error('[Dict] Failed to load dictionary:', response.status);
      return null;
    }
  } catch (error) {
    console.error('[Dict] Error loading dictionary:', error);
    return null;
  }
}

export async function loadDictionaries(): Promise<{ mandarinDict: Dictionary | null; cantoneseDict: Dictionary | null }> {
  if (dictionariesLoaded) {
    return { mandarinDict, cantoneseDict };
  }

  const mandarinUrl = chrome.runtime.getURL(DICTIONARY_PATHS.mandarin);
  const cantoneseUrl = chrome.runtime.getURL(DICTIONARY_PATHS.cantonese);

  mandarinDict = await loadDictionary(mandarinUrl);
  cantoneseDict = await loadDictionary(cantoneseUrl);

  dictionariesLoaded = true;
  return { mandarinDict, cantoneseDict };
}

function lookupInDict(dict: Dictionary | null, word: string): DictionaryEntry[] | null {
  if (!dict || typeof dict !== 'object') {
    return null;
  }

  const entries = dict[word];
  if (!entries) {
    return null;
  }

  const entryArray = Array.isArray(entries) ? entries : [entries];
  
  if (entryArray.length === 0) {
    return null;
  }

  return entryArray;
}

function groupEntriesByPronunciation(entries: DictionaryEntry[]): Record<string, string[]> {
  const byPronunciation: Record<string, string[]> = {};
  for (const entry of entries) {
    const pronunciation = entry.romanisation || '';
    if (!byPronunciation[pronunciation]) {
      byPronunciation[pronunciation] = [];
    }
    const defs = entry.definitions || [];
    byPronunciation[pronunciation].push(...defs.filter(d => d && String(d).trim().length > 0));
  }
  return byPronunciation;
}

function formatMultipleEntries(entries: DictionaryEntry[]): {
  definition: string;
  romanisation: string;
  entries: DictionaryEntry[];
} {
  const byPronunciation = groupEntriesByPronunciation(entries);
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
}

function formatSingleEntry(entry: DictionaryEntry): {
  definition: string;
  romanisation: string;
  entries: DictionaryEntry[];
} {
  const pronunciation = entry.romanisation || '';
  const defs = entry.definitions || [];
  const definition = defs.filter(d => d && String(d).trim().length > 0).join('; ');

  return {
    romanisation: pronunciation,
    definition: definition,
    entries: [entry]
  };
}

function formatEntries(entries: DictionaryEntry[]): {
  definition: string;
  romanisation: string;
  entries: DictionaryEntry[];
} {
  if (!entries || entries.length === 0) {
    return { definition: '', romanisation: '', entries: [] };
  }

  if (entries.length > 1) {
    return formatMultipleEntries(entries);
  } else {
    return formatSingleEntry(entries[0]);
  }
}

function filterOutCantoneseDefinitions(mandarinEntries: DictionaryEntry[]): DictionaryEntry[] {
  const filteredEntries: DictionaryEntry[] = [];
  
  for (const entry of mandarinEntries) {
    const filteredDefs = (entry.definitions || []).filter(
      def => !def.toLowerCase().includes(CANTONESE_MARKER.toLowerCase())
    );
    
    if (filteredDefs.length > 0) {
      filteredEntries.push({
        ...entry,
        definitions: filteredDefs
      });
    }
  }

  return filteredEntries;
}

function processDictionaryLookup(
  dict: Dictionary | null,
  word: string,
  name: string,
  filterCantonese: boolean
): { definition: string; romanisation: string; entries: DictionaryEntry[] } | null {
  const entries = lookupInDict(dict, word);
  
  if (!entries) {
    console.log(`[Dict] No exact ${name} entry found for`, word);
    return null;
  }

  const processedEntries = filterCantonese 
    ? filterOutCantoneseDefinitions(entries)
    : entries;
  
  const logMessage = filterCantonese
    ? `[Dict] Found ${entries.length} ${name} entry/entries for ${word} (${processedEntries.length} after filtering Cantonese definitions)`
    : `[Dict] Found ${processedEntries.length} ${name} entry/entries for ${word}`;
  console.log(logMessage);
  
  if (processedEntries.length === 0) {
    return null;
  }

  const formatted = formatEntries(processedEntries);
  return {
    definition: formatted.definition,
    romanisation: formatted.romanisation,
    entries: formatted.entries
  };
}

function setNotFoundMessages(result: DefinitionResult): void {
  if (!result.mandarin.definition && !result.cantonese.definition) {
    result.mandarin.definition = NOT_FOUND_MESSAGE;
    if (!result.cantonese.romanisation || result.cantonese.romanisation.trim().length === 0) {
      result.cantonese.definition = 'Not found';
    }
  } else if (!result.cantonese.definition && result.cantonese.romanisation && result.cantonese.romanisation.trim().length > 0) {
    result.cantonese.definition = '';
  }
}

export async function lookupWordInDictionaries(word: string): Promise<DefinitionResult> {
  await loadDictionaries();

  console.log('[Dict] Looking up word:', word);

  const result: DefinitionResult = {
    word: word,
    mandarin: { definition: '', romanisation: '' },
    cantonese: { definition: '', romanisation: '' }
  };

  const mandarinResult = processDictionaryLookup(mandarinDict, word, 'Mandarin', true);
  if (mandarinResult) {
    result.mandarin = mandarinResult;
  }

  const cantoneseResult = processDictionaryLookup(cantoneseDict, word, 'Cantonese', false);
  if (cantoneseResult) {
    result.cantonese = cantoneseResult;
  }

  setNotFoundMessages(result);

  return result;
}
