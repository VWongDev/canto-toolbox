import { StorageManager } from '../shared/storage-manager.js';

export interface PopupStorage {
  updateStatistics(word: string): void;
}

export class PopupStorageClient implements PopupStorage {
  constructor(private readonly manager: StorageManager) {}

  updateStatistics(word: string): void {
    this.manager.updateStatistics(word);
  }
}

export const popupStorage = new PopupStorageClient(
  new StorageManager(chrome.storage.sync, chrome.storage.local)
);
