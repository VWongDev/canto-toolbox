import { RedundantStore } from '../shared/redundant-store.js';
import { STATISTICS_KEY, statisticsStore } from '../shared/statistics-store.js';
import { createBatchedDebounce } from '../shared/debounce.js';
import { BoundedMap } from '../shared/bounded-map.js';
import type { Statistics } from '../shared/types';

const DEBOUNCE_DELAY = 500;
const MAX_WORDS = 500;

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
        (entry) => entry.count,
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
