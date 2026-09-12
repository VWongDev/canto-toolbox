import { createElement } from '../shared/dom-element.js';
import type { OcrItem, OcrResult } from '../shared/types.js';

/** A recognised box placed in the coordinates the image is actually drawn at. */
export interface PlacedSpan {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  /**
   * Extra advance per character, so the run of text ends exactly where the
   * recognised box does. Negative when the box is tighter than the glyphs.
   */
  letterSpacing: number;
}

export interface RenderedSize {
  width: number;
  height: number;
}

/**
 * Places one recognised item over the image as it is currently drawn.
 *
 * The point is not to reproduce the image's typography — the text is
 * transparent — but to put the *i*th character in the *i*th slot of its box, so
 * that `caretRangeFromPoint` resolves to the character the reader is looking
 * at. For Chinese that is exact: every glyph is full-width, so an advance of
 * one em plus the correction below lands each character on its own slot.
 * Latin runs inside a box drift, since their glyphs are not uniform.
 */
export function placeItem(item: OcrItem, scaleX: number, scaleY: number): PlacedSpan {
  const width = item.box.width * scaleX;
  const height = item.box.height * scaleY;
  const characters = [...item.text].length;

  return {
    text: item.text,
    left: item.box.x * scaleX,
    top: item.box.y * scaleY,
    width,
    height,
    fontSize: height,
    letterSpacing: characters > 0 ? width / characters - height : 0,
  };
}

/**
 * The whole image's text, in the coordinates it is drawn at. Recognition
 * happens once against the image's natural size; the page may scale it, and
 * may rescale it again on a resize, so the boxes are scaled at render time
 * rather than baked in.
 */
export function placeResult(result: OcrResult, rendered: RenderedSize): PlacedSpan[] {
  if (result.width === 0 || result.height === 0) return [];

  const scaleX = rendered.width / result.width;
  const scaleY = rendered.height / result.height;

  return result.items.map((item) => placeItem(item, scaleX, scaleY));
}

function spanElement(span: PlacedSpan): HTMLElement {
  return createElement({
    className: 'canto-ocr-line',
    textContent: span.text,
    style: {
      left: `${span.left}px`,
      top: `${span.top}px`,
      width: `${span.width}px`,
      height: `${span.height}px`,
      fontSize: `${span.fontSize}px`,
      letterSpacing: `${span.letterSpacing}px`,
    },
  });
}

/** The transparent text layer for one image, ready to be positioned over it. */
export function createOverlay(result: OcrResult, rendered: RenderedSize): HTMLElement {
  return createElement({
    className: 'canto-ocr-overlay',
    children: placeResult(result, rendered).map(spanElement),
  });
}
