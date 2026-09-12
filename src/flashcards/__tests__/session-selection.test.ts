import { describe, it, expect } from 'vitest';
import { selectSession } from '../session.js';
import type { Statistics, WordStatistics } from '../../shared/types.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const HOUR_MS = 3_600_000;

function tracked(count: number): WordStatistics {
  return { count, firstSeen: 1, lastSeen: 2 };
}

function srs(dueOffsetMs: number, state = 2) {
  return {
    reviews: 1,
    consecutiveCorrect: 1,
    lastReviewed: NOW - HOUR_MS,
    srs: {
      due: NOW + dueOffsetMs,
      stability: 5,
      difficulty: 5,
      scheduledDays: 5,
      learningSteps: 0,
      lapses: 0,
      state,
    },
  };
}

function scheduled(dueOffsetMs: number): WordStatistics {
  return { ...tracked(1), flashcard: srs(dueOffsetMs) };
}

/** The words a session offers, in order, ignoring which card each one is. */
function words(stats: Statistics, now = NOW): string[] {
  return selectSession(stats, now).map(card => card.word);
}

describe('selectSession', () => {
  it('excludes words whose every card is scheduled ahead', () => {
    const stats: Statistics = {
      你好: { ...tracked(1), flashcard: srs(HOUR_MS), production: srs(HOUR_MS) },
    };
    expect(selectSession(stats, NOW)).toEqual([]);
  });

  it('includes words whose due date has passed', () => {
    const stats: Statistics = { 你好: scheduled(-HOUR_MS) };
    expect(selectSession(stats, NOW)).toEqual([
      { word: '你好', direction: 'recognition' },
    ]);
  });

  it('orders due reviews most overdue first', () => {
    const stats: Statistics = {
      最近: scheduled(-HOUR_MS),
      很久: scheduled(-100 * HOUR_MS),
      中間: scheduled(-10 * HOUR_MS),
    };

    expect(words(stats)).toEqual(['很久', '中間', '最近']);
  });

  it('gates unseen words on the exposure threshold', () => {
    const stats: Statistics = { 一次: tracked(1), 兩次: tracked(2) };
    expect(words(stats)).toEqual(['兩次']);
  });

  it('lets a pinned word skip the exposure threshold', () => {
    const stats: Statistics = { 一次: { ...tracked(1), pinned: true } };
    expect(words(stats)).toEqual(['一次']);
  });

  it('leaves retired words out of the session', () => {
    const stats: Statistics = {
      退休: { ...scheduled(-HOUR_MS), suppressed: true },
      繼續: scheduled(-HOUR_MS),
    };

    expect(words(stats)).toEqual(['繼續']);
  });

  it('keeps a reviewed word eligible however rarely it was hovered', () => {
    const stats: Statistics = { 你好: scheduled(-HOUR_MS) };
    expect(stats['你好']!.count).toBeLessThan(2);
    expect(words(stats)).toEqual(['你好']);
  });

  it('puts due reviews ahead of unseen words', () => {
    const stats: Statistics = { 新字: tracked(5), 舊字: scheduled(-HOUR_MS) };
    expect(words(stats)[0]).toBe('舊字');
  });

  it('introduces the commonest unseen words first', () => {
    const stats: Statistics = {
      罕見: { ...tracked(5), rank: 9000 },
      常見: { ...tracked(5), rank: 50 },
      中等: { ...tracked(5), rank: 1200 },
    };

    expect(words(stats)).toEqual(['常見', '中等', '罕見']);
  });

  it('puts words the corpus never ranked behind ranked ones', () => {
    const stats: Statistics = {
      沒有排名: tracked(50),
      有排名: { ...tracked(2), rank: 8000 },
    };

    expect(words(stats)).toEqual(['有排名', '沒有排名']);
  });

  it('falls back to hover count when neither word is ranked', () => {
    const stats: Statistics = { 很少: tracked(2), 很多: tracked(20) };
    expect(words(stats)).toEqual(['很多', '很少']);
  });

  it('caps how many unseen words enter one session', () => {
    const stats: Statistics = {};
    for (let i = 0; i < 30; i++) stats[`字${i}`] = tracked(5);

    expect(selectSession(stats, NOW)).toHaveLength(10);
  });

  it('is empty when nothing is tracked', () => {
    expect(selectSession({}, NOW)).toEqual([]);
  });

  it('carries the context sentence on the card', () => {
    const stats: Statistics = { 你好: { ...scheduled(-HOUR_MS), context: '你好嗎' } };
    expect(selectSession(stats, NOW)[0]!.context).toBe('你好嗎');
  });
});

describe('selectSession card directions', () => {
  it('introduces production once recognition has left its learning steps', () => {
    const stats: Statistics = { 你好: { ...tracked(5), flashcard: srs(HOUR_MS) } };

    expect(selectSession(stats, NOW)).toEqual([
      { word: '你好', direction: 'production' },
    ]);
  });

  it('withholds production while recognition is still being learned', () => {
    const stats: Statistics = { 你好: { ...tracked(5), flashcard: srs(HOUR_MS, 1) } };
    expect(selectSession(stats, NOW)).toEqual([]);
  });

  it('introduces a components card only for a decomposable character', () => {
    const withParts: Statistics = {
      好: { ...tracked(5), decomposable: true, flashcard: srs(HOUR_MS), production: srs(HOUR_MS) },
    };
    const withoutParts: Statistics = {
      好: { ...tracked(5), flashcard: srs(HOUR_MS), production: srs(HOUR_MS) },
    };

    expect(selectSession(withParts, NOW)).toEqual([{ word: '好', direction: 'components' }]);
    expect(selectSession(withoutParts, NOW)).toEqual([]);
  });

  it('offers a word only once per session, taking the most overdue card', () => {
    const stats: Statistics = {
      你好: {
        ...tracked(5),
        flashcard: srs(-HOUR_MS),
        production: srs(-100 * HOUR_MS),
      },
    };

    expect(selectSession(stats, NOW)).toEqual([
      { word: '你好', direction: 'production' },
    ]);
  });

  it('answers a due card before introducing a new direction of the same word', () => {
    const stats: Statistics = { 你好: { ...tracked(5), flashcard: srs(-HOUR_MS) } };

    expect(selectSession(stats, NOW)).toEqual([
      { word: '你好', direction: 'recognition' },
    ]);
  });
});
