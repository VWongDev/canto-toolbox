import { RedundantStore } from '../shared/redundant-store.js';
import { MAX_TRACKED_WORDS, STATISTICS_KEY, statisticsStore } from '../shared/statistics-store.js';
import { createBatchedDebounce } from '../shared/debounce.js';
import { BoundedMap } from '../shared/bounded-map.js';
import { lastReviewedAt } from '../shared/statistics-utils.js';
import type { Statistics } from '../shared/types';

const DEBOUNCE_DELAY = 500;

/** Longest sentence snippet kept per word. */
const MAX_CONTEXT_LENGTH = 60;

/**
 * Eviction tiers, ordered by what is lost when the entry goes. Each tier is
 * far enough above the last that the value ranking within it — a timestamp, a
 * hover count — can never carry an entry into the tier above.
 */
const REVIEWED_TIER = 4e15;
const PINNED_TIER = 2e15;
const SUPPRESSED_TIER = 1e15;

/**
 * Study count decides which words get evicted when the cap is hit, but a word
 * that has been reviewed carries progress that cannot be recovered by reading
 * it again — so anything in the flashcard deck outranks every unreviewed word
 * regardless of how rarely it is studied.
 *
 * Within the deck the tie-break is the last review: ranking every reviewed
 * word identically left the order among them to chance, which threw away real
 * FSRS history once the deck alone filled the cap. A word the reader retired
 * or asked for is a decision rather than progress, so it sits between the two.
 */
function evictionRank(entry: Statistics[string]): number {
  const reviewed = lastReviewedAt(entry);
  if (reviewed !== undefined) return REVIEWED_TIER + reviewed;
  if (entry.pinned) return PINNED_TIER + entry.count;
  if (entry.suppressed) return SUPPRESSED_TIER + entry.count;
  return entry.count;
}

/** What a sighting knows about the word beyond the fact that it happened. */
export interface WordDetails {
  context?: string;
  rank?: number;
}

export interface PopupStorage {
  updateStatistics(word: string, details?: WordDetails): void;
}

export class PopupStorageClient implements PopupStorage {
  private readonly queueUpdate: (word: string) => void;
  /**
   * Details ride alongside the debounced counts rather than through them: the
   * batcher accumulates a count per key, and only the first details seen for a
   * word in the batch are kept.
   */
  private readonly pendingDetails = new Map<string, WordDetails>();

  constructor(private readonly store: RedundantStore) {
    this.queueUpdate = createBatchedDebounce(
      (updates) => this.flushUpdates(updates),
      DEBOUNCE_DELAY
    );
  }

  updateStatistics(word: string, details: WordDetails = {}): void {
    if (!word?.trim()) {
      console.warn('[Background] Invalid word for statistics:', word);
      return;
    }

    if (!this.pendingDetails.has(word)) {
      const context = details.context?.trim();
      this.pendingDetails.set(word, {
        ...(context && { context: context.slice(0, MAX_CONTEXT_LENGTH) }),
        ...(details.rank !== undefined && { rank: details.rank }),
      });
    }

    this.queueUpdate(word);
  }

  private async flushUpdates(updates: Map<string, number>): Promise<void> {
    const details = new Map(this.pendingDetails);
    this.pendingDetails.clear();

    await this.store.mutate<Statistics>(STATISTICS_KEY, (existing) => {
      const now = Date.now();
      const stats = new BoundedMap<string, Statistics[string]>(
        MAX_TRACKED_WORDS,
        evictionRank,
        Object.entries(existing ?? {})
      );

      for (const [word, count] of updates) {
        const entry = stats.get(word) ?? { count: 0, firstSeen: now, lastSeen: now };
        entry.count += count;
        entry.lastSeen = now;

        const seen = details.get(word);

        // The sentence a word was first met in is the memory hook; later
        // sightings do not overwrite it.
        if (seen?.context && !entry.context) entry.context = seen.context;

        // Rank never changes, but writing it on every sighting backfills words
        // tracked before it was recorded.
        if (seen?.rank !== undefined) entry.rank = seen.rank;

        stats.set(word, entry);
      }

      return stats.toObject();
    });
  }
}

export const popupStorage = new PopupStorageClient(statisticsStore);
