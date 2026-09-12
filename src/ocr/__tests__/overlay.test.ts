// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { placeItem, placeResult, createOverlay } from '../overlay.js';
import type { OcrItem, OcrResult } from '../../shared/types.js';

const item = (text: string, x: number, y: number, width: number, height: number): OcrItem => ({
  text,
  box: { x, y, width, height },
});

const result = (items: OcrItem[], width = 200, height = 100): OcrResult => ({ width, height, items });

describe('placeItem', () => {
  it('scales the box to the size the image is drawn at', () => {
    const placed = placeItem(item('你好', 10, 20, 40, 20), 2, 2);

    expect(placed).toMatchObject({ left: 20, top: 40, width: 80, height: 40 });
  });

  it('sizes the text to the height of its box', () => {
    expect(placeItem(item('你好', 0, 0, 40, 20), 1, 1).fontSize).toBe(20);
  });

  /**
   * The property the caret depends on: character i has to sit in slot i of the
   * box, so a full-width glyph plus the spacing must come to one slot exactly.
   */
  it('spaces the characters so the run ends where the box does', () => {
    const placed = placeItem(item('今天天气很好', 0, 0, 300, 40), 1, 1);
    const slot = placed.fontSize + placed.letterSpacing;

    expect(slot * 6).toBeCloseTo(300);
  });

  it('tightens the spacing when the box is narrower than the glyphs', () => {
    expect(placeItem(item('你好', 0, 0, 30, 20), 1, 1).letterSpacing).toBeLessThan(0);
  });

  it('counts astral characters as one slot each', () => {
    // 𠮷 is a surrogate pair: counting code units would find four characters
    // in these two and halve every slot.
    const placed = placeItem(item('𠮷𠮷', 0, 0, 80, 40), 1, 1);

    expect(placed.fontSize + placed.letterSpacing).toBeCloseTo(40);
  });

  it('leaves the spacing alone for empty text', () => {
    expect(placeItem(item('', 0, 0, 40, 20), 1, 1).letterSpacing).toBe(0);
  });
});

describe('placeResult', () => {
  it('scales every item by the same ratio', () => {
    const placed = placeResult(result([item('一', 0, 0, 20, 20), item('二', 100, 50, 20, 20)]), {
      width: 400,
      height: 200,
    });

    expect(placed.map((p) => [p.left, p.top])).toEqual([[0, 0], [200, 100]]);
  });

  it('scales the axes independently when the page distorts the image', () => {
    const [placed] = placeResult(result([item('一', 10, 10, 20, 20)]), { width: 400, height: 100 });

    expect(placed).toMatchObject({ left: 20, top: 10, width: 40, height: 20 });
  });

  it('places nothing when the source size is unknown', () => {
    expect(placeResult(result([item('一', 0, 0, 20, 20)], 0, 0), { width: 100, height: 100 })).toEqual([]);
  });
});

describe('createOverlay', () => {
  it('renders one hoverable text node per recognised run', () => {
    const overlay = createOverlay(
      result([item('今天天气很好', 0, 0, 100, 20), item('谢谢你', 0, 40, 60, 20)]),
      { width: 200, height: 100 },
    );

    const lines = Array.from(overlay.querySelectorAll('.canto-ocr-line'));
    expect(lines.map((l) => l.textContent)).toEqual(['今天天气很好', '谢谢你']);
  });

  it('positions each run in page-independent pixels', () => {
    const overlay = createOverlay(result([item('你好', 25, 10, 40, 20)]), { width: 400, height: 200 });
    const line = overlay.querySelector<HTMLElement>('.canto-ocr-line');

    expect(line?.style.left).toBe('50px');
    expect(line?.style.top).toBe('20px');
    expect(line?.style.fontSize).toBe('40px');
  });
});
