const TONE_MARKS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
};

const SYLLABLE = /^([a-zA-ZüÜ:]+)([1-5])$/;

/**
 * The vowel a tone mark sits on: `a` and `e` always win, the `o` of `ou`
 * takes it, and otherwise it falls on the last vowel of the syllable.
 */
function toneVowelIndex(syllable: string): number {
  const lower = syllable.toLowerCase();

  const priority = lower.indexOf('a') >= 0 ? 'a' : lower.indexOf('e') >= 0 ? 'e' : null;
  if (priority) return lower.indexOf(priority);

  const ou = lower.indexOf('ou');
  if (ou >= 0) return ou;

  for (let i = lower.length - 1; i >= 0; i--) {
    if (TONE_MARKS[lower[i]!]) return i;
  }
  return -1;
}

function convertSyllable(syllable: string, tone: number): string {
  const normalised = syllable.replace(/u:/gi, 'ü').replace(/v/g, 'ü').replace(/V/g, 'Ü');
  if (tone === 5) return normalised;

  const index = toneVowelIndex(normalised);
  if (index < 0) return normalised;

  const vowel = normalised[index]!;
  const marked = TONE_MARKS[vowel.toLowerCase()]![tone - 1]!;
  const cased = vowel === vowel.toUpperCase() ? marked.toUpperCase() : marked;

  return normalised.slice(0, index) + cased + normalised.slice(index + 1);
}

/**
 * Convert CC-CEDICT numbered pinyin ("ni3 hao3") into tone-marked pinyin
 * ("nǐ hǎo"). Tokens that are not numbered syllables are passed through, so
 * punctuation and already-converted text survive unchanged.
 */
export function toToneMarks(pinyin: string): string {
  return pinyin
    .split(/(\s+)/)
    .map(token => {
      const match = SYLLABLE.exec(token);
      return match ? convertSyllable(match[1]!, Number(match[2])) : token;
    })
    .join('');
}
