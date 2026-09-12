import { describe, it, expect, vi, beforeEach } from 'vitest';

import { register } from '../background-handler.js';
import type { BackgroundMessage, BackgroundResponse, OcrResult } from '../../shared/types.js';

type Listener = (
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: BackgroundResponse) => void,
) => boolean;

const RESULT: OcrResult = {
  width: 100,
  height: 50,
  items: [{ text: '你好', box: { x: 0, y: 0, width: 40, height: 20 } }],
};

let existingContexts: unknown[] = [];
let createDocument: ReturnType<typeof vi.fn>;

function registerAndGetListener(): Listener {
  register();
  const calls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
  return calls[calls.length - 1]![0] as unknown as Listener;
}

function ask(listener: Listener, src: string): Promise<BackgroundResponse> {
  return new Promise((resolve) => {
    listener({ type: 'ocr_image', src }, {}, resolve);
  });
}

describe('ocr background-handler register()', () => {
  beforeEach(() => {
    existingContexts = [];
    createDocument = vi.fn(() => Promise.resolve());

    vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
    Object.assign(chrome.runtime, {
      getContexts: vi.fn(() => Promise.resolve(existingContexts)),
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
    });
    Object.assign(chrome, {
      offscreen: { createDocument, Reason: { WORKERS: 'WORKERS' } },
    });

    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback: (r: BackgroundResponse) => void,
    ) => {
      callback({ success: true, type: 'ocr_run', result: RESULT });
    }) as typeof chrome.runtime.sendMessage);
  });

  it('answers an ocr_image message with what the offscreen document read', async () => {
    const listener = registerAndGetListener();

    await expect(ask(listener, 'https://example.test/a.png')).resolves.toEqual({
      success: true,
      type: 'ocr_image',
      result: RESULT,
    });
  });

  it('starts the offscreen document that holds the model', async () => {
    const listener = registerAndGetListener();
    await ask(listener, 'https://example.test/a.png');

    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(createDocument.mock.calls[0]![0]).toMatchObject({ reasons: ['WORKERS'] });
  });

  /**
   * Chrome allows one offscreen document per extension and rejects a second
   * createDocument outright, so two images clicked at once must not race.
   */
  it('creates the offscreen document once for concurrent reads', async () => {
    const listener = registerAndGetListener();

    await Promise.all([
      ask(listener, 'https://example.test/a.png'),
      ask(listener, 'https://example.test/b.png'),
    ]);

    expect(createDocument).toHaveBeenCalledTimes(1);
  });

  it('reuses an offscreen document that already exists', async () => {
    existingContexts = [{ contextType: 'OFFSCREEN_DOCUMENT' }];
    const listener = registerAndGetListener();

    await ask(listener, 'https://example.test/a.png');

    expect(createDocument).not.toHaveBeenCalled();
  });

  it('reports a failed read as an error response', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback: (r: BackgroundResponse) => void,
    ) => {
      callback({ success: false, error: 'Could not read the image (404)' });
    }) as typeof chrome.runtime.sendMessage);

    const listener = registerAndGetListener();

    await expect(ask(listener, 'https://example.test/missing.png')).resolves.toMatchObject({
      success: false,
      error: 'Could not read the image (404)',
    });
  });
});
