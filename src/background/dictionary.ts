import type { Dictionary, DictionaryEntry, DefinitionResult, EtymologyDictionary, CharacterEtymology } from '../shared/types';

const CANTONESE_MARKER = '(cantonese)';
const MAX_WORD_LENGTH = 4;

let mandarinDict: Dictionary = {};
let cantoneseDict: Dictionary = {};
let etymologyDict: EtymologyDictionary = {};

export async function initDictionaries(): Promise<void> {
  const [mandarin, cantonese, etymology] = await Promise.all([
    fetch(chrome.runtime.getURL('src/data/mandarin.json')).then(r => r.json() as Promise<Dictionary>),
    fetch(chrome.runtime.getURL('src/data/cantonese.json')).then(r => r.json() as Promise<Dictionary>),
    fetch(chrome.runtime.getURL('src/data/etymology.json')).then(r => r.json() as Promise<EtymologyDictionary>),
  ]);
  mandarinDict = mandarin;
  cantoneseDict = cantonese;
  etymologyDict = etymology;
}

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

const IDS_COMPONENT_RE = /[\u2FF0-\u2FFB？]/;
const etymologyCache = new Map<string, CharacterEtymology[]>();

function getFirstDefinition(char: string): string | undefined {
  const entries = processDictionaryLookup(mandarinDict, char, true);
  if (!entries.length) return undefined;
  const raw = entries[0]?.definitions[0]?.trim();
  if (!raw) return undefined;
  return raw.split(/[;,]/)[0]?.trim();
}

export function lookupEtymology(word: string): CharacterEtymology[] {
  const cached = etymologyCache.get(word);
  if (cached) return cached;

  const result = [...word]
    .map(char => {
      const entry = etymologyDict[char];
      if (!entry) return undefined;

      const toResolve = new Set<string>();
      if (entry.semantic) toResolve.add(entry.semantic);
      if (entry.phonetic) toResolve.add(entry.phonetic);
      if (toResolve.size === 0) {
        for (const ch of entry.decomposition) {
          if (!IDS_COMPONENT_RE.test(ch)) toResolve.add(ch);
        }
      }

      const componentDefinitions: Record<string, string> = {};
      for (const comp of toResolve) {
        const def = getFirstDefinition(comp);
        if (def) componentDefinitions[comp] = def;
      }

      return Object.keys(componentDefinitions).length > 0
        ? { ...entry, componentDefinitions }
        : entry;
    })
    .filter((entry): entry is CharacterEtymology => entry !== undefined);

  etymologyCache.set(word, result);
  return result;
}

export function lookupWordInDictionaries(word: string): DefinitionResult {
  const result: DefinitionResult = {
    word: word,
    mandarin: { entries: [] },
    cantonese: { entries: [] }
  };

  result.mandarin.entries = processDictionaryLookup(mandarinDict, word, true);
  result.cantonese.entries = processDictionaryLookup(cantoneseDict, word, false);

  const etymology = lookupEtymology(word);
  if (etymology.length > 0) {
    result.etymology = etymology;
  }

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
