import type { DefinitionResult, DictionaryEntry } from './types.js';

/**
 * A short English gloss for a word, used where the meaning has to stand in for
 * the word itself — the front of a production card, where showing the whole
 * definition block would hand over the pronunciation too.
 */

/** Senses kept before the gloss stops being a prompt and starts being a list. */
const MAX_SENSES = 3;

/**
 * CC-CEDICT carries the pronunciation inside some senses ("see 你好[ni3 hao3]"),
 * and a cross-reference gives the answer away on a production card.
 */
const CROSS_REFERENCE = /\[[^\]]*\]/g;

function cleanSense(sense: string): string {
  return sense.replace(CROSS_REFERENCE, '').replace(/\s+/g, ' ').trim();
}

function sensesOf(entries: DictionaryEntry[]): string[] {
  const senses: string[] = [];

  for (const entry of entries) {
    for (const definition of entry.definitions) {
      const cleaned = cleanSense(definition);
      if (cleaned && !senses.includes(cleaned)) senses.push(cleaned);
    }
  }

  return senses;
}

/**
 * Mandarin senses first, falling back to Cantonese for the words CC-CEDICT
 * does not carry. Returns an empty string when neither reading has a usable
 * sense, which the caller shows as a missing definition rather than a blank.
 */
export function primaryGloss(definition: DefinitionResult, maxSenses = MAX_SENSES): string {
  const mandarin = sensesOf(definition.mandarin?.entries ?? []);
  const senses = mandarin.length > 0 ? mandarin : sensesOf(definition.cantonese?.entries ?? []);

  return senses.slice(0, maxSenses).join('; ');
}
