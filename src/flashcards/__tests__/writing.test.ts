import { describe, it, expect, vi } from 'vitest';

// The quiz mounts an SVG and listens for pointers; only the grading is under
// test here, so the library never has to load.
vi.mock('hanzi-writer', () => ({ default: { create: vi.fn() } }));

import { ratingForMistakes, quizColors } from '../writing.js';

describe('ratingForMistakes', () => {
  it('grades a clean quiz Good', () => {
    expect(ratingForMistakes(0)).toBe('good');
  });

  it('grades a quiz with a stroke or two out of place Hard', () => {
    expect(ratingForMistakes(1)).toBe('hard');
    expect(ratingForMistakes(2)).toBe('hard');
  });

  it('grades three mistakes or more Again', () => {
    expect(ratingForMistakes(3)).toBe('again');
    expect(ratingForMistakes(12)).toBe('again');
  });

  it('never awards Easy, which the reader has no way to disagree with', () => {
    const grades = [0, 1, 2, 3, 4, 5].map(ratingForMistakes);
    expect(grades).not.toContain('easy');
  });
});

describe('quizColors', () => {
  // The quiz used to carry its own palette, matching nothing else on the page.
  it('takes the colours the page is painted in', () => {
    const root = { style: {} } as unknown as Element;
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) =>
        ({
          '--ct-quiz-outline': ' #111 ',
          '--ct-quiz-stroke': '#222',
          '--ct-quiz-drawing': '#333',
        })[name] ?? '',
    }));

    expect(quizColors(root)).toEqual({
      outlineColor: '#111',
      strokeColor: '#222',
      drawingColor: '#333',
    });

    vi.unstubAllGlobals();
  });

  it('falls back to the light palette where nothing is computed', () => {
    expect(quizColors(undefined)).toEqual({
      outlineColor: '#dadce0',
      strokeColor: '#1a1a1a',
      drawingColor: '#0066cc',
    });
  });
});
