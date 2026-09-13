import { StorageManager } from './storage-manager.js';

/**
 * Owns the sync/local reconciliation policy: local holds the record and sync
 * carries it to the reader's other devices, so reads must reconcile both areas.
 * Keeping this in one place means the read and write paths can't drift apart.
 *
 * Value-shape concerns (merge strategy, size capping) stay with the caller via
 * the `reconcile` / `transform` callbacks — this class only owns which areas
 * exist and in what order they are written.
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
   * Read-modify-write over the **reconciled** record, written back to both
   * areas.
   *
   * Transforming one area alone was silently wrong: `chrome.storage.sync`
   * rejects any item over 8 KB, which this record passes at a few dozen words,
   * so past that point sync keeps a fossil of the words it held when it was
   * last small enough. A transform handed that fossil finds no entry for a word
   * tracked since, returns the record unchanged, and writes it back — which
   * succeeds, because it is the same bytes that already fit. Nothing is
   * recorded and nothing is raised.
   *
   * So both areas are read first and the caller transforms what a read would
   * have seen. Local is written first and is the area that cannot outgrow its
   * quota, which is what makes it the authority a reconciling read can prefer;
   * the sync write is best-effort carriage to other devices and is expected to
   * fail once the record is large. Either failing is logged and swallowed —
   * statistics are best-effort.
   */
  async mutate<T>(
    key: string,
    reconcile: (sync: T | undefined, local: T | undefined) => T,
    transform: (existing: T) => T,
  ): Promise<void> {
    const next = transform(await this.read(key, reconcile));

    try {
      await this.manager.writeLocal(key, next);
    } catch (error) {
      console.error('[Storage] Local write failed:', error);
    }

    try {
      await this.manager.writeSync(key, next);
    } catch (error) {
      console.warn('[Storage] Sync write failed; local holds the record:', error);
    }
  }

  /**
   * Write the same value to both areas, with no read or reconciliation first.
   * Used where a transform would get in the way — clearing, where reconciling
   * would hand back the very record being thrown away.
   */
  async writeBoth<T>(key: string, value: T): Promise<void> {
    await Promise.all([
      this.manager.writeSync(key, value),
      this.manager.writeLocal(key, value),
    ]);
  }
}
