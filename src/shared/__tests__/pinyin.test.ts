import { describe, it, expect } from 'vitest';
import { toSyllables } from '../pinyin.js';

/** The rendered Pinyin of a romanisation, as the surfaces display it. */
function marked(romanisation: string): string {
  return toSyllables(romanisation, 'pinyin').map(s => s.text).join('');
}

describe('Pinyin tone marks', () => {
  it('marks each tone on a simple syllable', () => {
    expect(marked('ma1 ma2 ma3 ma4')).toBe('mā má mǎ mà');
  });

  it('leaves neutral-tone syllables unmarked', () => {
    expect(marked('ma5')).toBe('ma');
    expect(marked('dong1 xi5')).toBe('dōng xi');
  });

  it('prefers a over other vowels', () => {
    expect(marked('hao3')).toBe('hǎo');
    expect(marked('jiang1')).toBe('jiāng');
  });

  it('marks the o of ou rather than the u', () => {
    expect(marked('hou4')).toBe('hòu');
  });

  it('marks the last vowel when neither a nor e is present', () => {
    expect(marked('liu2')).toBe('liú');
    expect(marked('gui1')).toBe('guī');
  });

  it('converts the u: digraph to ü', () => {
    expect(marked('lu:4')).toBe('lǜ');
    expect(marked('nu:3')).toBe('nǚ');
  });

  it('preserves capitalisation of proper nouns', () => {
    expect(marked('Xiang1 gang3')).toBe('Xiāng gǎng');
    expect(marked('Zhong1 guo2')).toBe('Zhōng guó');
  });

  it('passes through tokens that are not numbered syllables', () => {
    expect(marked('')).toBe('');
    expect(marked('nǐ hǎo')).toBe('nǐ hǎo');
    expect(marked('CD ROM')).toBe('CD ROM');
    expect(marked('xi1 · an1')).toBe('xī · ān');
  });

  it('preserves the original spacing', () => {
    expect(marked('  ni3   hao3 ')).toBe('  nǐ   hǎo ');
  });
});

describe('toSyllables', () => {
  it('tags each Pinyin syllable with its tone and marks it', () => {
    expect(toSyllables('ni3 hao3', 'pinyin')).toEqual([
      { text: 'nǐ', tone: 3 },
      { text: ' ' },
      { text: 'hǎo', tone: 3 },
    ]);
  });

  it('keeps Jyutping digits, which is how it is written', () => {
    expect(toSyllables('nei5 hou2', 'jyutping')).toEqual([
      { text: 'nei5', tone: 5 },
      { text: ' ' },
      { text: 'hou2', tone: 2 },
    ]);
  });

  it('handles the Jyutping sixth tone', () => {
    expect(toSyllables('sing6', 'jyutping')).toEqual([{ text: 'sing6', tone: 6 }]);
  });

  it('leaves the neutral tone unmarked but tagged', () => {
    expect(toSyllables('ma5', 'pinyin')).toEqual([{ text: 'ma', tone: 5 }]);
  });

  it('passes through tokens with no tone', () => {
    expect(toSyllables('CD ROM', 'pinyin')).toEqual([
      { text: 'CD' },
      { text: ' ' },
      { text: 'ROM' },
    ]);
  });

  it('returns nothing for an empty romanisation', () => {
    expect(toSyllables('', 'pinyin')).toEqual([]);
  });

});
