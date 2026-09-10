// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPronunciationSection } from '../pronunciation-section.js';
import type { DictionaryEntry } from '../types.js';

const makeEntry = (romanisation: string): DictionaryEntry => ({
  traditional: '你好',
  simplified: '你好',
  romanisation,
  definitions: ['hello'],
});

function toneClasses(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.romanisation-syllable')).map(node => node.className);
}

describe('tone colouring', () => {
  it('tags each Pinyin syllable with its tone class', () => {
    const el = createPronunciationSection({ entries: [makeEntry('ni3 hao3')] }, 'Mandarin', 'pinyin');

    expect(toneClasses(el)).toEqual([
      'romanisation-syllable tone-pinyin-3',
      'romanisation-syllable',
      'romanisation-syllable tone-pinyin-3',
    ]);
  });

  it('tags Jyutping syllables with their own scale', () => {
    const el = createPronunciationSection({ entries: [makeEntry('nei5 hou2')] }, 'Cantonese', 'jyutping');

    expect(toneClasses(el)).toEqual([
      'romanisation-syllable tone-jyutping-5',
      'romanisation-syllable',
      'romanisation-syllable tone-jyutping-2',
    ]);
  });

  it('still renders the tone mark, so colour is never the only cue', () => {
    const el = createPronunciationSection({ entries: [makeEntry('ni3 hao3')] }, 'Mandarin', 'pinyin');
    expect(el.querySelector('.definition-pinyin')?.textContent).toBe('nǐ hǎo');
  });

  it('keeps Jyutping tone digits intact', () => {
    const el = createPronunciationSection({ entries: [makeEntry('nei5 hou2')] }, 'Cantonese', 'jyutping');
    expect(el.querySelector('.definition-jyutping')?.textContent).toBe('nei5 hou2');
  });

  it('leaves untoned romanisation unclassified', () => {
    const el = createPronunciationSection({ entries: [makeEntry('CD')] }, 'Mandarin', 'pinyin');
    expect(toneClasses(el)).toEqual(['romanisation-syllable']);
  });
});

describe('pronunciation audio', () => {
  function stubVoices(...langs: string[]): void {
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => langs.map(lang => ({ lang, name: lang }) as SpeechSynthesisVoice),
      speak: vi.fn(),
      cancel: vi.fn(),
    });
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = '';
      voice: SpeechSynthesisVoice | null = null;
      constructor(public text: string) {}
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers no audio button when no word is supplied', () => {
    stubVoices('zh-CN');
    const el = createPronunciationSection({ entries: [makeEntry('ni3 hao3')] }, 'Mandarin', 'pinyin');
    expect(el.querySelector('.pronunciation-speak')).toBeNull();
  });

  it('offers an audio button for the word when one is supplied', () => {
    stubVoices('zh-CN');
    const el = createPronunciationSection(
      { entries: [makeEntry('ni3 hao3')] },
      'Mandarin',
      'pinyin',
      { word: '你好' },
    );

    const button = el.querySelector('.pronunciation-speak');
    expect(button).not.toBeNull();
    expect(button!.getAttribute('aria-label')).toContain('你好');
  });

  it('offers no audio button for a reading with no pronunciations', () => {
    stubVoices('zh-HK');
    const el = createPronunciationSection({ entries: [] }, 'Cantonese', 'jyutping', { word: '你好' });
    expect(el.querySelector('.pronunciation-speak')).toBeNull();
  });

  it('offers no Cantonese audio when only a Mandarin voice exists', () => {
    stubVoices('zh-CN');
    const el = createPronunciationSection(
      { entries: [makeEntry('nei5 hou2')] },
      'Cantonese',
      'jyutping',
      { word: '你好' },
    );

    expect(el.querySelector('.pronunciation-speak')).toBeNull();
  });

  it('offers no audio at all where the browser has no speech synthesis', () => {
    const el = createPronunciationSection(
      { entries: [makeEntry('ni3 hao3')] },
      'Mandarin',
      'pinyin',
      { word: '你好' },
    );

    expect(el.querySelector('.pronunciation-speak')).toBeNull();
  });

  it('speaks the word, not its romanisation, in the right voice', () => {
    stubVoices('zh-HK');
    const el = createPronunciationSection(
      { entries: [makeEntry('nei5 hou2')] },
      'Cantonese',
      'jyutping',
      { word: '你好' },
    );

    el.querySelector<HTMLElement>('.pronunciation-speak')!.click();

    const utterance = vi.mocked(globalThis.speechSynthesis.speak).mock.calls[0]![0];
    expect(utterance.text).toBe('你好');
    expect(utterance.lang).toBe('zh-HK');
  });
});
