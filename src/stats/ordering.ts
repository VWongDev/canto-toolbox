import { bandForRank } from '../shared/frequency.js';
import { nextDueAt } from '../shared/statistics-utils.js';
import type { FrequencyBand, Statistics, WordStatistics } from '../shared/types.js';

/**
 * How the word list is filtered and ordered. Hover count answers "what have I
 * been reading"; a learner deciding what to do next is asking something else —
 * which of these are common enough to be worth the effort, and which are owed
 * a review.
 */

export type SortKey = 'studied' | 'frequency' | 'due' | 'recent';

export const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  studied: 'Most studied',
  frequency: 'Commonest first',
  due: 'Due soonest',
  recent: 'Recently seen',
};

export const DEFAULT_SORT: SortKey = 'studied';

export function isSortKey(value: string | undefined): value is SortKey {
  return value !== undefined && value in SORT_LABELS;
}

export function bandOf(stat: WordStatistics): FrequencyBand {
  return bandForRank(stat.rank);
}

const COMPARATORS: Readonly<Record<SortKey, (a: WordStatistics, b: WordStatistics) => number>> = {
  studied: (a, b) => b.count - a.count,
  // An unranked word is rarer than the corpus cap, so it sorts last rather
  // than first, which is where a missing rank would otherwise put it.
  frequency: (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity),
  // A word with no schedule is not owed at all, so it follows every word that is.
  due: (a, b) => (nextDueAt(a) ?? Infinity) - (nextDueAt(b) ?? Infinity),
  recent: (a, b) => b.lastSeen - a.lastSeen,
};

export function sortWords(words: string[], statistics: Statistics, sort: SortKey): string[] {
  const compare = COMPARATORS[sort];

  return [...words].sort((a, b) => {
    const statA = statistics[a];
    const statB = statistics[b];
    if (!statA || !statB) return 0;

    const ordered = compare(statA, statB);
    // Ties keep a stable, meaningful order instead of falling back to whatever
    // order the record happened to be in.
    return ordered !== 0 ? ordered : statB.count - statA.count;
  });
}
