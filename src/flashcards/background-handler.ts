import { registerHandlers } from '../shared/message-router.js';
import { STATISTICS_KEY, statisticsStore } from '../shared/statistics-store.js';
import { isLeech, reviewCard } from '../shared/scheduler.js';
import { DIRECTION_FIELD, progressFor } from '../shared/statistics-utils.js';
import type { FlashcardProgress, Statistics, WordStatistics } from '../shared/types.js';

/**
 * A word buries itself once one of its cards becomes a leech. Burying is the
 * same state as the reader retiring a word by hand, so the stats page offers
 * one control to undo either: the deck stops spending slots on it, and nothing
 * about its progress is thrown away.
 */
function withLeechBuried(stat: WordStatistics, progress: FlashcardProgress): WordStatistics {
  return isLeech(progress) ? { ...stat, suppressed: true } : stat;
}

export function register(): void {
  registerHandlers({
    update_flashcard: async (msg) => {
      // A rating that predates the other card directions is a recognition one.
      const direction = msg.direction ?? 'recognition';

      await statisticsStore.mutate<Statistics>(STATISTICS_KEY, (existing) => {
        const stats = { ...(existing ?? {}) };
        const stat = stats[msg.word];
        if (!stat) return stats;

        const progress = reviewCard(progressFor(stat, direction), msg.rating);
        stats[msg.word] = {
          ...withLeechBuried(stat, progress),
          [DIRECTION_FIELD[direction]]: progress,
        };
        return stats;
      });
      return { success: true, type: 'update_flashcard' };
    },

    set_word_status: async (msg) => {
      await statisticsStore.mutate<Statistics>(STATISTICS_KEY, (existing) => {
        const stats = { ...(existing ?? {}) };
        const stat = stats[msg.word];
        if (!stat) return stats;

        const next = { ...stat };
        if (msg.suppressed !== undefined) {
          if (msg.suppressed) next.suppressed = true;
          else delete next.suppressed;
        }
        if (msg.pinned !== undefined) {
          if (msg.pinned) next.pinned = true;
          else delete next.pinned;
        }

        stats[msg.word] = next;
        return stats;
      });
      return { success: true, type: 'set_word_status' };
    },
  });
}
