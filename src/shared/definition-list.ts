import { createElement } from './dom-element.js';

export const MAX_VISIBLE_DEFINITIONS = 3;

/**
 * `<ul class="definition-text">` sense list, collapsed behind a "n more"
 * toggle past {@link MAX_VISIBLE_DEFINITIONS} senses. Falls back to a single
 * "Not found" item. Used by every surface — popup, stats and flashcards.
 */
export function createDefinitionTextElement(definitions: string[] | undefined): HTMLElement {
  const senses = definitions && definitions.length > 0 ? definitions : ['Not found'];

  const items = senses.map((def, i) =>
    createElement({
      tag: 'li',
      className: i >= MAX_VISIBLE_DEFINITIONS
        ? 'definition-item definition-sense--overflow'
        : 'definition-item',
      textContent: def,
    })
  );

  const list = createElement({
    tag: 'ul',
    className: 'definition-text',
    children: items,
  });

  if (senses.length <= MAX_VISIBLE_DEFINITIONS) {
    return list;
  }

  const hiddenCount = senses.length - MAX_VISIBLE_DEFINITIONS;
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
