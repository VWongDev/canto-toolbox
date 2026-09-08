import { StorageManager } from './storage-manager.js';

/**
 * Owns the sync/local reconciliation policy: data is written to sync storage
 * when possible and falls back to local, so reads must reconcile both areas.
 * Keeping this in one place means the read and write paths can't drift apart.
 *
 * Value-shape concerns (merge strategy, size capping) stay with the caller via
 * the `reconcile` / `transform` callbacks — this class only owns which areas
 * exist and in what order they are tried.
 */
export class RedundantStore {
  constructor(private readonly manager: StorageManager) {}

  /** Read both areas and reconcile them into a single value. */
  async read<T>(
    key: string,
    reconcile: (sync: T | undefined, local: T | undefined) => T,
  ): Promise<T> {
    const [sync, local] = await Promise.all([
      this.manager.readSync(key),
      this.manager.readLocal(key),
    ]);
    return reconcile(sync as T | undefined, local as T | undefined);
  }

  /**
   * Read-modify-write against sync storage, falling back to local if the sync
   * write fails. Each area is read and written independently so the fallback
   * recomputes against whatever local already holds. A failing local write is
   * logged and swallowed — statistics are best-effort.
   */
  async mutate<T>(key: string, transform: (existing: T | undefined) => T): Promise<void> {
    try {
      await this.writeArea('sync', key, transform);
    } catch (error) {
      console.error('[Storage] Sync write failed; falling back to local:', error);
      try {
        await this.writeArea('local', key, transform);
      } catch (localError) {
        console.error('[Storage] Local write failed:', localError);
      }
    }
  }

  /**
   * Write the same value to both areas. Used where a partial write would let a
   * reconciling read resurrect data from the other area (clearing, for
   * instance) — unlike {@link mutate}, neither area is a fallback for the other.
   */
  async writeBoth<T>(key: string, value: T): Promise<void> {
    await Promise.all([
      this.manager.writeSync(key, value),
      this.manager.writeLocal(key, value),
    ]);
  }

  private async writeArea<T>(
    area: 'sync' | 'local',
    key: string,
    transform: (existing: T | undefined) => T,
  ): Promise<void> {
    const existing = (area === 'sync'
      ? await this.manager.readSync(key)
      : await this.manager.readLocal(key)) as T | undefined;
    const next = transform(existing);
    if (area === 'sync') {
      await this.manager.writeSync(key, next);
    } else {
      await this.manager.writeLocal(key, next);
    }
  }
}
