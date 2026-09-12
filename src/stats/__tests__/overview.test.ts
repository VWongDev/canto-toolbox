import { describe, it, expect } from 'vitest';
import { summarise } from '../overview.js';
import type { FlashcardProgress, Statistics } from '../../shared/types.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function progress(dueOffsetMs: number, extra: Partial<FlashcardProgress> = {}): FlashcardProgress {
  return {
    reviews: 1,
    correct: 1,
    consecutiveCorrect: 1,
    srs: {
      due: NOW + dueOffsetMs,
      stability: 5,
      difficulty: 5,
      scheduledDays: 5,
      learningSteps: 0,
      lapses: 0,
      state: 2,
    },
    ...extra,
  };
}

function word(extra: Partial<Statistics[string]> = {}): Statistics[string] {
  return { count: 3, firstSeen: 1, lastSeen: 2, ...extra };
}

describe('summarise', () => {
  it('is all zeroes for an empty record', () => {
    expect(summarise({}, NOW)).toEqual({
      tracked: 0,
      retired: 0,
      dueNow: 0,
      dueToday: 0,
      reviews: 0,
      accuracy: undefined,
    });
  });

  it('counts cards the scheduler already owes', () => {
    const stats: Statistics = {
      欠: word({ flashcard: progress(-HOUR_MS) }),
      未欠: word({ flashcard: progress(HOUR_MS) }),
    };

    expect(summarise(stats, NOW).dueNow).toBe(1);
  });

  it('counts every direction separately', () => {
    const stats: Statistics = {
      你好: word({ flashcard: progress(-HOUR_MS), production: progress(-HOUR_MS) }),
    };

    expect(summarise(stats, NOW).dueNow).toBe(2);
  });

  it('includes what is already owed in the day ahead', () => {
    const stats: Statistics = {
      現在: word({ flashcard: progress(-HOUR_MS) }),
      今天: word({ flashcard: progress(12 * HOUR_MS) }),
      下週: word({ flashcard: progress(7 * DAY_MS) }),
    };

    const overview = summarise(stats, NOW);
    expect(overview.dueToday).toBe(2);
    expect(overview.dueNow).toBe(1);
  });

  it('leaves retired words out of what is owed', () => {
    const stats: Statistics = {
      退休: word({ flashcard: progress(-HOUR_MS), suppressed: true }),
    };

    const overview = summarise(stats, NOW);
    expect(overview.dueNow).toBe(0);
    expect(overview.retired).toBe(1);
    expect(overview.tracked).toBe(1);
  });

  it('reports accuracy as the share of reviews answered correctly', () => {
    const stats: Statistics = {
      對: word({ flashcard: progress(HOUR_MS, { reviews: 4, correct: 3 }) }),
      錯: word({ flashcard: progress(HOUR_MS, { reviews: 4, correct: 1 }) }),
    };

    expect(summarise(stats, NOW).accuracy).toBe(0.5);
  });

  it('has no accuracy before anything has been reviewed', () => {
    expect(summarise({ 新: word() }, NOW).accuracy).toBeUndefined();
  });

  it('ignores progress recorded before answers were counted', () => {
    const stats: Statistics = {
      舊: word({ flashcard: { reviews: 10, consecutiveCorrect: 0 } }),
      新: word({ flashcard: progress(HOUR_MS, { reviews: 2, correct: 2 }) }),
    };

    const overview = summarise(stats, NOW);
    expect(overview.accuracy).toBe(1);
    expect(overview.reviews).toBe(12);
  });
});
