import type { CharacterEtymology } from './types.js';
import { createElement } from './dom-element.js';
import { parseComponents } from './decomposition.js';

/** Soft cap for chip gloss text; truncation drops whole portions, never mid-portion. */
export const MAX_CHIP_GLOSS_CHARS = 14;

/**
 * Fit as many `sep`-joined units as will fit under `maxChars`.
 * When truncated, drops the overflowing unit and appends `…`.
 * Returns `null` when even the first unit alone exceeds the cap.
 */
function fitUnits(units: string[], sep: string, maxChars: number): string | null {
  if (units.length === 0) return '';
  if (units[0]!.length > maxChars) return null;

  const taken: string[] = [];
  for (const unit of units) {
    const candidate = taken.length === 0 ? unit : `${taken.join(sep)}${sep}${unit}`;
    if (candidate.length <= maxChars) {
      taken.push(unit);
    } else {
      break;
    }
  }

  if (taken.length === units.length) return taken.join(sep);

  while (taken.length > 0 && `${taken.join(sep)}…`.length > maxChars) {
    taken.pop();
  }
  if (taken.length === 0) return null;
  return `${taken.join(sep)}…`;
}

/**
 * Chip gloss: keep whole `;` / `,` / word portions under the char cap.
 * Overflowing portions are dropped and replaced with a trailing `…`.
 */
export function firstGloss(definition: string, maxChars = MAX_CHIP_GLOSS_CHARS): string {
  const senses = definition.split(';').map(s => s.trim()).filter(Boolean);
  if (senses.length === 0) return '';

  const bySense = fitUnits(senses, '; ', maxChars);
  if (bySense !== null) return bySense;

  const byComma = fitUnits(
    senses[0]!.split(',').map(s => s.trim()).filter(Boolean),
    ', ',
    maxChars,
  );
  if (byComma !== null) return byComma;

  const byWord = fitUnits(senses[0]!.split(/\s+/).filter(Boolean), ' ', maxChars);
  if (byWord !== null) return byWord;

  // Single undividable token longer than the cap — show it whole rather than mid-split.
  return senses[0]!;
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

/** Chevron drawn as SVG so it inherits colour; rotation is handled in CSS. */
const CHEVRON_SVG =
  '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
  '<path d="M3.5 1.5L7 5l-3.5 3.5" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

export interface EtymologySectionOptions {
  /**
   * Open the breakdown on render. Off everywhere but the components card,
   * whose question the breakdown is itself the answer to.
   */
  expanded?: boolean;
}

/**
 * The character breakdown, behind a disclosure and under the definition. It
 * starts closed because a reader who stopped on a word wants to know what the
 * word means: expanded, the breakdown pushed that answer most of a screen down
 * on every surface that shows both.
 */
export function createEtymologySection(
  etymologies: CharacterEtymology[],
  { expanded = false }: EtymologySectionOptions = {},
): HTMLElement {
  const characters = createElement({
    className: 'popup-etymology-characters',
    children: etymologies.map(createCharacterCard)
  });

  const toggle = createElement<HTMLButtonElement>({
    tag: 'button',
    className: 'popup-etymology-toggle',
    attributes: { type: 'button', 'aria-expanded': String(expanded) },
    children: [
      createElement({
        tag: 'span',
        className: 'popup-etymology-label',
        textContent: 'Character Breakdown',
      }),
    ],
  });

  const chevron = createElement({ tag: 'span', className: 'popup-etymology-chevron' });
  chevron.innerHTML = CHEVRON_SVG;
  toggle.appendChild(chevron);

  const section = createElement({
    className: expanded ? 'popup-etymology-section' : 'popup-etymology-section is-collapsed',
    children: [toggle, characters],
  });

  toggle.addEventListener('click', (event) => {
    // Surfaces wrap this in clickable rows; opening the breakdown must not
    // also collapse the row it sits in.
    event.stopPropagation();
    const collapsed = section.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  return section;
}
