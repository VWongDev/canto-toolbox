import { createElement, type CreateElementOptions } from './dom-element.js';

/**
 * The inline SVG every surface draws. Markup rather than an `<img>` so the
 * glyph inherits `currentColor` and scales with the text around it — which is
 * what makes one copy serve the popup, the stats list and the flashcards.
 */

/** Chevron for a disclosure. Rotation is handled in CSS. */
export const CHEVRON_SVG =
  '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
  '<path d="M3.5 1.5L7 5l-3.5 3.5" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Speaker glyph for the pronunciation button. */
export const SPEAKER_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M8 2.5 4.5 5.5H2v5h2.5L8 13.5v-11Z" fill="currentColor"/>' +
  '<path d="M10.5 5.8a3 3 0 0 1 0 4.4M12.6 3.7a6 6 0 0 1 0 8.6" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round"/></svg>';

/**
 * An element holding one of the glyphs above. The caller still says what the
 * element is — the chevron sits in a span on one surface and a div on another,
 * and the speaker *is* the button — because the CSS is written against those
 * wrappers.
 */
export function createIcon<T extends HTMLElement = HTMLElement>(
  svg: string,
  options: CreateElementOptions = {},
): T {
  const element = createElement<T>(options);
  element.innerHTML = svg;
  return element;
}
