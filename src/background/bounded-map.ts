/**
 * A map that automatically prunes to keep only the top N entries
 * by a numeric sort key when the limit is exceeded.
 */
export class BoundedMap<K, V> {
  private readonly maxSize: number;
  private readonly getSortKey: (value: V) => number;
  private readonly entries: Map<K, V>;

  constructor(maxSize: number, getSortKey: (value: V) => number, initial?: Iterable<[K, V]>) {
    this.maxSize = maxSize;
    this.getSortKey = getSortKey;
    this.entries = new Map(initial);
    this.prune();
  }

  get(key: K): V | undefined {
    return this.entries.get(key);
  }

  set(key: K, value: V): void {
    this.entries.set(key, value);
    if (this.entries.size > this.maxSize) {
      this.prune();
    }
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  toObject(): Record<string, V> {
    return Object.fromEntries(this.entries) as Record<string, V>;
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries.entries();
  }

  private prune(): void {
    if (this.entries.size <= this.maxSize) return;

    const sorted = [...this.entries.entries()].sort(
      (a, b) => this.getSortKey(b[1]) - this.getSortKey(a[1])
    );
    this.entries.clear();
    for (const [key, value] of sorted.slice(0, this.maxSize)) {
      this.entries.set(key, value);
    }
  }
}
