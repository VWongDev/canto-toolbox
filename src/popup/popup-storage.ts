import { StorageManager } from '../shared/storage-manager.js';
import { createBatchedDebounce } from '../background/debounce.js';
import { BoundedMap } from '../background/bounded-map.js';
import type { Statistics } from '../shared/types';

const STORAGE_KEY = 'wordStatistics';
const DEBOUNCE_DELAY = 500;
const MAX_WORDS = 500;

export interface PopupStorage {
  updateStatistics(word: string): void;
}

export class PopupStorageClient implements PopupStorage {
  private readonly queueUpdate: (word: string) => void;

  constructor(private readonly manager: StorageManager) {
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
    try {
      await this.writeToArea('sync', updates);
    } catch (error) {
      console.error('[Background] Failed to update statistics in sync storage:', error);
      try {
        await this.writeToArea('local', updates);
      } catch (localError) {
        console.error('[Background] Failed to update local statistics:', localError);
      }
    }
  }

  private async writeToArea(area: 'sync' | 'local', updates: Map<string, number>): Promise<void> {
    const existing = (area === 'sync'
      ? await this.manager.readSync(STORAGE_KEY)
      : await this.manager.readLocal(STORAGE_KEY)) as Statistics ?? {};

    const now = Date.now();
    const stats = new BoundedMap<string, Statistics[string]>(
      MAX_WORDS,
      (entry) => entry.count,
      Object.entries(existing)
    );

    for (const [word, count] of updates) {
      const entry = stats.get(word) ?? { count: 0, firstSeen: now, lastSeen: now };
      entry.count += count;
      entry.lastSeen = now;
      stats.set(word, entry);
    }

    if (area === 'sync') {
      await this.manager.writeSync(STORAGE_KEY, stats.toObject());
    } else {
      await this.manager.writeLocal(STORAGE_KEY, stats.toObject());
    }
  }
}

export const popupStorage = new PopupStorageClient(
  new StorageManager(chrome.storage.sync, chrome.storage.local)
);
