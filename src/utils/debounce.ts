/**
 * Creates a debounced version of a function that delays execution until
 * after `delay` milliseconds have elapsed since the last call.
 *
 * @param fn - The function to debounce
 * @param delay - Milliseconds to wait before executing
 * @returns A debounced function that resets its timer on each call
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Creates a batched debounce function that accumulates keys and their counts,
 * then flushes them after `delay` milliseconds of inactivity.
 *
 * Each call increments the count for the given key. When the delay elapses
 * without new calls, the flush callback receives a Map of all accumulated
 * keys and their counts.
 *
 * @param flush - Callback invoked with the accumulated batch
 * @param delay - Milliseconds to wait before flushing
 * @returns A function that queues a key for batched processing
 */
export function createBatchedDebounce<K>(
  flush: (batch: Map<K, number>) => void,
  delay: number
): (key: K) => void {
  const pending = new Map<K, number>();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (key: K): void => {
    pending.set(key, (pending.get(key) || 0) + 1);

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      if (pending.size > 0) {
        const batch = new Map(pending);
        pending.clear();
        flush(batch);
      }
      timeoutId = null;
    }, delay);
  };
}
