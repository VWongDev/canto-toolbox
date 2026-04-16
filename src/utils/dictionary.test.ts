import { describe, it, expect, vi } from 'vitest';

// Fixtures are defined inline so they survive vi.mock hoisting.
// Data is shaped exactly like the built dictionary JSON files, using real
// entries from CC-CEDICT / CC-Canto for 好, 你好, 中文, 廣東話, and 係.

vi.mock('../data/mandarin.json', () => ({
  default: {
    // Single character with two readings
    '好': [
      {
        traditional: '好',
        simplified: '好',
        romanisation: 'hao3',
        definitions: ['good', 'well', 'proper', 'good to', 'easy to', 'very'],
      },
      {
        traditional: '好',
        simplified: '好',
        romanisation: 'hao4',
        definitions: ['to be fond of', 'to have a tendency to', 'to be prone to'],
      },
    ],
    // Two-character word
    '你好': [
      {
        traditional: '你好',
        simplified: '你好',
        romanisation: 'ni3 hao3',
        definitions: ['Hello!', 'Hi!', 'How are you?'],
      },
    ],
    // Mandarin-only word
    '中文': [
      {
        traditional: '中文',
        simplified: '中文',
        romanisation: 'Zhong1 wen2',
        definitions: ['Chinese language'],
      },
    ],
    // Entry where one definition contains the Cantonese marker and must be filtered
    '廣東話': [
      {
        traditional: '廣東話',
        simplified: '广东话',
        romanisation: 'Guang3 dong1 hua4',
        definitions: [
          'Cantonese (language)',
          '(Cantonese) colloquial Cantonese expression',
        ],
      },
    ],
    // Entry whose only definition is the Cantonese marker — should be dropped entirely
    '啩': [
      {
        traditional: '啩',
        simplified: '啩',
        romanisation: 'gua3',
        definitions: ['(Cantonese) sentence-final particle expressing assumption'],
      },
    ],
  },
}));

vi.mock('../data/cantonese.json', () => ({
  default: {
    '好': [
      {
        traditional: '好',
        simplified: '好',
        romanisation: 'hou2',
        definitions: ['good', 'well'],
      },
    ],
    // Cantonese-only word (copula)
    '係': [
      {
        traditional: '係',
        simplified: '系',
        romanisation: 'hai6',
        definitions: ['is', 'are', 'yes'],
      },
    ],
    '廣東話': [
      {
        traditional: '廣東話',
        simplified: '广东话',
        romanisation: 'gwong2 dung1 waa2',
        definitions: ['Cantonese language', 'Cantonese dialect'],
      },
    ],
  },
}));

vi.mock('../data/etymology.json', () => ({
  default: {
    '好': {
      character: '好',
      decomposition: '⿰女子',
      radical: '女',
      etymologyType: 'ideographic',
      hint: 'a woman with a child; what is good',
    },
    '中': {
      character: '中',
      decomposition: '⿼口丨',
      radical: '丨',
      etymologyType: 'ideographic',
      hint: 'an arrow hitting the center of a target',
    },
  },
}));

import {
  lookupWordInDictionaries,
  isDefinitionValid,
  hasValidDefinition,
  findLongestMatchingWord,
  lookupWord,
  lookupEtymology,
} from './dictionary';

// ---------------------------------------------------------------------------
// isDefinitionValid
// ---------------------------------------------------------------------------

