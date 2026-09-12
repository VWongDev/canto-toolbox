import { popupStorage, type WordDetails } from './popup-storage.js';
import { registerHandlers } from '../shared/message-router.js';
import { sendMessage } from '../shared/message-manager.js';
import { ensureOffscreenDocument } from '../shared/offscreen-document.js';
import { hasStrokes } from '../shared/strokes.js';
import type { DefinitionResult, HoverSegment } from '../shared/types.js';

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

/**
 * Whether the word can carry a writing card: one character the packaged stroke
 * data covers. Decomposability is not a stand-in — a character can have
 * strokes without its etymology naming any parts it is built from.
 */
function isWritable(word: string): Promise<boolean> {
  if ([...word].length !== 1) return Promise.resolve(false);
  return hasStrokes(word);
}

function lookupInOffscreen(
  word: string,
  options: { segment?: HoverSegment; allowMissing?: boolean } = {},
): Promise<DefinitionResult> {
  return new Promise((resolve, reject) => {
    sendMessage(
      {
        type: 'dict_lookup',
        word,
        ...(options.segment && { segment: options.segment }),
        ...(options.allowMissing && { allowMissing: true }),
      },
      (response) => {
        if (!response.success) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.definition);
      },
    );
  });
}

export function register(): void {
  // Start the host that holds the maps as soon as the worker boots, so a
  // hover shortly after idle is not also paying for document creation.
  void ensureOffscreenDocument();

  /**
   * What the dictionary knows about a word at the moment it is studied. The
   * corpus rank is recorded here rather than looked up when a session is built,
   * because the pages that build sessions have no dictionary of their own.
   */
  async function describe(word: string): Promise<WordDetails> {
    try {
      const definition = await lookupInOffscreen(word, { allowMissing: true });
      const rank = definition.frequency?.rank;

      return {
        ...(rank !== undefined && { rank }),
        // Only a single character has parts worth asking about: the components
        // of a compound word are its own characters, which the card back shows
        // anyway.
        ...(isDecomposable(word, definition) && { decomposable: true }),
        ...((await isWritable(word)) && { writable: true }),
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
      await ensureOffscreenDocument();
      const definition = await lookupInOffscreen(msg.word, {
        ...(msg.segment && { segment: msg.segment }),
      });
      return { success: true, type: 'lookup_word', definition };
    },
    track_word: async (msg) => {
      popupStorage.updateStatistics(msg.word, {
        ...(await describe(msg.word)),
        ...(msg.context && { context: msg.context }),
        ...(msg.pin && { pinned: true }),
      });
      return { success: true, type: 'track_word' };
    },
  });
}
