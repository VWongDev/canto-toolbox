import type { DefinitionResult } from './types.js';
import { createElement } from './dom-element.js';
import { createPronunciationSection, type PronunciationSectionConfig } from './pronunciation-section.js';
import { createEtymologySection } from './etymology-section.js';

export const MAX_VISIBLE_DEFINITIONS = 3;

/**
 * Definition sense list with optional collapse when there are more than
 * {@link MAX_VISIBLE_DEFINITIONS} senses. Used by popup, stats, and flashcards.
 */
export function createDefinitionList(
  definitions: string[],
  listClassName: string,
  itemClassName: string,
): HTMLElement {
  const items = definitions.map((def, i) =>
    createElement({
      tag: 'li',
      className: i >= MAX_VISIBLE_DEFINITIONS
        ? `${itemClassName} definition-sense--overflow`
        : itemClassName,
      textContent: def,
    })
  );

  const list = createElement({
    tag: 'ul',
    className: listClassName,
    children: items,
  });

  if (definitions.length <= MAX_VISIBLE_DEFINITIONS) {
    return list;
  }

  const hiddenCount = definitions.length - MAX_VISIBLE_DEFINITIONS;
  const moreBtn = createElement({
    tag: 'button',
    className: 'definition-more',
    textContent: `${hiddenCount} more`,
    attributes: {
      type: 'button',
      'aria-expanded': 'false',
    },
  });

  const wrapper = createElement({
    className: 'definition-senses is-collapsed',
    children: [list, moreBtn],
  });

  moreBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const collapsed = wrapper.classList.toggle('is-collapsed');
    moreBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    moreBtn.textContent = collapsed ? `${hiddenCount} more` : 'Show less';
  });

  return wrapper;
}

/**
 * `<ul class="definition-text">` definition list used by the stats and
 * flashcard surfaces. Falls back to a single "Not found" item.
 */
export function createDefinitionTextElement(definitions: string[] | undefined): HTMLElement {
  const defs = definitions && definitions.length > 0 ? definitions : ['Not found'];
  return createDefinitionList(defs, 'definition-text', 'definition-item');
}

/**
 * Pronunciation-section config shared by the stats and flashcard surfaces
 * (identical class names and empty-definition policy on both).
 */
export const definitionPronunciationConfig: PronunciationSectionConfig = {
  sectionClassName: 'definition-section',
  labelClassName: 'definition-label',
  pronunciationClassName: (key) => `definition-${key}`,
  groupClassName: 'pronunciation-group',
  createDefinitionElement: (defs) => createDefinitionTextElement(defs),
  showDefinitionIfEmpty: (key) => key === 'pinyin'
};

export function createMandarinSection(
  data: DefinitionResult['mandarin'],
  config: PronunciationSectionConfig
): HTMLElement {
  return createPronunciationSection(data, 'Mandarin', 'pinyin', config);
}

export function createCantoneseSection(
  data: DefinitionResult['cantonese'],
  config: PronunciationSectionConfig
): HTMLElement {
  return createPronunciationSection(data, 'Cantonese', 'jyutping', config);
}

/**
 * Full `definition-container` element (word + optional etymology +
 * Mandarin/Cantonese sections) shared verbatim by the stats and flashcard
 * surfaces. The popup surface renders a different structure and is not a
 * consumer.
 */
export function createDefinitionElement(
  word: string,
  definition: DefinitionResult,
  config: PronunciationSectionConfig = definitionPronunciationConfig,
  showWord = true,
): HTMLElement {
  const displayWord = definition.word || word;

  const children: HTMLElement[] = showWord
    ? [createElement({ className: 'definition-word', textContent: displayWord })]
    : [];

  if (definition.etymology?.length) {
    children.push(createEtymologySection(definition.etymology));
  }

  children.push(createElement({
    className: 'definition-sections',
    children: [
      createMandarinSection(definition.mandarin, config),
      createCantoneseSection(definition.cantonese, config)
    ]
  }));

  return createElement({ className: 'definition-container', children });
}
