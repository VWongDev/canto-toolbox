import { schedulesOf } from '../shared/statistics-utils.js';
import type { Statistics } from '../shared/types.js';

/**
 * What a reader opening the page actually wants to know: how much is owed now,
 * how much lands today, and whether the answers have been going in. The word
 * list alone answers none of it — it is ordered by how often a word was
 * hovered, which says nothing about what is worth doing next.
 */

const DAY_MS = 86_400_000;

export interface StudyOverview {
  tracked: number;
  retired: number;
  /** Cards the scheduler already owes. */
  dueNow: number;
  /** Cards owed by this time tomorrow, the ones already owed included. */
  dueToday: number;
  reviews: number;
  /** Share of reviews answered Good or Easy, or undefined before any were. */
  accuracy: number | undefined;
}

export function summarise(statistics: Statistics, now: number = Date.now()): StudyOverview {
  const overview: StudyOverview = {
    tracked: 0,
    retired: 0,
    dueNow: 0,
    dueToday: 0,
    reviews: 0,
    accuracy: undefined,
  };

  let reviewed = 0;
  let correct = 0;

  for (const stat of Object.values(statistics)) {
    overview.tracked++;

    if (stat.suppressed) {
      overview.retired++;
      continue;
    }

    for (const progress of schedulesOf(stat)) {
      const due = progress.srs?.due;
      if (due !== undefined) {
        if (due <= now) overview.dueNow++;
        if (due <= now + DAY_MS) overview.dueToday++;
      }

      overview.reviews += progress.reviews;

      // Reviews recorded before answers were counted have no correct tally;
      // including them would report an accuracy that is merely old.
      if (progress.correct !== undefined) {
        reviewed += progress.reviews;
        correct += progress.correct;
      }
    }
  }

  if (reviewed > 0) overview.accuracy = correct / reviewed;

  return overview;
}
