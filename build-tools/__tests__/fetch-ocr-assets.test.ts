import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { fetchModel, backoffMs, MAX_ATTEMPTS } from '../fetch-ocr-assets.js';

const BODY = 'model bytes';
const DIGEST = createHash('sha256').update(BODY).digest('hex');
const URL = 'https://example.test/model.ort';

function ok(): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    // TextEncoder rather than Buffer.from(...).buffer: a small Buffer is a view
    // into Node's shared pool, so its `.buffer` is the whole 8 KB slab and
    // hashes to something different every run.
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(BODY).buffer),
  } as unknown as Response;
}

function failure(status: number, retryAfter?: string): Response {
  return {
    ok: false,
    status,
    statusText: 'nope',
    headers: new Headers(retryAfter ? { 'retry-after': retryAfter } : {}),
  } as unknown as Response;
}

describe('backoffMs', () => {
  it('takes the server at its word when it sends Retry-After', () => {
    expect(backoffMs(1, '7')).toBe(7000);
  });

  it('backs off further on each attempt', () => {
    // Jitter is bounded by a second, so the doubling has to clear it.
    expect(backoffMs(3, null)).toBeGreaterThan(backoffMs(1, null) + 1000);
  });

  it('ignores a Retry-After it cannot read', () => {
    expect(backoffMs(1, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBeGreaterThan(0);
  });
});

describe('fetchModel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /**
   * Runs `work` while letting every backoff timer elapse instantly. The catch
   * is attached before the timers run: without it a rejection sits unhandled
   * for as long as the fake clock takes to advance, which Vitest reports as an
   * error against whichever test happened to be running.
   */
  async function withoutWaiting<T>(work: () => Promise<T>): Promise<T> {
    const result = work();
    result.catch(() => undefined);
    await vi.runAllTimersAsync();
    return result;
  }

  it('returns the body when the first request succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok())));

    const bytes = await withoutWaiting(() => fetchModel(URL, DIGEST));
    expect(bytes.toString()).toBe(BODY);
  });

  /**
   * The failure that took CI down: Hugging Face rate-limits the shared runner
   * addresses, and a 429 says nothing about this build.
   */
  it('retries a 429 and succeeds once the limit clears', async () => {
    const calls = vi
      .fn()
      .mockResolvedValueOnce(failure(429, '1'))
      .mockResolvedValueOnce(failure(429, '1'))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', calls);

    const bytes = await withoutWaiting(() => fetchModel(URL, DIGEST));

    expect(bytes.toString()).toBe(BODY);
    expect(calls).toHaveBeenCalledTimes(3);
  });

  it('retries server errors too', async () => {
    const calls = vi.fn().mockResolvedValueOnce(failure(503)).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', calls);

    await withoutWaiting(() => fetchModel(URL, DIGEST));
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('gives up rather than retrying forever', async () => {
    const calls = vi.fn().mockResolvedValue(failure(429, '1'));
    vi.stubGlobal('fetch', calls);

    await expect(withoutWaiting(() => fetchModel(URL, DIGEST))).rejects.toThrow('429');
    expect(calls).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('does not retry a 404 — a missing file will stay missing', async () => {
    const calls = vi.fn().mockResolvedValue(failure(404));
    vi.stubGlobal('fetch', calls);

    await expect(withoutWaiting(() => fetchModel(URL, DIGEST))).rejects.toThrow('404');
    expect(calls).toHaveBeenCalledTimes(1);
  });

  /**
   * The check the pinning exists for: these bytes arrived intact and are the
   * wrong bytes, so asking again would only fetch them again.
   */
  it('does not retry a digest mismatch', async () => {
    const calls = vi.fn(() => Promise.resolve(ok()));
    vi.stubGlobal('fetch', calls);

    await expect(withoutWaiting(() => fetchModel(URL, 'deadbeef'))).rejects.toThrow(
      /digest mismatch/,
    );
    expect(calls).toHaveBeenCalledTimes(1);
  });
});
