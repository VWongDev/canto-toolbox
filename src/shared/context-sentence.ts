import { createElement } from './dom-element.js';

/**
 * The sentence a word was met in, shared by the stats list and the review
 * cards. Recall is anchored to where a word was seen, so the snippet captured
 * at track time is worth showing wherever the word is studied — and blanking
 * the word out turns the same sentence into the prompt for a production card.
 */

/** Stands in for the hidden word on a cloze prompt. */
export const CLOZE_BLANK = '⬚';

/**
 * Longest snippet kept per word. The content script windows the sentence to
 * this before sending it and the write path clamps it again on the way in, so
 * the number lives here — beside the component that has to render it — rather
 * than once per side of the message.
 */
export const MAX_CONTEXT_CHARS = 60;

export interface ContextOptions {
  /** Hide the word itself, leaving the sentence as a gap to fill. */
  blank?: boolean;
  label?: string;
}

function createMarker(word: string, blank: boolean): HTMLElement {
  return blank
    ? createElement({
        tag: 'span',
        className: 'context-blank',
        textContent: CLOZE_BLANK.repeat([...word].length),
      })
    : createElement({ tag: 'strong', className: 'context-word', textContent: word });
}

export function createContextSentence(
  word: string,
  context: string,
  { blank = false, label = 'Seen in' }: ContextOptions = {},
): HTMLElement {
  const sentence = createElement({ tag: 'p', className: 'context-sentence' });

  context.split(word).forEach((part, index) => {
    if (index > 0) sentence.appendChild(createMarker(word, blank));
    if (part) sentence.appendChild(document.createTextNode(part));
  });

  return createElement({
    className: 'context',
    children: [
      createElement({ tag: 'span', className: 'context-label', textContent: label }),
      sentence,
    ],
  });
}
