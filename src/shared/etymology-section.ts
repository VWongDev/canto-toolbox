import type { CharacterEtymology } from './types.js';
import { createElement } from './dom-element.js';

const IDS_COMPONENT_RE = /[\u2FF0-\u2FFB？]/;

function parseComponents(decomposition: string): string[] {
  return [...decomposition].filter(ch => !IDS_COMPONENT_RE.test(ch));
}

/** First CEDICT-style sense (text before the first `;`). */
export function firstGloss(definition: string): string {
  const idx = definition.indexOf(';');
  return (idx === -1 ? definition : definition.slice(0, idx)).trim();
}

function createComponentChip(
  glyph: string,
  definition: string | undefined,
  role: 'meaning' | 'sound' | undefined
): HTMLElement {
  const children: HTMLElement[] = [
    createElement({ tag: 'span', className: 'popup-etymology-component-glyph', textContent: glyph })
  ];
  if (definition) {
    children.push(createElement({
      tag: 'span',
      className: 'popup-etymology-component-def',
      textContent: firstGloss(definition),
      attributes: { title: definition },
    }));
  }
  if (role) {
    children.push(createElement({
      tag: 'span',
      className: `popup-etymology-component-role popup-etymology-component-role--${role}`,
      textContent: role
    }));
  }
  const roleClass = role ? ` popup-etymology-component--${role}` : '';
  return createElement({ className: `popup-etymology-component${roleClass}`, children });
}

function createComponentsRow(etymology: CharacterEtymology): HTMLElement | null {
  const defs = etymology.componentDefinitions ?? {};

  if (etymology.etymologyType === 'pictophonetic') {
    const chips: HTMLElement[] = [];
    if (etymology.semantic) {
      chips.push(createComponentChip(etymology.semantic, defs[etymology.semantic], 'meaning'));
    }
    if (etymology.phonetic) {
      chips.push(createComponentChip(etymology.phonetic, defs[etymology.phonetic], 'sound'));
    }
    if (chips.length === 0) return null;
    return createElement({ className: 'popup-etymology-components', children: chips });
  }

  const components = parseComponents(etymology.decomposition);
  if (components.length === 0) return null;
  return createElement({
    className: 'popup-etymology-components',
    children: components.map(ch => createComponentChip(ch, defs[ch], undefined))
  });
}

const TYPE_LABELS: Record<string, string> = {
  pictophonetic: 'Phonosemantic',
  ideographic: 'Ideographic',
  pictographic: 'Pictographic',
};

function createCharacterCard(etymology: CharacterEtymology): HTMLElement {
  const detailChildren: HTMLElement[] = [];

  if (etymology.etymologyType) {
    const label = TYPE_LABELS[etymology.etymologyType];
    if (label) {
      detailChildren.push(createElement({ className: 'popup-etymology-type', textContent: label }));
    }
  }

  if (etymology.hint && etymology.etymologyType !== 'pictophonetic') {
    detailChildren.push(createElement({ className: 'popup-etymology-hint', textContent: etymology.hint }));
  }

  const components = createComponentsRow(etymology);
  if (components) {
    detailChildren.push(components);
  }

  return createElement({
    className: 'popup-etymology-character',
    children: [
      createElement({ className: 'popup-etymology-char', textContent: etymology.character }),
      createElement({ className: 'popup-etymology-details', children: detailChildren })
    ]
  });
}

export function createEtymologySection(etymologies: CharacterEtymology[]): HTMLElement {
  return createElement({
    className: 'popup-etymology-section',
    children: [
      createElement({ className: 'popup-etymology-label', textContent: 'Character Breakdown' }),
      createElement({
        className: 'popup-etymology-characters',
        children: etymologies.map(createCharacterCard)
      })
    ]
  });
}
