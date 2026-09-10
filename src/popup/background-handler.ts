import { lookupWord, lookupWordAt, initDictionaries } from '../dictionary/dictionary.js';
import { popupStorage } from './popup-storage.js';
import { registerHandlers } from '../shared/message-router.js';

export function register(): void {
  const dictionariesReady = initDictionaries();

  registerHandlers({
    /**
     * Showing a definition is not studying it — the popup follows the cursor,
     * so a lookup can be an accident of scrolling past. Statistics are written
     * only once the content script confirms the word was dwelled on.
     */
    lookup_word: async (msg) => {
      try {
        await dictionariesReady;
      } catch (error) {
        console.error('[Background] Dictionary init failed:', error);
        throw new Error('Dictionary failed to load', { cause: error });
      }

      const definition = msg.segment
        ? lookupWordAt(msg.segment.run, msg.segment.offset)
        : lookupWord(msg.word);

      return { success: true, type: 'lookup_word', definition };
    },
    track_word: async (msg) => {
      popupStorage.updateStatistics(msg.word, msg.context);
      return { success: true, type: 'track_word' };
    },
  });
}
