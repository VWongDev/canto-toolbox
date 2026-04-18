import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBatchedDebounce } from '../debounce';

describe('createBatchedDebounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('flushes accumulated counts after the delay', () => {
    const flush = vi.fn();
    const queue = createBatchedDebounce(flush, 100);
    queue('word');
    queue('word');
    queue('other');
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledOnce();
    const batch: Map<string, number> = flush.mock.calls[0]![0];
    expect(batch.get('word')).toBe(2);
    expect(batch.get('other')).toBe(1);
  });

  it('resets the timer on each enqueue', () => {
    const flush = vi.fn();
    const queue = createBatchedDebounce(flush, 100);
    queue('a');
    vi.advanceTimersByTime(50);
    queue('b');
    vi.advanceTimersByTime(50);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(flush).toHaveBeenCalledOnce();
  });

  it('clears the batch after flushing', () => {
    const flush = vi.fn();
    const queue = createBatchedDebounce(flush, 100);
    queue('x');
    vi.advanceTimersByTime(100);
    queue('y');
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledTimes(2);
    const secondBatch: Map<string, number> = flush.mock.calls[1]![0];
    expect(secondBatch.has('x')).toBe(false);
    expect(secondBatch.get('y')).toBe(1);
  });
});
