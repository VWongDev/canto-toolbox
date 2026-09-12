import {
  lookupWord,
  lookupWordAt,
  lookupWordInDictionaries,
  initDictionaries,
} from '../dictionary/dictionary.js';
import { popupStorage, type WordDetails } from './popup-storage.js';
import { registerHandlers } from '../shared/message-router.js';
import type { DefinitionResult } from '../shared/types.js';

/**
 * Whether the word can carry a components card: one character, and an
 * etymology entry that actually names the parts it is built from.
 */
function isDecomposable(word: string, definition: DefinitionResult): boolean {
  if ([...word].length !== 1) return false;

  const etymology = definition.etymology?.[0];
  if (!etymology) return false;

  return Object.keys(etymology.componentDefinitions ?? {}).length > 0;
}

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
      const definition = lookupWordInDictionaries(word);
      const rank = definition.frequency?.rank;

      return {
        ...(rank !== undefined && { rank }),
        // Only a single character has parts worth asking about: the components
        // of a compound word are its own characters, which the card back shows
        // anyway.
        ...(isDecomposable(word, definition) && { decomposable: true }),
      };
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
