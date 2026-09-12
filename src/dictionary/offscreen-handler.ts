import {
  lookupWord,
  lookupWordAt,
  lookupWordInDictionaries,
  initDictionaries,
} from './dictionary.js';
import { registerHandlers } from '../shared/message-router.js';

/**
 * Dictionary lookups run here, in the offscreen document, so the parsed maps
 * survive the service worker being torn down on idle. The worker's
 * `lookup_word` / `track_word` handlers only forward.
 */
export function register(): void {
  const dictionariesReady = initDictionaries();

  registerHandlers({
    dict_lookup: async (msg) => {
      try {
        await dictionariesReady;
      } catch (error) {
        console.error('[Offscreen] Dictionary init failed:', error);
        throw new Error('Dictionary failed to load', { cause: error });
      }

      const definition = msg.allowMissing
        ? lookupWordInDictionaries(msg.word)
        : msg.segment
          ? lookupWordAt(msg.segment.run, msg.segment.offset)
          : lookupWord(msg.word);

      return { success: true, type: 'dict_lookup', definition };
    },
  });
}
