import type { DefinitionResult } from './types.js';
import { createElement } from './dom-element.js';
import { createPronunciationSection } from './pronunciation-section.js';
import { createEtymologySection } from './etymology-section.js';

export function createMandarinSection(data: DefinitionResult['mandarin']): HTMLElement {
  // Mandarin holds the column open with "Not found" so the two readings stay
  // side by side even when only Cantonese has senses.
  return createPronunciationSection(data, 'Mandarin', 'pinyin', {
    showPlaceholderWhenEmpty: true,
  });
}

export function createCantoneseSection(data: DefinitionResult['cantonese']): HTMLElement {
  return createPronunciationSection(data, 'Cantonese', 'jyutping');
}

/**
 * The `definition-sections` pair (Mandarin + Cantonese) shared by every
 * surface. The popup wraps it in its own shell; stats and flashcards wrap it
 * in {@link createDefinitionElement}.
 */
export function createDefinitionSections(definition: DefinitionResult): HTMLElement {
  return createElement({
    className: 'definition-sections',
    children: [
      createMandarinSection(definition.mandarin),
      createCantoneseSection(definition.cantonese)
    ]
  });
}

/**
 * Full `definition-container` element (word + optional etymology +
 * Mandarin/Cantonese sections) shared verbatim by the stats and flashcard
 * surfaces. The popup builds its own shell around
 * {@link createDefinitionSections} instead.
 */
export function createDefinitionElement(
  word: string,
  definition: DefinitionResult,
  showWord = true,
): HTMLElement {
  const displayWord = definition.word || word;

  const children: HTMLElement[] = showWord
    ? [createElement({ className: 'definition-word', textContent: displayWord })]
    : [];

  if (definition.etymology?.length) {
    children.push(createEtymologySection(definition.etymology));
  }

  children.push(createDefinitionSections(definition));

  return createElement({ className: 'definition-container', children });
}
