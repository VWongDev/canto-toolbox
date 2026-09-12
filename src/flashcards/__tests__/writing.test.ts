import { describe, it, expect, vi } from 'vitest';

// The quiz mounts an SVG and listens for pointers; only the grading is under
// test here, so the library never has to load.
vi.mock('hanzi-writer', () => ({ default: { create: vi.fn() } }));

import { ratingForMistakes } from '../writing.js';

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
