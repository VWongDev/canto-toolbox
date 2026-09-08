// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createPronunciationSection } from '../pronunciation-section.js';
import type { DictionaryEntry } from '../types.js';

const makeEntry = (romanisation: string, definitions: string[]): DictionaryEntry => ({
  traditional: '字',
  simplified: '字',
  romanisation,
  definitions,
});

describe('createPronunciationSection', () => {
  it('renders the section label', () => {
    const el = createPronunciationSection({ entries: [makeEntry('hao3', ['good'])] }, 'Mandarin', 'pinyin');
    expect(el.querySelector('.definition-label')?.textContent).toBe('Mandarin');
  });

  it('groups entries sharing the same romanisation into one group element', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', ['good']), makeEntry('hao3', ['well'])],
    }, 'Mandarin', 'pinyin');
    expect(el.querySelectorAll('.pronunciation-group').length).toBe(1);
  });

  it('creates separate groups for different romanisations', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', ['good']), makeEntry('hao4', ['to like'])],
    }, 'Mandarin', 'pinyin');
    expect(el.querySelectorAll('.pronunciation-group').length).toBe(2);
  });

  it('uses the pinyin pronunciation class for pinyin key', () => {
    const el = createPronunciationSection({ entries: [makeEntry('hao3', ['good'])] }, 'Mandarin', 'pinyin');
    expect(el.querySelector('.definition-pinyin')).not.toBeNull();
  });

  it('uses the jyutping pronunciation class for jyutping key', () => {
    const el = createPronunciationSection({ entries: [makeEntry('hou2', ['good'])] }, 'Cantonese', 'jyutping');
    expect(el.querySelector('.definition-jyutping')).not.toBeNull();
  });

  it('merges definitions from the same romanisation group into one list', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', ['good', 'well']), makeEntry('hao3', ['fine'])],
    }, 'Mandarin', 'pinyin');
    expect(Array.from(el.querySelectorAll('.definition-item')).map(n => n.textContent))
      .toEqual(['good', 'well', 'fine']);
  });

  it('filters out blank definitions when grouping', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', ['good', '', '  '])],
    }, 'Mandarin', 'pinyin');
    expect(Array.from(el.querySelectorAll('.definition-item')).map(n => n.textContent))
      .toEqual(['good']);
  });

  it('renders no groups when entries are empty', () => {
    const el = createPronunciationSection({ entries: [] }, 'Mandarin', 'pinyin');
    expect(el.querySelectorAll('.pronunciation-group').length).toBe(0);
  });

  it('omits the definition list when a reading has no senses', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', ['', '  '])],
    }, 'Mandarin', 'pinyin');
    expect(el.querySelector('.definition-text')).toBeNull();
  });

  it('renders the placeholder for an empty reading when asked', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', [])],
    }, 'Mandarin', 'pinyin', { showPlaceholderWhenEmpty: true });
    expect(el.querySelector('.definition-text')?.textContent).toBe('Not found');
  });
});
