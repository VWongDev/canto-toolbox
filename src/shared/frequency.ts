import type { FrequencyBand } from './types.js';

/**
 * How common a word is, banded for a learner deciding what to study next. A
 * bare rank ("14,882nd") is hard to act on; a band answers the actual
 * question, which is whether the word is worth the effort now.
 *
 * The boundaries follow the usual coverage milestones for Chinese: the first
 * thousand words cover roughly 70% of running text, the first three thousand
 * around 85%, and ten thousand approaches the ceiling for ordinary material.
 */
const BANDS: ReadonlyArray<{ limit: number; band: FrequencyBand }> = [
  { limit: 1000, band: 'core' },
  { limit: 3000, band: 'common' },
  { limit: 10000, band: 'frequent' },
  { limit: Infinity, band: 'uncommon' },
];

export const BAND_LABELS: Readonly<Record<FrequencyBand, string>> = {
  core: 'Core 1000',
  common: 'Common',
  frequent: 'Frequent',
  uncommon: 'Uncommon',
  rare: 'Rare',
};

export const BAND_DESCRIPTIONS: Readonly<Record<FrequencyBand, string>> = {
  core: 'Among the 1000 commonest words — learn this one',
  common: 'Among the 3000 commonest words',
  frequent: 'Among the 10,000 commonest words',
  uncommon: 'Outside the 10,000 commonest words',
  rare: 'Rare in everyday material',
};

/** A word missing from the corpus is rarer than its cap, not unranked. */
export function bandForRank(rank: number | undefined): FrequencyBand {
  if (rank === undefined || rank <= 0) return 'rare';
  return BANDS.find(({ limit }) => rank <= limit)!.band;
}
