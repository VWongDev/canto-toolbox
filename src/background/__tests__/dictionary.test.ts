import { describe, it, expect, vi } from 'vitest';
import {
  isDefinitionValid,
  hasValidDefinition,
  lookupWordInDictionaries,
  findLongestMatchingWord,
  lookupWord,
  lookupEtymology,
} from '../dictionary';
import type { DictionaryEntry, DefinitionResult } from '../../shared/types';

vi.mock('../../data/mandarin.json', () => ({
  default: {
    '好': [
      { traditional: '好', simplified: '好', romanisation: 'hao3', definitions: ['good', 'well'] },
      { traditional: '好', simplified: '好', romanisation: 'hao4', definitions: ['to be fond of'] },
    ],
    '字': [
      { traditional: '字', simplified: '字', romanisation: 'zi4', definitions: ['letter', 'symbol', 'character'] },
    ],
    '好字': [
      { traditional: '好字', simplified: '好字', romanisation: 'hao3 zi4', definitions: ['good handwriting'] },
    ],
    '廣東話': [
      {
        traditional: '廣東話',
        simplified: '广东话',
        romanisation: 'Guang3dong1 hua4',
        definitions: ['Cantonese (dialect)', '(Cantonese) Cantonese'],
      },
    ],
  },
}));

vi.mock('../../data/cantonese.json', () => ({
  default: {
    '好': [
      { traditional: '好', simplified: '好', romanisation: 'hou2', definitions: ['good', 'well'] },
    ],
    '字': [
      { traditional: '字', simplified: '字', romanisation: 'zi6', definitions: ['character', 'letter'] },
    ],
  },
}));

vi.mock('../../data/etymology.json', () => ({
  default: {
    '好': { character: '好', decomposition: '⿰女子', radical: '女', etymologyType: 'ideographic', hint: 'woman with child' },
    '字': { character: '字', decomposition: '⿱宀子', radical: '宀', etymologyType: 'pictophonetic', semantic: '宀', phonetic: '子' },
  },
}));

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
    expect(isDefinitionValid([makeEntry('pin1', ['', '   '])])).toBe(false);
  });

  it('returns true when at least one definition is non-empty', () => {
    expect(isDefinitionValid([makeEntry('pin1', ['to spell'])])).toBe(true);
  });

  it('returns true when one entry has a valid definition among multiple empty ones', () => {
    expect(isDefinitionValid([makeEntry('pin1', ['']), makeEntry('pin3', ['spelling'])])).toBe(true);
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
      mandarin: { entries: [makeEntry('pin1', ['to spell'])] },
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

describe('lookupWordInDictionaries', () => {
  it('returns mandarin and cantonese entries for a known word', () => {
    const result = lookupWordInDictionaries('好');
    expect(result.word).toBe('好');
    expect(result.mandarin.entries.length).toBeGreaterThan(0);
    expect(result.cantonese.entries.length).toBeGreaterThan(0);
  });

  it('returns multiple mandarin entries for words with multiple readings', () => {
    const result = lookupWordInDictionaries('好');
    expect(result.mandarin.entries.length).toBe(2);
    expect(result.mandarin.entries[0]!.romanisation).toBe('hao3');
    expect(result.mandarin.entries[1]!.romanisation).toBe('hao4');
  });

  it('filters out Cantonese-marked definitions from mandarin entries', () => {
    const result = lookupWordInDictionaries('廣東話');
    const defs = result.mandarin.entries.flatMap(e => e.definitions);
    expect(defs.every(d => !d.toLowerCase().includes('(cantonese)'))).toBe(true);
  });

  it('does not filter cantonese entries', () => {
    const result = lookupWordInDictionaries('字');
    expect(result.cantonese.entries.length).toBeGreaterThan(0);
  });

  it('returns empty entries for an unknown word', () => {
    const result = lookupWordInDictionaries('囧');
    expect(result.mandarin.entries).toEqual([]);
    expect(result.cantonese.entries).toEqual([]);
  });

  it('attaches etymology when characters are in the etymology dictionary', () => {
    const result = lookupWordInDictionaries('好');
    expect(result.etymology).toBeDefined();
    expect(result.etymology![0]!.character).toBe('好');
  });

  it('omits etymology when no characters are found', () => {
    const result = lookupWordInDictionaries('囧');
    expect(result.etymology).toBeUndefined();
  });
});

describe('lookupEtymology', () => {
  it('returns etymology for known characters', () => {
    const result = lookupEtymology('好字');
    expect(result.length).toBe(2);
    expect(result[0]!.character).toBe('好');
    expect(result[1]!.character).toBe('字');
  });

  it('skips unknown characters', () => {
    const result = lookupEtymology('好囧');
    expect(result.length).toBe(1);
    expect(result[0]!.character).toBe('好');
  });

  it('returns empty array when no characters are found', () => {
    expect(lookupEtymology('囧')).toEqual([]);
  });
});

describe('findLongestMatchingWord', () => {
  it('returns null when no match exists', () => {
    expect(findLongestMatchingWord('囧')).toBeNull();
  });

  it('returns the longest matching prefix', () => {
    const result = findLongestMatchingWord('好字囧');
    expect(result).not.toBeNull();
    expect(result!.matchedWord).toBe('好字');
  });

  it('falls back to a shorter match when the longest has no definition', () => {
    // '好囧' is not in the dictionary but '好' is
    const result = findLongestMatchingWord('好囧');
    expect(result).not.toBeNull();
    expect(result!.matchedWord).toBe('好');
  });

  it('returns definition alongside matched word', () => {
    const result = findLongestMatchingWord('字');
    expect(result!.definition.word).toBe('字');
    expect(result!.definition.mandarin.entries.length).toBeGreaterThan(0);
  });
});

describe('lookupWord', () => {
  it('returns a definition for a known word', () => {
    const result = lookupWord('好');
    expect(result.word).toBe('好');
    expect(result.mandarin.entries.length).toBeGreaterThan(0);
  });

  it('sets word to the matched prefix, not the full input', () => {
    const result = lookupWord('好囧');
    expect(result.word).toBe('好');
  });

  it('throws when the word is not found', () => {
    expect(() => lookupWord('囧')).toThrow('囧');
  });
});
