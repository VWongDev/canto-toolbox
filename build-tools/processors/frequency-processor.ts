import { createRequire } from 'module';

/**
 * Word frequency from SUBTLEX-CH, the standard Chinese subtitle corpus:
 *
 *   Cai, Q., & Brysbaert, M. (2010). SUBTLEX-CH: Chinese Word and Character
 *   Frequencies Based on Film Subtitles. PLoS ONE, 5(6), e10729.
 *
 * Shipped via the `chinese-lexicon` package (ISC) as a build-time dependency —
 * none of it reaches the extension except the compact rank map written here.
 *
 * The package also exposes an HSK helper, but it *estimates* a level from
 * character difficulty when a word is not on the official list, which would
 * mislabel words. Only the measured frequency is used.
 */

const require = createRequire(import.meta.url);

interface FrequencyEntry {
  rank?: number;
  count?: number;
}

/**
 * Ranks past this point say nothing a learner can act on — the difference
 * between the 45,000th and 60,000th commonest word is "both rare". Capping
 * keeps the shipped file small; an absent word is simply rarer than the cap.
 */
export const FREQUENCY_LIMIT = 20000;

export function processFrequencyData(): Record<string, number> {
  const { movieWordFrequencies } = require('chinese-lexicon/statistics/movieWordFrequency') as {
    movieWordFrequencies: Record<string, FrequencyEntry>;
  };

  const ranks: Record<string, number> = {};

  for (const [word, entry] of Object.entries(movieWordFrequencies)) {
    const rank = entry?.rank;
    if (typeof rank !== 'number' || rank > FREQUENCY_LIMIT) continue;
    ranks[word] = rank;
  }

  console.log(`[Build] Loaded word frequencies: ${Object.keys(ranks).length} entries`);
  return ranks;
}
