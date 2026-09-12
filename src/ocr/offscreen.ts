import { registerHandlers } from '../shared/message-router.js';
import { BoundedMap } from '../shared/bounded-map.js';
import type { OcrResult } from '../shared/types.js';

/**
 * How many images' text to remember. Reading an image costs a full inference
 * pass, and a reader scrolling a page of panels comes back to the same ones —
 * but the results hold every box of every line, so this is not a cache to let
 * grow.
 */
const MAX_CACHED_IMAGES = 30;

interface CachedResult {
  result: OcrResult;
  lastUsed: number;
}

const cache = new BoundedMap<string, CachedResult>(
  MAX_CACHED_IMAGES,
  (entry) => entry.lastUsed,
);

/**
 * One image at a time. The engine holds a single inference session, and a
 * reader clicking through several images would otherwise have them contend for
 * it — serialising is both correct and no slower overall.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.catch(() => undefined);
  return result;
}

async function read(src: string): Promise<OcrResult> {
  const cached = cache.get(src);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.result;
  }

  // Loaded on the first image, never when the offscreen document starts —
  // the document also hosts the dictionaries, which a hover needs long
  // before anyone clicks a badge.
  const { recognise } = await import('./engine.js');
  const result = await recognise(src);
  cache.set(src, { result, lastUsed: Date.now() });
  return result;
}

export function register(): void {
  registerHandlers({
    ocr_run: async (msg) => ({
      success: true,
      type: 'ocr_run',
      result: await enqueue(() => read(msg.src)),
    }),
  });
}
