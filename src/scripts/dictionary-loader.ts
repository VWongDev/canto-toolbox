import type { Dictionary, DictionaryEntry, DefinitionResult } from '../types';
import mandarinDictData from '../data/mandarin.json';
import cantoneseDictData from '../data/cantonese.json';

const CANTONESE_MARKER = '(cantonese)';

const mandarinDict = mandarinDictData as Dictionary;
const cantoneseDict = cantoneseDictData as Dictionary;

function lookupInDict(dict: Dictionary, word: string): DictionaryEntry[] {
  const entries = dict[word];
  if (!entries) {
    return [];
  }
  return Array.isArray(entries) ? entries : [entries];
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
  dict: Dictionary,
  word: string,
  filterCantonese: boolean
): DictionaryEntry[] {
  const entries = lookupInDict(dict, word);
  return filterCantonese ? filterOutCantoneseDefinitions(entries) : entries;
}

export function lookupWordInDictionaries(word: string): DefinitionResult {
  const result: DefinitionResult = {
    word: word,
    mandarin: { entries: [] },
    cantonese: { entries: [] }
  };

  result.mandarin.entries = processDictionaryLookup(mandarinDict, word, true);
  result.cantonese.entries = processDictionaryLookup(cantoneseDict, word, false);

  return result;
}
