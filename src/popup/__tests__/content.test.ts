// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { extractContext, findChineseRunAt } from '../content.js';

describe('findChineseRunAt', () => {
  it('returns the whole run and the position within it', () => {
    expect(findChineseRunAt('中國人', 1)).toEqual({ run: '中國人', runOffset: 1 });
  });

  it('offsets the run against surrounding non-Chinese text', () => {
    expect(findChineseRunAt('hello 中國人 world', 7)).toEqual({ run: '中國人', runOffset: 1 });
  });

  it('picks the run the cursor is actually in', () => {
    expect(findChineseRunAt('好 字典', 3)).toEqual({ run: '字典', runOffset: 1 });
  });

  it('returns null when the cursor is not on Chinese text', () => {
    expect(findChineseRunAt('hello 中文', 2)).toBeNull();
  });

  it('returns null for text with no Chinese at all', () => {
    expect(findChineseRunAt('hello world', 3)).toBeNull();
  });
});

describe('extractContext', () => {
  it('returns the sentence around the cursor', () => {
    expect(extractContext('我很好。你好嗎？', 1)).toBe('我很好');
  });

  it('stops at the preceding sentence boundary', () => {
    expect(extractContext('我很好。你好嗎？', 5)).toBe('你好嗎');
  });

  it('handles text with no sentence punctuation', () => {
    expect(extractContext('我很好', 1)).toBe('我很好');
  });

  it('windows a long sentence around the hovered character', () => {
    const sentence = '字'.repeat(200);
    const context = extractContext(sentence, 100);

    expect(context.length).toBeLessThanOrEqual(60);
    expect(context.length).toBeGreaterThan(0);
  });

  it('keeps the hovered character inside the window', () => {
    const text = `${'甲'.repeat(100)}好${'乙'.repeat(100)}`;
    expect(extractContext(text, 100)).toContain('好');
  });
});
