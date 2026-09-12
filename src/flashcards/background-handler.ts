import { registerHandlers } from '../shared/message-router.js';
import { STATISTICS_KEY, statisticsStore } from '../shared/statistics-store.js';
import { reviewCard } from '../shared/scheduler.js';
import { DIRECTION_FIELD, progressFor } from '../shared/statistics-utils.js';
import type { Statistics } from '../shared/types.js';

export function register(): void {
  registerHandlers({
    update_flashcard: async (msg) => {
      // A rating that predates the other card directions is a recognition one.
      const direction = msg.direction ?? 'recognition';

      await statisticsStore.mutate<Statistics>(STATISTICS_KEY, (existing) => {
        const stats = { ...(existing ?? {}) };
        const stat = stats[msg.word];
        if (!stat) return stats;

        stats[msg.word] = {
          ...stat,
          [DIRECTION_FIELD[direction]]: reviewCard(progressFor(stat, direction), msg.rating),
        };
        return stats;
      });
      return { success: true, type: 'update_flashcard' };
    },
  });
}
