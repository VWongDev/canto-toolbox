import { describe, it, expect } from 'vitest';
import { parseGraphicsLine, strokeFileName } from '../build-strokes.js';

// A real graphics.txt line, cut to two strokes.
const LINE = JSON.stringify({
  character: '一',
  strokes: ['M 100 100 Q 200 200 300 100 Z', 'M 50 50 L 400 50 Z'],
  medians: [
    [[100, 100], [300, 100]],
    [[50, 50], [400, 50]],
  ],
});

describe('parseGraphicsLine', () => {
  it('parses a character with its strokes and medians', () => {
    expect(parseGraphicsLine(LINE)).toEqual({
      character: '一',
      strokes: ['M 100 100 Q 200 200 300 100 Z', 'M 50 50 L 400 50 Z'],
      medians: [
        [[100, 100], [300, 100]],
        [[50, 50], [400, 50]],
      ],
    });
  });

  it('ignores blank lines and malformed JSON', () => {
    expect(parseGraphicsLine('')).toBeNull();
    expect(parseGraphicsLine('   ')).toBeNull();
    expect(parseGraphicsLine('{"character":"一",')).toBeNull();
  });

  it('rejects a character whose strokes and medians disagree', () => {
    const mismatched = JSON.stringify({
      character: '一',
      strokes: ['M 100 100 Z', 'M 50 50 Z'],
      medians: [[[100, 100], [300, 100]]],
    });

    // A stroke with no median cannot be graded, so the pair is unusable.
    expect(parseGraphicsLine(mismatched)).toBeNull();
  });

  it('rejects an entry with no strokes at all', () => {
    expect(parseGraphicsLine(JSON.stringify({ character: '一', strokes: [], medians: [] })))
      .toBeNull();
  });
});

describe('strokeFileName', () => {
  it('names the file after the hex codepoint', () => {
    expect(strokeFileName('寫')).toBe('5beb.json');
    expect(strokeFileName('一')).toBe('4e00.json');
  });
});
