/**
 * Text-to-speech for the two readings, via the browser's own speech synthesis
 * — no permission, no network, no bundled audio.
 *
 * Voice matching is deliberately strict. Falling back from a Cantonese voice
 * to any Chinese voice would read Jyutping-labelled text in Mandarin, teaching
 * the wrong pronunciation, so Cantonese either speaks with a Cantonese voice
 * or does not speak at all.
 */

export type Reading = 'pinyin' | 'jyutping';

const READING_LANG: Readonly<Record<Reading, string>> = {
  pinyin: 'zh-CN',
  jyutping: 'zh-HK',
};

/** Language tags that genuinely carry each reading. */
const ACCEPTABLE_LANGS: Readonly<Record<Reading, readonly string[]>> = {
  pinyin: ['zh-cn', 'zh-hans', 'zh-sg', 'zh-tw', 'zh'],
  jyutping: ['zh-hk', 'yue', 'yue-hant', 'zh-yue'],
};

/** Both halves of the API are needed; either can be missing. */
function synthesis(): SpeechSynthesis | null {
  if (typeof globalThis.speechSynthesis === 'undefined') return null;
  if (typeof globalThis.SpeechSynthesisUtterance === 'undefined') return null;
  return globalThis.speechSynthesis;
}

function normalise(lang: string): string {
  return lang.toLowerCase().replace(/_/g, '-');
}

export function findVoice(voices: SpeechSynthesisVoice[], reading: Reading): SpeechSynthesisVoice | null {
  const acceptable = ACCEPTABLE_LANGS[reading];

  for (const wanted of acceptable) {
    const match = voices.find(voice => normalise(voice.lang) === wanted);
    if (match) return match;
  }

  // A regional variant of an acceptable tag (zh-HK-... ) still carries it.
  for (const wanted of acceptable) {
    const match = voices.find(voice => normalise(voice.lang).startsWith(`${wanted}-`));
    if (match) return match;
  }

  return null;
}

export function canSpeak(reading: Reading): boolean {
  const speech = synthesis();
  if (!speech) return false;

  // An empty list means the voices have not loaded yet, not that none exist;
  // the button stays available and the utterance falls back to its lang tag.
  const voices = speech.getVoices();
  return voices.length === 0 || findVoice(voices, reading) !== null;
}

export function speak(text: string, reading: Reading): void {
  const speech = synthesis();
  if (!speech || !text.trim()) return;

  speech.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = READING_LANG[reading];

  const voice = findVoice(speech.getVoices(), reading);
  if (voice) utterance.voice = voice;

  speech.speak(utterance);
}
