import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../engine.js', () => ({ recognise: vi.fn() }));

import { recognise } from '../engine.js';
import type { BackgroundMessage, BackgroundResponse, OcrResult } from '../../shared/types.js';

type Listener = (
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: BackgroundResponse) => void,
) => boolean;

const result = (text: string): OcrResult => ({
  width: 100,
  height: 50,
  items: [{ text, box: { x: 0, y: 0, width: 40, height: 20 } }],
});

let listener: Listener;

function ask(src: string): Promise<BackgroundResponse> {
  return new Promise((resolve) => {
    listener({ type: 'ocr_run', src }, {}, resolve);
  });
}

describe('the offscreen OCR host', () => {
  beforeEach(async () => {
    vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
    vi.mocked(recognise).mockReset();
    vi.mocked(recognise).mockImplementation((src: string) => Promise.resolve(result(src)));

    // The module registers its handler on import, and holds a cache for the
    // life of the document — so each test needs its own instance of it.
    vi.resetModules();
    await import('../offscreen.js');

    const calls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
    listener = calls[calls.length - 1]![0] as unknown as Listener;
  });

  it('answers an ocr_run message with what the engine read', async () => {
    await expect(ask('a.png')).resolves.toEqual({
      success: true,
      type: 'ocr_run',
      result: result('a.png'),
    });
  });

  it('reads an image once however often it is asked for', async () => {
    await ask('a.png');
    await ask('a.png');

    expect(recognise).toHaveBeenCalledTimes(1);
  });

  it('reads each distinct image', async () => {
    await ask('a.png');
    await ask('b.png');

    expect(recognise).toHaveBeenCalledTimes(2);
  });

  /**
   * One inference session cannot usefully be contended for, so overlapping
   * requests queue rather than running together.
   */
  it('runs one image at a time', async () => {
    let running = 0;
    let overlapped = false;
    vi.mocked(recognise).mockImplementation(async (src: string) => {
      running += 1;
      if (running > 1) overlapped = true;
      await Promise.resolve();
      running -= 1;
      return result(src);
    });

    await Promise.all([ask('a.png'), ask('b.png'), ask('c.png')]);

    expect(overlapped).toBe(false);
  });

  it('keeps serving later images after one fails', async () => {
    vi.mocked(recognise).mockRejectedValueOnce(new Error('Could not read the image (404)'));

    await expect(ask('bad.png')).resolves.toMatchObject({ success: false });
    await expect(ask('good.png')).resolves.toMatchObject({ success: true });
  });

  it('does not cache a failed read', async () => {
    vi.mocked(recognise).mockRejectedValueOnce(new Error('boom'));

    await ask('a.png');
    await expect(ask('a.png')).resolves.toMatchObject({ success: true });
  });
});
