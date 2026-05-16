import { describe, it, expect } from 'vitest';
import { parseCedictFormat } from '../cedict-parser.js';

describe('parseCedictFormat', () => {
  it('parses the full CC-Canto format (pinyin + jyutping + definitions)', () => {
    const dict = parseCedictFormat('你好 你好 [ni3 hao3] {nei5 hou2} /hello/hi/');
    expect(dict['你好']).toEqual([
      {
        traditional: '你好',
        simplified: '你好',
        romanisation: 'nei5 hou2',
        definitions: ['hello', 'hi'],
      },
    ]);
  });

  it('parses the CC-CEDICT format (pinyin only, no jyutping)', () => {
    const dict = parseCedictFormat('漢字 汉字 [han4 zi4] /Chinese character/');
    // keyed by both traditional and simplified
    expect(dict['汉字']?.[0]).toMatchObject({
      traditional: '漢字',
      simplified: '汉字',
      romanisation: 'han4 zi4',
      definitions: ['Chinese character'],
    });
    expect(dict['漢字']?.[0]).toBe(dict['汉字']?.[0]);
  });

  it('parses a readings-only line (pinyin + jyutping, no definitions)', () => {
    const dict = parseCedictFormat('的 的 [de5] {dik1}');
    expect(dict['的']?.[0]).toMatchObject({
      romanisation: 'dik1',
      definitions: [],
    });
  });

  it('parses CC-Canto entries with EMPTY pinyin brackets (regression)', () => {
    // Real cccanto-webdist.txt entries that were silently dropped before
    // the [^]]* fix: empty "[]" with a jyutping body.
    const withDefs = parseCedictFormat('使𢃇 使𢃇 [] {sai2 lei2} /Operating a boat/');
    expect(withDefs['使𢃇']?.[0]).toMatchObject({
      romanisation: 'sai2 lei2',
      definitions: ['Operating a boat'],
    });

    const noDefs = parseCedictFormat('的 的 [] {dik1}');
    expect(noDefs['的']?.[0]).toMatchObject({
      romanisation: 'dik1',
      definitions: [],
    });
  });

  it('skips comment, blank, and whitespace-only lines', () => {
    const dict = parseCedictFormat(
      ['# CC-Canto header', '', '   ', '你好 你好 [ni3 hao3] {nei5 hou2} /hello/'].join('\n')
    );
    expect(Object.keys(dict)).toEqual(['你好']);
  });

  it('deduplicates identical (traditional, simplified, romanisation) entries', () => {
    const dict = parseCedictFormat(
      ['你好 你好 [ni3 hao3] {nei5 hou2} /hello/', '你好 你好 [ni3 hao3] {nei5 hou2} /hi/'].join('\n')
    );
    expect(dict['你好']).toHaveLength(1);
  });
});
