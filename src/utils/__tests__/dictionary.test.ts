import { describe, it, expect } from 'vitest';
import {
  isDefinitionValid,
  hasValidDefinition,
  lookupWordInDictionaries,
  findLongestMatchingWord,
} from '../dictionary';
import type { DictionaryEntry, DefinitionResult } from '../../types';

const makeEntry = (romanisation: string, definitions: string[]): DictionaryEntry => ({
  traditional: '字',
  simplified: '字',
  romanisation,
  definitions,
});

describe('isDefinitionValid', () => {
  it('returns false for an empty entry list', () => {
    expect(isDefinitionValid([])).toBe(false);
  });

  it('returns false when all definitions are empty strings', () => {
    expect(isDefinitionValid([makeEntry('pīn', ['', '   '])])).toBe(false);
  });

  it('returns true when at least one definition is non-empty', () => {
    expect(isDefinitionValid([makeEntry('pīn', ['hello'])])).toBe(true);
  });
});

describe('hasValidDefinition', () => {
  const empty: DefinitionResult = {
    word: 'test',
    mandarin: { entries: [] },
    cantonese: { entries: [] },
  };

  it('returns false when both mandarin and cantonese are empty', () => {
    expect(hasValidDefinition(empty)).toBe(false);
  });

  it('returns true when mandarin has valid entries', () => {
    const result: DefinitionResult = {
      ...empty,
      mandarin: { entries: [makeEntry('pīn', ['to spell'])] },
    };
    expect(hasValidDefinition(result)).toBe(true);
  });

  it('returns true when cantonese has valid entries', () => {
    const result: DefinitionResult = {
      ...empty,
      cantonese: { entries: [makeEntry('ping3', ['to spell'])] },
    };
    expect(hasValidDefinition(result)).toBe(true);
  });
});

describe('lookupWordInDictionaries (with empty stub dictionaries)', () => {
  it('returns a result with the queried word and empty entries', () => {
    const result = lookupWordInDictionaries('好');
    expect(result.word).toBe('好');
    expect(result.mandarin.entries).toEqual([]);
    expect(result.cantonese.entries).toEqual([]);
  });
});

describe('findLongestMatchingWord (with empty stub dictionaries)', () => {
  it('returns null when no match exists', () => {
    expect(findLongestMatchingWord('好')).toBeNull();
  });
});