describe('isDefinitionValid', () => {
  it('returns false for empty entry list', () => {
    expect(isDefinitionValid([])).toBe(false);
  });

  it('returns false when all definitions are empty strings', () => {
    expect(
      isDefinitionValid([
        { traditional: '好', simplified: '好', romanisation: 'hao3', definitions: ['', '  '] },
      ]),
    ).toBe(false);
  });

  it('returns true when at least one non-empty definition exists', () => {
    expect(
      isDefinitionValid([
        { traditional: '好', simplified: '好', romanisation: 'hao3', definitions: ['good'] },
      ]),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasValidDefinition
// ---------------------------------------------------------------------------

describe('hasValidDefinition', () => {
  it('returns true when mandarin entries are valid', () => {
    const result = lookupWordInDictionaries('中文');
    expect(hasValidDefinition(result)).toBe(true);
  });

  it('returns true when only cantonese entries are valid', () => {
    const result = lookupWordInDictionaries('係');
    expect(hasValidDefinition(result)).toBe(true);
  });

  it('returns false when both are empty', () => {
    const result = lookupWordInDictionaries('zzz');
    expect(hasValidDefinition(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lookupWordInDictionaries
// ---------------------------------------------------------------------------

describe('lookupWordInDictionaries', () => {
  it('returns entries from mandarin dict', () => {
    const result = lookupWordInDictionaries('中文');
    expect(result.mandarin.entries).toHaveLength(1);
    expect(result.mandarin.entries[0].romanisation).toBe('Zhong1 wen2');
    expect(result.cantonese.entries).toHaveLength(0);
  });

  it('returns entries from cantonese dict', () => {
    const result = lookupWordInDictionaries('係');
    expect(result.cantonese.entries).toHaveLength(1);
    expect(result.cantonese.entries[0].romanisation).toBe('hai6');
    expect(result.mandarin.entries).toHaveLength(0);
  });

  it('returns entries from both dicts when word exists in both', () => {
    const result = lookupWordInDictionaries('好');
    expect(result.mandarin.entries.length).toBeGreaterThan(0);
    expect(result.cantonese.entries.length).toBeGreaterThan(0);
  });

  it('returns empty entries for unknown word', () => {
    const result = lookupWordInDictionaries('zzz');
    expect(result.mandarin.entries).toHaveLength(0);
    expect(result.cantonese.entries).toHaveLength(0);
  });

  it('filters (Cantonese)-marker definitions from mandarin entries', () => {
    const result = lookupWordInDictionaries('廣東話');
    const defs = result.mandarin.entries.flatMap(e => e.definitions);
    expect(defs.every(d => !d.toLowerCase().includes('(cantonese)'))).toBe(true);
    expect(defs).toContain('Cantonese (language)');
  });

  it('drops mandarin entry entirely when all definitions are Cantonese-only', () => {
    const result = lookupWordInDictionaries('啩');
    expect(result.mandarin.entries).toHaveLength(0);
  });

  it('does not filter (Cantonese) marker from cantonese entries', () => {
    const result = lookupWordInDictionaries('廣東話');
    expect(result.cantonese.entries.length).toBeGreaterThan(0);
  });

  it('preserves multiple readings for the same character', () => {
    const result = lookupWordInDictionaries('好');
    expect(result.mandarin.entries).toHaveLength(2);
    const romanisations = result.mandarin.entries.map(e => e.romanisation);
    expect(romanisations).toContain('hao3');
    expect(romanisations).toContain('hao4');
  });

  it('attaches etymology when available', () => {
    const result = lookupWordInDictionaries('好');
    expect(result.etymology).toBeDefined();
    expect(result.etymology![0].character).toBe('好');
  });

  it('omits etymology field when no data exists for the word', () => {
    const result = lookupWordInDictionaries('係');
    expect(result.etymology).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// lookupEtymology
// ---------------------------------------------------------------------------

describe('lookupEtymology', () => {
  it('returns etymology for a known character', () => {
    const result = lookupEtymology('好');
    expect(result).toHaveLength(1);
    expect(result[0].character).toBe('好');
    expect(result[0].radical).toBe('女');
  });

  it('returns etymology for each character in a multi-character word', () => {
    // 中文: 中 has etymology, 文 does not
    const result = lookupEtymology('中文');
    expect(result).toHaveLength(1);
    expect(result[0].character).toBe('中');
  });

  it('returns empty array for unknown characters', () => {
    expect(lookupEtymology('zzz')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findLongestMatchingWord
// ---------------------------------------------------------------------------

describe('findLongestMatchingWord', () => {
  it('matches the full word when it exists', () => {
    const result = findLongestMatchingWord('你好');
    expect(result).not.toBeNull();
    expect(result!.matchedWord).toBe('你好');
  });

  it('falls back to shorter prefix when full word is not found', () => {
    // '你好嗎' is not in the fixture; should fall back to '你好'
    const result = findLongestMatchingWord('你好嗎');
    expect(result).not.toBeNull();
    expect(result!.matchedWord).toBe('你好');
  });

  it('falls back to single character when nothing longer matches', () => {
    // Only '好' exists as a standalone entry
    const result = findLongestMatchingWord('好朋友');
    expect(result).not.toBeNull();
    expect(result!.matchedWord).toBe('好');
  });

  it('returns null when no prefix matches', () => {
    expect(findLongestMatchingWord('zzz')).toBeNull();
  });

  it('prefers longer matches over shorter ones', () => {
    // Both '你好' (2 chars) and '你' hypothetically exist; fixture has '你好'
    // so the 2-char match should be preferred over 1-char '你' (not in fixture anyway)
    const result = findLongestMatchingWord('你好世界');
    expect(result!.matchedWord).toBe('你好');
  });
});

// ---------------------------------------------------------------------------
// lookupWord
// ---------------------------------------------------------------------------

describe('lookupWord', () => {
  it('returns definition for a known word', () => {
    const result = lookupWord('好');
    expect(result.word).toBe('好');
    expect(result.mandarin.entries.length).toBeGreaterThan(0);
  });

  it('sets word to the matched substring, not the input', () => {
    const result = lookupWord('你好嗎');
    expect(result.word).toBe('你好');
  });

  it('throws for a completely unknown word', () => {
    expect(() => lookupWord('zzz')).toThrow('Word "zzz" not found in dictionary');
  });
});
