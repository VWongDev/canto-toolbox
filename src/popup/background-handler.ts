import {
  lookupWord,
  lookupWordAt,
  lookupWordInDictionaries,
  initDictionaries,
} from '../dictionary/dictionary.js';
import { popupStorage, type WordDetails } from './popup-storage.js';
import { registerHandlers } from '../shared/message-router.js';

export function register(): void {
  const dictionariesReady = initDictionaries();

  /**
   * What the dictionary knows about a word at the moment it is studied. The
   * corpus rank is recorded here rather than looked up when a session is built,
   * because the pages that build sessions have no dictionary of their own.
   */
  async function describe(word: string): Promise<WordDetails> {
    try {
      await dictionariesReady;
      const rank = lookupWordInDictionaries(word).frequency?.rank;
      return rank === undefined ? {} : { rank };
    } catch (error) {
      console.error('[Background] Could not describe tracked word:', error);
      return {};
    }
  }

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
      popupStorage.updateStatistics(msg.word, {
        ...(await describe(msg.word)),
        ...(msg.context && { context: msg.context }),
      });
      return { success: true, type: 'track_word' };
    },
  });
}
