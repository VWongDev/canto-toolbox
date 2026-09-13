import { describe, it, expect } from 'vitest';
import { getFlashcardStage, lastReviewedAt, mergeStatistics, nextDueAt } from '../statistics-utils.js';
import { reviewCard } from '../scheduler.js';
import type { FlashcardProgress, WordStatistics } from '../types.js';

describe('mergeStatistics', () => {
  it('returns empty object when both args are empty', () => {
    expect(mergeStatistics({}, {})).toEqual({});
  });

  it('returns sync-only stats when local is empty', () => {
    const result = mergeStatistics({ 好: { count: 3, firstSeen: 100, lastSeen: 200 } }, {});
    expect(result['好']!.count).toBe(3);
  });

  it('returns local-only stats when sync is empty', () => {
    const result = mergeStatistics({}, { 字: { count: 1, firstSeen: 50, lastSeen: 150 } });
    expect(result['字']!.count).toBe(1);
  });

  // Each area holds a snapshot of the whole record, so the larger count is the
  // later one. Summing counted a sighting that reached both areas twice.
  it('takes the higher count for a word present in both', () => {
    const result = mergeStatistics(
      { 好: { count: 3, firstSeen: 100, lastSeen: 200 } },
      { 好: { count: 2, firstSeen: 50, lastSeen: 150 } }
    );
    expect(result['好']!.count).toBe(3);
  });

  // Sync keeps a fossil of the record from before it outgrew its 8 KB item
  // quota. ORing the two areas' flags made that fossil authoritative, so a
  // retirement could never be undone.
  it('lets local drop a flag the sync copy still carries', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 50, lastSeen: 150, suppressed: true, pinned: true } },
      { 好: { count: 2, firstSeen: 50, lastSeen: 150 } }
    );
    expect(result['好']!.suppressed).toBeUndefined();
    expect(result['好']!.pinned).toBeUndefined();
  });

  it('takes local as the authority on a retirement', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 50, lastSeen: 150 } },
      { 好: { count: 2, firstSeen: 50, lastSeen: 150, suppressed: true } }
    );
    expect(result['好']!.suppressed).toBe(true);
  });

  it('takes the earliest firstSeen when merging', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 200, lastSeen: 200 } },
      { 好: { count: 1, firstSeen: 50, lastSeen: 100 } }
    );
    expect(result['好']!.firstSeen).toBe(50);
  });

  it('takes the latest lastSeen when merging', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 100, lastSeen: 300 } },
      { 好: { count: 1, firstSeen: 100, lastSeen: 100 } }
    );
    expect(result['好']!.lastSeen).toBe(300);
  });

  it('keeps the context sentence for a word present in both', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 100, lastSeen: 300, context: '你好嗎' } },
      { 好: { count: 1, firstSeen: 100, lastSeen: 100 } }
    );
    expect(result['好']!.context).toBe('你好嗎');
  });

  it('keeps the context from whichever area met the word first', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 200, lastSeen: 300, context: '較晚' } },
      { 好: { count: 1, firstSeen: 50, lastSeen: 100, context: '最早' } }
    );
    expect(result['好']!.context).toBe('最早');
  });

  it('keeps the corpus rank for a word present in both', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 100, lastSeen: 300, rank: 42 } },
      { 好: { count: 1, firstSeen: 100, lastSeen: 100 } }
    );
    expect(result['好']!.rank).toBe(42);
  });

  it('keeps a word retired in either area retired', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 100, lastSeen: 300 } },
      { 好: { count: 1, firstSeen: 100, lastSeen: 100, suppressed: true } }
    );
    expect(result['好']!.suppressed).toBe(true);
  });

  it('keeps the most recent progress of each direction independently', () => {
    const early = { reviews: 1, consecutiveCorrect: 1, lastReviewed: 100 };
    const late = { reviews: 4, consecutiveCorrect: 4, lastReviewed: 900 };

    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 1, lastSeen: 2, flashcard: late, production: early } },
      { 好: { count: 1, firstSeen: 1, lastSeen: 2, flashcard: early, production: late } }
    );

    expect(result['好']!.flashcard).toEqual(late);
    expect(result['好']!.production).toEqual(late);
  });
});

