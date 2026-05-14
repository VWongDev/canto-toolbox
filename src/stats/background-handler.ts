import { statsStorage } from './stats-storage.js';
import type { BackgroundMessage, BackgroundResponse } from '../shared/types.js';

export function register(): void {
  chrome.runtime.onMessage.addListener((
    message: BackgroundMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void
  ): boolean => {
    if (message.type === 'get_statistics') {
      statsStorage.getStatistics()
        .then(stats => sendResponse({ success: true, type: 'get_statistics', statistics: stats }))
        .catch((error: unknown) => {
          console.error('[Background] Error getting statistics:', error);
          const err = error instanceof Error ? error : new Error(String(error));
          sendResponse({ success: false, error: err.message || 'Unknown error' });
        });
      return true;
    }
    return false;
  });
}
