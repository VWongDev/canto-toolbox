import { describe, it, expect } from 'vitest';
import { findVoice } from '../speech.js';

function voice(lang: string, name = lang): SpeechSynthesisVoice {
  return { lang, name, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

describe('findVoice', () => {
  it('picks a Cantonese voice for Jyutping', () => {
    const voices = [voice('en-US'), voice('zh-CN'), voice('zh-HK')];
    expect(findVoice(voices, 'jyutping')?.lang).toBe('zh-HK');
  });

  it('picks a Mandarin voice for Pinyin', () => {
    const voices = [voice('zh-HK'), voice('zh-CN')];
    expect(findVoice(voices, 'pinyin')?.lang).toBe('zh-CN');
  });

  it('never reads Jyutping with a Mandarin voice', () => {
    // The wrong pronunciation is worse than no audio at all.
    expect(findVoice([voice('zh-CN'), voice('zh-TW')], 'jyutping')).toBeNull();
  });

  it('accepts yue as Cantonese', () => {
    expect(findVoice([voice('yue')], 'jyutping')?.lang).toBe('yue');
  });

  it('matches regardless of case or underscores', () => {
    expect(findVoice([voice('zh_HK')], 'jyutping')?.lang).toBe('zh_HK');
    expect(findVoice([voice('ZH-CN')], 'pinyin')?.lang).toBe('ZH-CN');
  });

  it('accepts a regional variant of an acceptable tag', () => {
    expect(findVoice([voice('zh-HK-hant')], 'jyutping')?.lang).toBe('zh-HK-hant');
  });

  it('returns null when no voice fits', () => {
    expect(findVoice([voice('en-US'), voice('ja-JP')], 'pinyin')).toBeNull();
  });

  it('returns null for an empty voice list', () => {
    expect(findVoice([], 'pinyin')).toBeNull();
  });
});
