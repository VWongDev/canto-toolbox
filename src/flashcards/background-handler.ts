import { registerHandlers } from '../shared/message-router.js';
import { STATISTICS_KEY, statisticsStore } from '../shared/statistics-store.js';
import { reviewCard } from '../shared/scheduler.js';
import type { Statistics } from '../shared/types.js';

export function register(): void {
  registerHandlers({
    update_flashcard: async (msg) => {
      await statisticsStore.mutate<Statistics>(STATISTICS_KEY, (existing) => {
        const stats = { ...(existing ?? {}) };
        const stat = stats[msg.word];
        if (!stat) return stats;

        stats[msg.word] = {
          ...stat,
          flashcard: reviewCard(stat.flashcard, msg.rating),
        };
        return stats;
      });
      return { success: true, type: 'update_flashcard' };
    },
  });
}