describe('lastReviewedAt and nextDueAt', () => {
  function withSrs(due: number, lastReviewed: number): FlashcardProgress {
    return {
      reviews: 1,
      consecutiveCorrect: 1,
      lastReviewed,
      srs: {
        due,
        stability: 1,
        difficulty: 5,
        scheduledDays: 1,
        learningSteps: 0,
        lapses: 0,
        state: 2,
      },
    };
  }

  const base: WordStatistics = { count: 1, firstSeen: 1, lastSeen: 2 };

  it('has neither for a word with no schedules', () => {
    expect(lastReviewedAt(base)).toBeUndefined();
    expect(nextDueAt(base)).toBeUndefined();
  });

  it('takes the latest review across directions', () => {
    const stat = { ...base, flashcard: withSrs(50, 100), production: withSrs(900, 700) };
    expect(lastReviewedAt(stat)).toBe(700);
  });

  it('takes the soonest due date across directions', () => {
    const stat = { ...base, flashcard: withSrs(900, 100), production: withSrs(50, 700) };
    expect(nextDueAt(stat)).toBe(50);
  });

  it('walks the writing schedule alongside the others', () => {
    // DIRECTION_KEYS is a hand-written list, so a direction missing from it
    // would be silently skipped by every aggregate rather than fail to build.
    const stat = { ...base, flashcard: withSrs(900, 100), writing: withSrs(50, 700) };

    expect(nextDueAt(stat)).toBe(50);
    expect(lastReviewedAt(stat)).toBe(700);
  });

  it('counts a schedule that has never been reviewed as reviewed at zero', () => {
    expect(lastReviewedAt({ ...base, flashcard: { reviews: 0, consecutiveCorrect: 0 } })).toBe(0);
  });

  it('ignores a direction with progress but no schedule when taking the due date', () => {
    const stat = { ...base, flashcard: { reviews: 1, consecutiveCorrect: 1 }, production: withSrs(50, 700) };
    expect(nextDueAt(stat)).toBe(50);
  });
});

describe('getFlashcardStage', () => {
  const NOW = new Date('2026-01-01T00:00:00Z');
  const DAY_MS = 86_400_000;

  function drilled(reviews: number): WordStatistics {
    let progress: FlashcardProgress | undefined;
    let at = NOW;
    for (let i = 0; i < reviews; i++) {
      progress = reviewCard(progress, 'easy', at);
      at = new Date(progress.srs!.due);
    }
    return { count: 5, firstSeen: 1, lastSeen: 2, flashcard: progress! };
  }

  it('is new for a word that has never been reviewed', () => {
    expect(getFlashcardStage({ count: 5, firstSeen: 1, lastSeen: 2 }, NOW)).toBe('new');
  });

  it('is learning while the word is still in its learning steps', () => {
    const flashcard = reviewCard(undefined, 'good', NOW);
    const stat: WordStatistics = { count: 5, firstSeen: 1, lastSeen: 2, flashcard };
    expect(getFlashcardStage(stat, NOW)).toBe('learning');
  });

  it('is mastered for a durable word reviewed on schedule', () => {
    const stat = drilled(6);
    expect(getFlashcardStage(stat, new Date(stat.flashcard!.lastReviewed!))).toBe('mastered');
  });

  it('decays out of mastered when the review never happens', () => {
    const stat = drilled(6);
    const stability = stat.flashcard!.srs!.stability;
    const neglected = new Date(stat.flashcard!.lastReviewed! + stability * DAY_MS * 10);

    expect(getFlashcardStage(stat, neglected)).toBe('familiar');
  });
});
