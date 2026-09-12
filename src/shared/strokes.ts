import type { CharacterStrokes } from './types.js';

/**
 * Access to the packaged stroke graphics. They are split one file per
 * character by `build-tools/build-strokes.ts`, so a review session fetches the
 * ~3 KB for the card on screen rather than holding 30 MB of corpus the way the
 * dictionaries do.
 *
 * Not a `web_accessible_resource`: the service worker (deciding whether a word
 * can carry a writing card) and the flashcards page (drawing it) both reach
 * their own `chrome-extension://` files directly.
 */

let indexPromise: Promise<Set<string>> | null = null;

function loadIndex(): Promise<Set<string>> {
  if (!indexPromise) {
    indexPromise = fetch(chrome.runtime.getURL('strokes/index.json'))
      .then(response => response.json() as Promise<string>)
      .then(characters => new Set([...characters]))
      .catch(error => {
        console.error('[Strokes] Could not load the stroke index:', error);
        // Retry on the next call: a worker torn down mid-fetch should not
        // leave every later word looking unwritable.
        indexPromise = null;
        return new Set<string>();
      });
  }
  return indexPromise;
}

/** Whether the packaged data can draw this character. */
export async function hasStrokes(character: string): Promise<boolean> {
  return (await loadIndex()).has(character);
}

export async function loadStrokes(character: string): Promise<CharacterStrokes | undefined> {
  const file = `${character.codePointAt(0)?.toString(16)}.json`;

  try {
    const response = await fetch(chrome.runtime.getURL(`strokes/${file}`));
    if (!response.ok) return undefined;
    return (await response.json()) as CharacterStrokes;
  } catch (error) {
    console.error(`[Strokes] Could not load strokes for ${character}:`, error);
    return undefined;
  }
}
