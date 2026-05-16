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

  it('passes a response matching the message type through to the callback', () => {
    const valid = { success: true, type: 'lookup_word', definition: null };
    mockResponse(valid);
    const cb = vi.fn();

    sendMessage(MESSAGE, cb);

    expect(cb).toHaveBeenCalledWith(valid);
  });

  it('rejects a success response whose type does not match the request', () => {
    mockResponse({ success: true, type: 'get_statistics', statistics: {} });
    const cb = vi.fn();

    sendMessage(MESSAGE, cb, 'default error');

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'default error' });
  });

  it('reports chrome.runtime.lastError when present', () => {
    chrome.runtime.lastError = { message: 'port closed' };
    mockResponse(undefined);
    const cb = vi.fn();

    sendMessage(MESSAGE, cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'port closed' });
  });

  it('uses the response error field for an error response', () => {
    mockResponse({ success: false, error: 'word not found' });
    const cb = vi.fn();

    sendMessage(MESSAGE, cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'word not found' });
  });

  it('falls back to the default error for a malformed response with no error field', () => {
    mockResponse({ unexpected: true });
    const cb = vi.fn();

    sendMessage(MESSAGE, cb, 'default error');

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'default error' });
  });

  it('uses the built-in default error when none is supplied', () => {
    mockResponse({ unexpected: true });
    const cb = vi.fn();

    sendMessage(MESSAGE, cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Request failed' });
  });
});
