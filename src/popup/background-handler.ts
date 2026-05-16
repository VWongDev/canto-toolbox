import { lookupWord, initDictionaries } from '../dictionary/dictionary.js';
import { popupStorage } from './popup-storage.js';
import { registerHandlers } from '../shared/message-router.js';

export function register(): void {
  const dictionariesReady = initDictionaries();

  registerHandlers({
    lookup_word: async (msg) => {
      try {
        await dictionariesReady;
      } catch (error) {
        console.error('[Background] Dictionary init failed:', error);
        throw new Error('Dictionary failed to load', { cause: error });
      }
      const definition = lookupWord(msg.word);
      popupStorage.updateStatistics(definition?.word || msg.word);
      return { success: true, type: 'lookup_word', definition };
    },
    track_word: async (msg) => {
      popupStorage.updateStatistics(msg.word);
      return { success: true, type: 'track_word' };
    },
  });
}
