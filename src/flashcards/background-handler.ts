import { RedundantStore } from '../shared/redundant-store.js';
import { StorageManager } from '../shared/storage-manager.js';
import { registerHandlers } from '../shared/message-router.js';
import type { FlashcardRating, Statistics } from '../shared/types.js';

const STORAGE_KEY = 'wordStatistics';

const store = new RedundantStore(new StorageManager(chrome.storage.sync, chrome.storage.local));

function nextConsecutiveCorrect(current: number, rating: FlashcardRating): number {
  return rating === 'good' || rating === 'easy' ? current + 1 : 0;
}

export function register(): void {
  registerHandlers({
    update_flashcard: async (msg) => {
      await store.mutate<Statistics>(STORAGE_KEY, (existing) => {
        const stats = { ...(existing ?? {}) };
        const stat = stats[msg.word];
        if (!stat) return stats;

        const fc = stat.flashcard ?? { reviews: 0, consecutiveCorrect: 0 };
        stats[msg.word] = {
          ...stat,
          flashcard: {
            reviews: fc.reviews + 1,
            consecutiveCorrect: nextConsecutiveCorrect(fc.consecutiveCorrect, msg.rating),
            lastRating: msg.rating,
            lastReviewed: Date.now(),
          },
        };
        return stats;
      });
      return { success: true, type: 'update_flashcard' };
    },
  });
}
