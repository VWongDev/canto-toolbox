import { describe, it, expect } from 'vitest';
import {
  dueAt,
  isDue,
  isLearning,
  isMastered,
  previewSchedule,
  retrievability,
  reviewCard,
} from '../scheduler.js';
import type { FlashcardProgress } from '../types.js';

const NOW = new Date('2026-01-01T00:00:00Z');
const DAY_MS = 86_400_000;

/** Drill a word to the point the scheduler considers it durable. */
function drill(reviews: number, rating: 'good' | 'easy' = 'easy'): FlashcardProgress {
  let progress: FlashcardProgress | undefined;
  let at = NOW;

  for (let i = 0; i < reviews; i++) {
    progress = reviewCard(progress, rating, at);
    at = new Date(progress.srs!.due);
  }

  return progress!;
}

describe('reviewCard', () => {
  it('schedules a first review from an unseen word', () => {
    const progress = reviewCard(undefined, 'good', NOW);

    expect(progress.reviews).toBe(1);
    expect(progress.lastRating).toBe('good');
    expect(progress.lastReviewed).toBe(NOW.getTime());
    expect(progress.srs!.due).toBeGreaterThan(NOW.getTime());
  });

  it('brings a lapsed word back sooner than a recalled one', () => {
    const again = reviewCard(undefined, 'again', NOW);
    const easy = reviewCard(undefined, 'easy', NOW);

    expect(again.srs!.due).toBeLessThan(easy.srs!.due);
  });

  it('pushes the interval out as a word is recalled repeatedly', () => {
    const early = drill(2);
    const later = drill(5);

    expect(later.srs!.stability).toBeGreaterThan(early.srs!.stability);
    expect(later.reviews).toBe(5);
  });

  it('resets the streak on a failed recall but keeps the review count', () => {
    const recalled = reviewCard(reviewCard(undefined, 'good', NOW), 'good', NOW);
    expect(recalled.consecutiveCorrect).toBe(2);

    const lapsed = reviewCard(recalled, 'again', NOW);
    expect(lapsed.consecutiveCorrect).toBe(0);
    expect(lapsed.reviews).toBe(3);
  });

  it('survives the JSON round trip through storage', () => {
    const progress = reviewCard(undefined, 'good', NOW);
    const restored = JSON.parse(JSON.stringify(progress)) as FlashcardProgress;

    expect(reviewCard(restored, 'good', NOW).srs!.stability).toBe(
      reviewCard(progress, 'good', NOW).srs!.stability
    );
  });
});

describe('isDue', () => {
  it('treats a never-reviewed word as due', () => {
    expect(isDue(undefined, NOW.getTime())).toBe(true);
    expect(dueAt(undefined)).toBe(0);
  });

  it('holds back a word that was just recalled', () => {
    const progress = reviewCard(undefined, 'easy', NOW);
    expect(isDue(progress, NOW.getTime())).toBe(false);
  });

  it('releases the word once its due date passes', () => {
    const progress = reviewCard(undefined, 'easy', NOW);
    expect(isDue(progress, progress.srs!.due + 1)).toBe(true);
  });
});

describe('isMastered', () => {
  it('is false while a word is still in its learning steps', () => {
    const progress = reviewCard(undefined, 'good', NOW);
    expect(isLearning(progress)).toBe(true);
    expect(isMastered(progress, NOW)).toBe(false);
  });

  it('is true for a durable word reviewed on schedule', () => {
    const progress = drill(6);
    expect(progress.srs!.stability).toBeGreaterThanOrEqual(60);
    expect(isMastered(progress, new Date(progress.lastReviewed!))).toBe(true);
  });

  it('lapses once too long has passed without a review', () => {
    const progress = drill(6);
    const longAfter = new Date(progress.lastReviewed! + progress.srs!.stability * DAY_MS * 10);

    expect(retrievability(progress, longAfter)).toBeLessThan(0.7);
    expect(isMastered(progress, longAfter)).toBe(false);
  });
});

describe('previewSchedule', () => {
  it('prices the four ratings further and further out', () => {
    const progress = drill(3);
    const preview = previewSchedule(progress, new Date(progress.srs!.due));

    expect(preview.again).toBeLessThan(preview.hard);
    expect(preview.hard).toBeLessThan(preview.good);
    expect(preview.good).toBeLessThan(preview.easy);
  });

  it('prices a word the deck has never seen', () => {
    const preview = previewSchedule(undefined, NOW);

    expect(preview.again).toBeGreaterThanOrEqual(NOW.getTime());
    expect(preview.easy).toBeGreaterThan(preview.again);
  });

  it('survives a clock that has gone backwards', () => {
    const progress = drill(3);
    const before = new Date(progress.lastReviewed! - DAY_MS);

    expect(() => previewSchedule(progress, before)).not.toThrow();
  });

  it('records nothing', () => {
    const progress = drill(3);
    const before = structuredClone(progress);

    previewSchedule(progress, new Date(progress.srs!.due));

    expect(progress).toEqual(before);
  });
});
