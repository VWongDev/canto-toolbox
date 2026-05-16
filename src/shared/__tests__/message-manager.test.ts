import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMessage } from '../message-manager.js';
import type { BackgroundMessage } from '../types.js';

const MESSAGE: BackgroundMessage = { type: 'lookup_word', word: '好' };

function mockResponse(response: unknown): void {
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((_msg: unknown, cb: (r: unknown) => void) => cb(response)) as any
  );
}

describe('sendMessage', () => {
  beforeEach(() => {
    chrome.runtime.lastError = undefined;
  });
  afterEach(() => {
    chrome.runtime.lastError = undefined;
    vi.mocked(chrome.runtime.sendMessage).mockReset();
  });

  it('passes a valid response through to the callback', () => {
    const valid = { success: true, type: 'lookup_word', definition: null };
    mockResponse(valid);
    const cb = vi.fn();

    sendMessage(MESSAGE, () => true, 'default error', cb);

    expect(cb).toHaveBeenCalledWith(valid);
  });

  it('reports chrome.runtime.lastError when present', () => {
    chrome.runtime.lastError = { message: 'port closed' };
    mockResponse(undefined);
    const cb = vi.fn();

    sendMessage(MESSAGE, () => true, 'default error', cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'port closed' });
  });

  it('uses the response error field when validation fails', () => {
    mockResponse({ success: false, error: 'word not found' });
    const cb = vi.fn();

    sendMessage(MESSAGE, () => false, 'default error', cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'word not found' });
  });

  it('falls back to the default error when validation fails and no error field', () => {
    mockResponse({ unexpected: true });
    const cb = vi.fn();

    sendMessage(MESSAGE, () => false, 'default error', cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'default error' });
  });
});
