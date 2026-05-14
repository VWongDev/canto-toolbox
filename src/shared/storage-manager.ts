export class StorageManager {
  private readonly sync: chrome.storage.StorageArea;
  private readonly local: chrome.storage.StorageArea;

  constructor(sync: chrome.storage.StorageArea, local: chrome.storage.StorageArea) {
    this.sync = sync;
    this.local = local;
  }

  async readSync(key: string): Promise<unknown> {
    try {
      return (await this.sync.get([key]))[key];
    } catch (error) {
      console.warn('[Storage] Failed to read from sync storage:', error);
      return undefined;
    }
  }

  async readLocal(key: string): Promise<unknown> {
    try {
      return (await this.local.get([key]))[key];
    } catch (error) {
      console.warn('[Storage] Failed to read from local storage:', error);
      return undefined;
    }
  }

  async writeSync(key: string, value: unknown): Promise<void> {
    await this.sync.set({ [key]: value });
  }

  async writeLocal(key: string, value: unknown): Promise<void> {
    await this.local.set({ [key]: value });
  }
}
