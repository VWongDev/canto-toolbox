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

function lookupInDict(dict: Dictionary | null, word: string): DictionaryEntry[] {
  if (!dict || typeof dict !== 'object') {
    return [];
  }

  const entries = dict[word];
  if (!entries) {
    return [];
  }

  const entryArray = Array.isArray(entries) ? entries : [entries];
  
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
): DictionaryEntry[] {
  const entries = lookupInDict(dict, word);
  
  const processedEntries = filterCantonese 
    ? filterOutCantoneseDefinitions(entries)
    : entries;
  
  return processedEntries;
}

function setNotFoundMessages(result: DefinitionResult): void {
  const hasMandarin = result.mandarin.entries.length > 0;
  const hasCantonese = result.cantonese.entries.length > 0;
  
  if (!hasMandarin && !hasCantonese) {
    // Add a not-found entry for mandarin
    result.mandarin.entries = [{
      traditional: result.word,
      simplified: result.word,
      romanisation: '',
      definitions: [NOT_FOUND_MESSAGE]
    }];
  }
}

export async function lookupWordInDictionaries(word: string): Promise<DefinitionResult> {
  await loadDictionaries();

  const result: DefinitionResult = {
    word: word,
    mandarin: { entries: [] },
    cantonese: { entries: [] }
  };

  result.mandarin.entries = processDictionaryLookup(mandarinDict, word, 'Mandarin', true);
  result.cantonese.entries = processDictionaryLookup(cantoneseDict, word, 'Cantonese', false);

  setNotFoundMessages(result);

  return result;
}
