import { RedundantStore } from './redundant-store.js';
import { StorageManager } from './storage-manager.js';

/**
 * The single storage key and store instance for word statistics. The popup
 * (write), stats (read/clear) and flashcard (review progress) features all
 * address the same record, so the key and the sync/local area layout live here
 * rather than being re-declared per feature. Each feature still owns its own
 * access policy on top — what to merge, what to cap, what to increment.
 */
export const STATISTICS_KEY = 'wordStatistics';

export const statisticsStore = new RedundantStore(
  new StorageManager(chrome.storage.sync, chrome.storage.local)
);
