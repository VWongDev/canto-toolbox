import { describe, it, expect } from 'vitest';
import { toToneMarks } from '../pinyin.js';

describe('toToneMarks', () => {
  it('marks each tone on a simple syllable', () => {
    expect(toToneMarks('ma1 ma2 ma3 ma4')).toBe('mā má mǎ mà');
  });

  it('leaves neutral-tone syllables unmarked', () => {
    expect(toToneMarks('ma5')).toBe('ma');
    expect(toToneMarks('dong1 xi5')).toBe('dōng xi');
  });

  it('prefers a over other vowels', () => {
    expect(toToneMarks('hao3')).toBe('hǎo');
    expect(toToneMarks('jiang1')).toBe('jiāng');
  });

  it('marks the o of ou rather than the u', () => {
    expect(toToneMarks('hou4')).toBe('hòu');
  });

  it('marks the last vowel when neither a nor e is present', () => {
    expect(toToneMarks('liu2')).toBe('liú');
    expect(toToneMarks('gui1')).toBe('guī');
  });

  it('converts the u: digraph to ü', () => {
    expect(toToneMarks('lu:4')).toBe('lǜ');
    expect(toToneMarks('nu:3')).toBe('nǚ');
  });

  it('preserves capitalisation of proper nouns', () => {
    expect(toToneMarks('Xiang1 gang3')).toBe('Xiāng gǎng');
    expect(toToneMarks('Zhong1 guo2')).toBe('Zhōng guó');
  });

  it('passes through tokens that are not numbered syllables', () => {
    expect(toToneMarks('')).toBe('');
    expect(toToneMarks('nǐ hǎo')).toBe('nǐ hǎo');
    expect(toToneMarks('CD ROM')).toBe('CD ROM');
    expect(toToneMarks('xi1 · an1')).toBe('xī · ān');
  });

  it('preserves the original spacing', () => {
    expect(toToneMarks('  ni3   hao3 ')).toBe('  nǐ   hǎo ');
  });
});
