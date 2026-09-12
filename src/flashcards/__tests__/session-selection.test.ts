// @vitest-environment happy-dom
// The module wires a manager to `document` on import, so the DOM must exist.
import { describe, it, expect } from 'vitest';
import { selectSession } from '../flashcards.js';
import type { Statistics, WordStatistics } from '../../shared/types.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const HOUR_MS = 3_600_000;

function tracked(count: number): WordStatistics {
  return { count, firstSeen: 1, lastSeen: 2 };
}

function scheduled(dueOffsetMs: number): WordStatistics {
  return {
    ...tracked(1),
    flashcard: {
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
        state: 2,
      },
    },
  };
}

describe('selectSession', () => {
  it('excludes words that are not due yet', () => {
    const stats: Statistics = { 你好: scheduled(HOUR_MS) };
    expect(selectSession(stats, NOW)).toEqual([]);
  });

  it('includes words whose due date has passed', () => {
    const stats: Statistics = { 你好: scheduled(-HOUR_MS) };
    expect(selectSession(stats, NOW)).toEqual(['你好']);
  });

  it('orders due reviews most overdue first', () => {
    const stats: Statistics = {
      最近: scheduled(-HOUR_MS),
      很久: scheduled(-100 * HOUR_MS),
      中間: scheduled(-10 * HOUR_MS),
    };

    expect(selectSession(stats, NOW)).toEqual(['很久', '中間', '最近']);
  });

  it('gates unseen words on the exposure threshold', () => {
    const stats: Statistics = { 一次: tracked(1), 兩次: tracked(2) };
    expect(selectSession(stats, NOW)).toEqual(['兩次']);
  });

  it('keeps a reviewed word eligible however rarely it was hovered', () => {
    const stats: Statistics = { 你好: scheduled(-HOUR_MS) };
    expect(stats['你好']!.count).toBeLessThan(2);
    expect(selectSession(stats, NOW)).toEqual(['你好']);
  });

  it('puts due reviews ahead of unseen words', () => {
    const stats: Statistics = { 新字: tracked(5), 舊字: scheduled(-HOUR_MS) };
    expect(selectSession(stats, NOW)[0]).toBe('舊字');
  });

  it('introduces the commonest unseen words first', () => {
    const stats: Statistics = {
      罕見: { ...tracked(5), rank: 9000 },
      常見: { ...tracked(5), rank: 50 },
      中等: { ...tracked(5), rank: 1200 },
    };

    expect(selectSession(stats, NOW)).toEqual(['常見', '中等', '罕見']);
  });

  it('puts words the corpus never ranked behind ranked ones', () => {
    const stats: Statistics = {
      沒有排名: tracked(50),
      有排名: { ...tracked(2), rank: 8000 },
    };

    expect(selectSession(stats, NOW)).toEqual(['有排名', '沒有排名']);
  });

  it('falls back to hover count when neither word is ranked', () => {
    const stats: Statistics = { 很少: tracked(2), 很多: tracked(20) };
    expect(selectSession(stats, NOW)).toEqual(['很多', '很少']);
  });

  it('caps how many unseen words enter one session', () => {
    const stats: Statistics = {};
    for (let i = 0; i < 30; i++) stats[`字${i}`] = tracked(5);

    expect(selectSession(stats, NOW)).toHaveLength(10);
  });

  it('is empty when nothing is tracked', () => {
    expect(selectSession({}, NOW)).toEqual([]);
  });
});
