import { describe, it, expect } from 'vitest';
import { addDictionaryEntry, compactDictionary } from '../utils.js';
import type { Dictionary, DictionaryEntry } from '../../../src/shared/types.js';

const entry = (
  traditional: string,
  simplified: string,
  romanisation: string,
  definitions: string[],
): DictionaryEntry => ({ traditional, simplified, romanisation, definitions });

describe('compactDictionary', () => {
  it('stores a unique entry once and indexes both script forms', () => {
    const dict: Dictionary = {};
    addDictionaryEntry(dict, entry('漢字', '汉字', 'han4 zi4', ['Chinese character']));

    expect(compactDictionary(dict)).toEqual({
      rows: [['漢字', '汉字', 'han4 zi4', ['Chinese character']]],
      index: { 汉字: 0, 漢字: 0 },
    });
  });

  it('keeps pronunciation variants as separate rows sharing a key', () => {
    const dict: Dictionary = {
      好: [
        entry('好', '好', 'hao3', ['good']),
        entry('好', '好', 'hao4', ['to be fond of']),
      ],
    };

    expect(compactDictionary(dict)).toEqual({
      rows: [
        ['好', '好', 'hao3', ['good']],
        ['好', '好', 'hao4', ['to be fond of']],
      ],
      index: { 好: [0, 1] },
    });
  });

  it('returns empty rows when the dictionary is empty', () => {
    expect(compactDictionary({})).toEqual({ rows: [], index: {} });
  });
});
