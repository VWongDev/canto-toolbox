import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../dictionary/dictionary.js', () => ({
  initDictionaries: vi.fn(() => Promise.resolve()),
  lookupWord: vi.fn(),
  lookupWordAt: vi.fn(),
  lookupWordInDictionaries: vi.fn(),
}));
vi.mock('../popup-storage.js', () => ({
  popupStorage: { updateStatistics: vi.fn() },
}));

import { register } from '../background-handler.js';
import {
  initDictionaries,
  lookupWord,
  lookupWordAt,
  lookupWordInDictionaries,
} from '../../dictionary/dictionary.js';
import { popupStorage } from '../popup-storage.js';
import type { BackgroundMessage, BackgroundResponse, DefinitionResult } from '../../shared/types.js';

type Listener = (
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: BackgroundResponse) => void,
) => boolean;

const DEFINITION: DefinitionResult = {
  word: '好',
  mandarin: { entries: [] },
  cantonese: { entries: [] },
};

function registerAndGetListener(): Listener {
  register();
  const calls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
  return calls[calls.length - 1]![0] as unknown as Listener;
}

describe('popup background-handler register()', () => {
  beforeEach(() => {
    vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
    vi.mocked(initDictionaries).mockResolvedValue(undefined);
    vi.mocked(lookupWord).mockReset();
    vi.mocked(lookupWordAt).mockReset();
    vi.mocked(lookupWordInDictionaries).mockReset();
    vi.mocked(lookupWordInDictionaries).mockReturnValue(DEFINITION);
    vi.mocked(popupStorage.updateStatistics).mockReset();
  });

  it('answers a lookup_word message', async () => {
    vi.mocked(lookupWord).mockReturnValue(DEFINITION);
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    const keptOpen = listener({ type: 'lookup_word', word: '好' }, {}, sendResponse);
    expect(keptOpen).toBe(true); // async response channel kept open

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledWith({ success: true, type: 'lookup_word', definition: DEFINITION });
  });

  it('does not record a lookup as a study', async () => {
    vi.mocked(lookupWord).mockReturnValue(DEFINITION);
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener({ type: 'lookup_word', word: '好' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(popupStorage.updateStatistics).not.toHaveBeenCalled();
  });

  it('segments from the hovered run when one is supplied', async () => {
    vi.mocked(lookupWordAt).mockReturnValue(DEFINITION);
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener(
      { type: 'lookup_word', word: '中國人', segment: { run: '中國人', offset: 1 } },
      {},
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(lookupWordAt).toHaveBeenCalledWith('中國人', 1);
    expect(lookupWord).not.toHaveBeenCalled();
  });

  it('reports an error response when lookup throws', async () => {
    vi.mocked(lookupWord).mockImplementation(() => { throw new Error('boom'); });
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener({ type: 'lookup_word', word: '好' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'boom', errorName: 'Error' });
  });

  it('reports a load failure when dictionary init rejects', async () => {
    vi.mocked(initDictionaries).mockRejectedValue(new Error('no data'));
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener({ type: 'lookup_word', word: '好' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Dictionary failed to load', errorName: 'Error' });
  });

  it('tracks a track_word message', async () => {
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    const keptOpen = listener({ type: 'track_word', word: '謝謝' }, {}, sendResponse);

    expect(keptOpen).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(popupStorage.updateStatistics).toHaveBeenCalledWith('謝謝', {});
    expect(sendResponse).toHaveBeenCalledWith({ success: true, type: 'track_word' });
  });

  it('passes the sentence context through to storage', async () => {
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener({ type: 'track_word', word: '謝謝', context: '真的很謝謝你' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(popupStorage.updateStatistics).toHaveBeenCalledWith('謝謝', { context: '真的很謝謝你' });
  });

  it('records the corpus rank alongside the sighting', async () => {
    vi.mocked(lookupWordInDictionaries).mockReturnValue({
      ...DEFINITION,
      frequency: { rank: 312, band: 'common' },
    });
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener({ type: 'track_word', word: '謝謝' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(popupStorage.updateStatistics).toHaveBeenCalledWith('謝謝', { rank: 312 });
  });

  it('still tracks the word when the dictionary cannot rank it', async () => {
    vi.mocked(lookupWordInDictionaries).mockImplementation(() => {
      throw new Error('no data');
    });
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener({ type: 'track_word', word: '謝謝', context: '謝謝你' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(popupStorage.updateStatistics).toHaveBeenCalledWith('謝謝', { context: '謝謝你' });
  });

  it('ignores unknown message types', () => {
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    const keptOpen = listener({ type: 'bogus' } as unknown as BackgroundMessage, {}, sendResponse);

    expect(keptOpen).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
