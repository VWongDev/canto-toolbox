import { describe, it, expect } from 'vitest';
import { bandOf, isSortKey, sortWords } from '../ordering.js';
import type { Statistics } from '../../shared/types.js';

function word(extra: Partial<Statistics[string]> = {}): Statistics[string] {
  return { count: 1, firstSeen: 1, lastSeen: 1, ...extra };
}

function scheduled(due: number): Statistics[string] {
  return word({
    flashcard: {
      reviews: 1,
      consecutiveCorrect: 1,
      srs: { due, stability: 1, difficulty: 5, scheduledDays: 1, learningSteps: 0, lapses: 0, state: 2 },
    },
  });
}

describe('sortWords', () => {
  const stats: Statistics = {
    常見: word({ count: 2, rank: 40, lastSeen: 100 }),
    少見: word({ count: 9, rank: 7000, lastSeen: 300 }),
    未排名: word({ count: 5, lastSeen: 200 }),
  };

  it('orders by hover count', () => {
    expect(sortWords(Object.keys(stats), stats, 'studied')).toEqual(['少見', '未排名', '常見']);
  });

  it('orders by corpus rank, unranked words last', () => {
    expect(sortWords(Object.keys(stats), stats, 'frequency')).toEqual(['常見', '少見', '未排名']);
  });

  it('orders by when the word was last met', () => {
    expect(sortWords(Object.keys(stats), stats, 'recent')).toEqual(['少見', '未排名', '常見']);
  });

  it('orders by what is owed soonest, unscheduled words last', () => {
    const due: Statistics = { 晚: scheduled(900), 早: scheduled(100), 沒有: word() };
    expect(sortWords(Object.keys(due), due, 'due')).toEqual(['早', '晚', '沒有']);
  });

  it('takes the soonest card a word carries', () => {
    const due: Statistics = {
      兩張: { ...scheduled(900), production: scheduled(50).flashcard! },
      一張: scheduled(100),
    };

    expect(sortWords(Object.keys(due), due, 'due')).toEqual(['兩張', '一張']);
  });

  it('leaves the array it was given untouched', () => {
    const words = Object.keys(stats);
    sortWords(words, stats, 'frequency');
    expect(words).toEqual(Object.keys(stats));
  });
});

describe('bandOf', () => {
  it('bands a word by its recorded rank', () => {
    expect(bandOf(word({ rank: 300 }))).toBe('core');
    expect(bandOf(word({ rank: 2000 }))).toBe('common');
  });

  it('treats a word with no rank as rare', () => {
    expect(bandOf(word())).toBe('rare');
  });
});

describe('isSortKey', () => {
  it('accepts the keys the page offers', () => {
    expect(isSortKey('due')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSortKey('sideways')).toBe(false);
    expect(isSortKey(undefined)).toBe(false);
  });
});
