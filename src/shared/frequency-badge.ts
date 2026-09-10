import type { WordFrequency } from './types.js';
import { createElement } from './dom-element.js';
import { BAND_DESCRIPTIONS, BAND_LABELS } from './frequency.js';

/**
 * How common a word is, as a chip on the definition. Every word in the
 * dictionary looks equally worth learning without it, which is the single
 * least useful thing a vocabulary tool can tell you.
 */
export function createFrequencyBadge(frequency: WordFrequency | undefined): HTMLElement {
  const band = frequency?.band ?? 'rare';

  const children: HTMLElement[] = [
    createElement({
      tag: 'span',
      className: 'frequency-badge-label',
      textContent: BAND_LABELS[band],
    }),
  ];

  if (frequency) {
    children.push(
      createElement({
        tag: 'span',
        className: 'frequency-badge-rank',
        textContent: `#${frequency.rank.toLocaleString()}`,
      })
    );
  }

  return createElement({
    className: `frequency-badge frequency-badge--${band}`,
    attributes: { title: BAND_DESCRIPTIONS[band] },
    children,
  });
}
