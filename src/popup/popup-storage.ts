import { RedundantStore } from '../shared/redundant-store.js';
import { STATISTICS_KEY, statisticsStore } from '../shared/statistics-store.js';
import { createBatchedDebounce } from '../shared/debounce.js';
import { BoundedMap } from '../shared/bounded-map.js';
import type { Statistics } from '../shared/types';

const DEBOUNCE_DELAY = 500;
const MAX_WORDS = 500;

/**
 * Hover count decides which words get evicted when the cap is hit, but a word
 * that has been reviewed carries progress that cannot be recovered by hovering
 * it again — so anything in the flashcard deck outranks every unreviewed word
 * regardless of how rarely it is seen.
 */
function evictionRank(entry: Statistics[string]): number {
  return entry.flashcard ? Number.MAX_SAFE_INTEGER : entry.count;
}

export interface PopupStorage {
  updateStatistics(word: string): void;
}

export class PopupStorageClient implements PopupStorage {
  private readonly queueUpdate: (word: string) => void;

  constructor(private readonly store: RedundantStore) {
    this.queueUpdate = createBatchedDebounce(
      (updates) => this.flushUpdates(updates),
      DEBOUNCE_DELAY
    );
  }

  updateStatistics(word: string): void {
    if (!word?.trim()) {
      console.warn('[Background] Invalid word for statistics:', word);
      return;
    }
    this.queueUpdate(word);
  }

  private async flushUpdates(updates: Map<string, number>): Promise<void> {
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
        stats.set(word, entry);
      }

      return stats.toObject();
    });
  }
}

export const popupStorage = new PopupStorageClient(statisticsStore);
