import { describe, it, expect } from 'vitest';
import { getFlashcardStage, mergeStatistics } from '../statistics-utils.js';
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

  it('merges counts for a word present in both', () => {
    const result = mergeStatistics(
      { 好: { count: 3, firstSeen: 100, lastSeen: 200 } },
      { 好: { count: 2, firstSeen: 50, lastSeen: 150 } }
    );
    expect(result['好']!.count).toBe(5);
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
