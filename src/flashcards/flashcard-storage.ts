import { StorageManager } from '../shared/storage-manager.js';
import type { Statistics } from '../shared/types';

export interface FlashcardStorage {
  getStatistics(): Promise<Statistics>;
}

export class FlashcardStorageClient implements FlashcardStorage {
  constructor(private readonly manager: StorageManager) {}

  getStatistics(): Promise<Statistics> {
    return this.manager.getStatistics();
  }
}

export const flashcardStorage = new FlashcardStorageClient(
  new StorageManager(chrome.storage.sync, chrome.storage.local)
);
