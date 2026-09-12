import { describe, it, expect } from 'vitest';
import { primaryGloss } from '../gloss.js';
import type { DefinitionResult, DictionaryEntry } from '../types.js';

function entry(definitions: string[]): DictionaryEntry {
  return { traditional: '好', simplified: '好', romanisation: 'hao3', definitions };
}

function definition(
  mandarin: DictionaryEntry[],
  cantonese: DictionaryEntry[] = [],
): DefinitionResult {
  return { word: '好', mandarin: { entries: mandarin }, cantonese: { entries: cantonese } };
}

describe('primaryGloss', () => {
  it('joins the senses of the Mandarin entry', () => {
    expect(primaryGloss(definition([entry(['good', 'well'])]))).toBe('good; well');
  });

  it('caps how many senses a prompt carries', () => {
    const gloss = primaryGloss(definition([entry(['a', 'b', 'c', 'd', 'e'])]));
    expect(gloss).toBe('a; b; c');
  });

  it('drops the romanisation out of a cross-reference', () => {
    expect(primaryGloss(definition([entry(['see 你好[ni3 hao3]'])]))).toBe('see 你好');
  });

  it('falls back to Cantonese when Mandarin has no entry', () => {
    expect(primaryGloss(definition([], [entry(['hello'])]))).toBe('hello');
  });

  it('does not repeat a sense carried by two entries', () => {
    expect(primaryGloss(definition([entry(['good']), entry(['good', 'fine'])]))).toBe('good; fine');
  });

  it('is empty when neither reading has a sense', () => {
    expect(primaryGloss(definition([]))).toBe('');
  });
});
