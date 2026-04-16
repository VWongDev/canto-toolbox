// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { createPronunciationSection, type PronunciationSectionConfig } from '../pronunciation-section';
import type { DictionaryEntry } from '../../types';

const makeConfig = (overrides: Partial<PronunciationSectionConfig> = {}): PronunciationSectionConfig => ({
  sectionClassName: 'test-section',
  labelClassName: 'test-label',
  pronunciationClassName: (key) => `test-${key}`,
  groupClassName: 'test-group',
  createDefinitionElement: (defs) => {
    const el = document.createElement('ul');
    el.textContent = defs.join(', ');
    return el;
  },
  ...overrides,
});

const makeEntry = (romanisation: string, definitions: string[]): DictionaryEntry => ({
  traditional: '字',
  simplified: '字',
  romanisation,
  definitions,
});

describe('createPronunciationSection', () => {
  it('renders the section label', () => {
    const el = createPronunciationSection({ entries: [makeEntry('hao3', ['good'])] }, 'Mandarin', 'pinyin', makeConfig());
    expect(el.querySelector('.test-label')?.textContent).toBe('Mandarin');
  });

  it('adds single-pronunciation class when there is exactly one pronunciation group', () => {
    const el = createPronunciationSection({ entries: [makeEntry('hao3', ['good'])] }, 'Mandarin', 'pinyin', makeConfig());
    expect(el.classList.contains('single-pronunciation')).toBe(true);
  });

  it('does not add single-pronunciation class with multiple groups', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', ['good']), makeEntry('hao4', ['to like'])],
    }, 'Mandarin', 'pinyin', makeConfig());
    expect(el.classList.contains('single-pronunciation')).toBe(false);
  });

  it('groups entries sharing the same romanisation into one group element', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', ['good']), makeEntry('hao3', ['well'])],
    }, 'Mandarin', 'pinyin', makeConfig());
    expect(el.querySelectorAll('.test-group').length).toBe(1);
  });

  it('creates separate groups for different romanisations', () => {
    const el = createPronunciationSection({
      entries: [makeEntry('hao3', ['good']), makeEntry('hao4', ['to like'])],
    }, 'Mandarin', 'pinyin', makeConfig());
    expect(el.querySelectorAll('.test-group').length).toBe(2);
  });

  it('uses the pinyin pronunciation class for pinyin key', () => {
    const el = createPronunciationSection({ entries: [makeEntry('hao3', ['good'])] }, 'Mandarin', 'pinyin', makeConfig());
    expect(el.querySelector('.test-pinyin')).not.toBeNull();
  });

  it('uses the jyutping pronunciation class for jyutping key', () => {
    const el = createPronunciationSection({ entries: [makeEntry('hou2', ['good'])] }, 'Cantonese', 'jyutping', makeConfig());
    expect(el.querySelector('.test-jyutping')).not.toBeNull();
  });

  it('calls createDefinitionElement with merged definitions from the same romanisation group', () => {
    const createDefinitionElement = vi.fn().mockReturnValue(document.createElement('ul'));
    createPronunciationSection({
      entries: [makeEntry('hao3', ['good', 'well']), makeEntry('hao3', ['fine'])],
    }, 'Mandarin', 'pinyin', makeConfig({ createDefinitionElement }));
    expect(createDefinitionElement).toHaveBeenCalledWith(['good', 'well', 'fine']);
  });

  it('filters out blank definitions when grouping', () => {
    const createDefinitionElement = vi.fn().mockReturnValue(document.createElement('ul'));
    createPronunciationSection({
      entries: [makeEntry('hao3', ['good', '', '  '])],
    }, 'Mandarin', 'pinyin', makeConfig({ createDefinitionElement }));
    expect(createDefinitionElement).toHaveBeenCalledWith(['good']);
  });

  it('renders no groups when entries are empty', () => {
    const el = createPronunciationSection({ entries: [] }, 'Mandarin', 'pinyin', makeConfig());
    expect(el.querySelectorAll('.test-group').length).toBe(0);
  });

  it('does not show definition element when defs are empty and showDefinitionIfEmpty is not set', () => {
    const createDefinitionElement = vi.fn().mockReturnValue(document.createElement('ul'));
    createPronunciationSection({
      entries: [makeEntry('hao3', ['', '  '])],
    }, 'Mandarin', 'pinyin', makeConfig({ createDefinitionElement }));
    expect(createDefinitionElement).not.toHaveBeenCalled();
  });

  it('shows definition element when defs are empty and showDefinitionIfEmpty returns true', () => {
    const createDefinitionElement = vi.fn().mockReturnValue(document.createElement('ul'));
    createPronunciationSection({
      entries: [makeEntry('hao3', [])],
    }, 'Mandarin', 'pinyin', makeConfig({
      createDefinitionElement,
      showDefinitionIfEmpty: () => true,
    }));
    expect(createDefinitionElement).toHaveBeenCalled();
  });
});
