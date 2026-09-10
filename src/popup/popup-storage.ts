import { RedundantStore } from '../shared/redundant-store.js';
import { STATISTICS_KEY, statisticsStore } from '../shared/statistics-store.js';
import { createBatchedDebounce } from '../shared/debounce.js';
import { BoundedMap } from '../shared/bounded-map.js';
import type { Statistics } from '../shared/types';

const DEBOUNCE_DELAY = 500;
const MAX_WORDS = 500;

/** Longest sentence snippet kept per word. */
const MAX_CONTEXT_LENGTH = 60;

/**
 * Study count decides which words get evicted when the cap is hit, but a word
 * that has been reviewed carries progress that cannot be recovered by reading
 * it again — so anything in the flashcard deck outranks every unreviewed word
 * regardless of how rarely it is studied.
 */
function evictionRank(entry: Statistics[string]): number {
  return entry.flashcard ? Number.MAX_SAFE_INTEGER : entry.count;
}

export interface PopupStorage {
  updateStatistics(word: string, context?: string): void;
}

export class PopupStorageClient implements PopupStorage {
  private readonly queueUpdate: (word: string) => void;
  /**
   * Contexts ride alongside the debounced counts rather than through them: the
   * batcher accumulates a count per key, and only the first context seen for a
   * word in the batch is kept.
   */
  private readonly pendingContexts = new Map<string, string>();

  constructor(private readonly store: RedundantStore) {
    this.queueUpdate = createBatchedDebounce(
      (updates) => this.flushUpdates(updates),
      DEBOUNCE_DELAY
    );
  }

  updateStatistics(word: string, context?: string): void {
    if (!word?.trim()) {
      console.warn('[Background] Invalid word for statistics:', word);
      return;
    }

    const trimmed = context?.trim();
    if (trimmed && !this.pendingContexts.has(word)) {
      this.pendingContexts.set(word, trimmed.slice(0, MAX_CONTEXT_LENGTH));
    }

    this.queueUpdate(word);
  }

  private async flushUpdates(updates: Map<string, number>): Promise<void> {
    const contexts = new Map(this.pendingContexts);
    this.pendingContexts.clear();

    await this.store.mutate<Statistics>(STATISTICS_KEY, (existing) => {
      const now = Date.now();
      const stats = new BoundedMap<string, Statistics[string]>(
        MAX_WORDS,
        evictionRank,
        Object.entries(existing ?? {})
      );

      for (const [word, count] of updates) {
        const entry = stats.get(word) ?? { count: 0, firstSeen: now, lastSeen: now };
        entry.count += count;
        entry.lastSeen = now;

        // The sentence a word was first met in is the memory hook; later
        // sightings do not overwrite it.
        const context = contexts.get(word);
        if (context && !entry.context) entry.context = context;

        stats.set(word, entry);
      }

      return stats.toObject();
    });
  }
}

export const popupStorage = new PopupStorageClient(statisticsStore);
