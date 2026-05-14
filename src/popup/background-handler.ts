import { lookupWord, initDictionaries } from '../dictionary/dictionary.js';
import { popupStorage } from './popup-storage.js';
import type { BackgroundMessage, BackgroundResponse } from '../shared/types.js';

export function register(): void {
  const dictionariesReady = initDictionaries();

  chrome.runtime.onMessage.addListener((
    message: BackgroundMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void
  ): boolean => {
    if (message.type === 'lookup_word') {
      dictionariesReady.then(() => {
        try {
          const definition = lookupWord(message.word);
          popupStorage.updateStatistics(definition?.word || message.word);
          sendResponse({ success: true, type: 'lookup_word', definition });
        } catch (error) {
          console.error('[Background] Lookup error:', error);
          const err = error instanceof Error ? error : new Error(String(error));
          sendResponse({ success: false, error: err.message, errorName: err.name });
        }
      }).catch((error: unknown) => {
        console.error('[Background] Dictionary init failed:', error);
        sendResponse({ success: false, error: 'Dictionary failed to load' });
      });
      return true;
    }
    if (message.type === 'track_word') {
      popupStorage.updateStatistics(message.word);
      sendResponse({ success: true, type: 'track_word' });
      return true;
    }
    return false;
  });
}
