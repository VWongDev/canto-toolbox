import { lookupWordInDictionaries } from '../scripts/dictionary-loader.js';
import type { DictionaryEntry, DefinitionResult } from '../types';

const MAX_WORD_LENGTH = 4;

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

export function groupEntriesByRomanisation(entries: Array<{ romanisation?: string; definitions?: string[] }>): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const entry of entries) {
    const romanisation = entry.romanisation || '';
    if (!grouped[romanisation]) {
      grouped[romanisation] = [];
    }
    const defs = entry.definitions || [];
    grouped[romanisation].push(...defs.filter(d => d && String(d).trim().length > 0));
  }
  return grouped;
}

