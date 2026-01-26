import type { Dictionary, DictionaryEntry, DefinitionResult } from '../types';
import mandarinDictData from '../data/mandarin.json';
import cantoneseDictData from '../data/cantonese.json';

const CANTONESE_MARKER = '(cantonese)';
const MAX_WORD_LENGTH = 4;

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
      def => def && def.trim().length > 0 && !def.toLowerCase().includes(CANTONESE_MARKER.toLowerCase())
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

export function isDefinitionValid(entries: DictionaryEntry[]): boolean {
  if (!entries.length) return false;
  return entries.some(e => e.definitions.some(d => d.trim().length > 0));
}

export function hasValidDefinition(definition: DefinitionResult): boolean {
  return isDefinitionValid(definition.mandarin.entries) || isDefinitionValid(definition.cantonese.entries);
}

export function findLongestMatchingWord(word: string): { definition: DefinitionResult; matchedWord: string } | null {
  for (let len = Math.min(word.length, MAX_WORD_LENGTH); len >= 1; len--) {
    const substring = word.substring(0, len);
    const definition = lookupWordInDictionaries(substring);
    if (hasValidDefinition(definition)) {
      return { definition, matchedWord: substring };
    }
  }
  
  return null;
}

export function lookupWord(word: string): DefinitionResult {
  const matchResult = findLongestMatchingWord(word);
  if (matchResult) {
    matchResult.definition.word = matchResult.matchedWord;
    return matchResult.definition;
  }
  
  console.error('[Dict] Word not found:', word);
  throw new Error(`Word "${word}" not found in dictionary`);
}

