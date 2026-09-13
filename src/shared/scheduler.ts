import { createEmptyCard, fsrs, roundTo, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { FlashcardProgress, FlashcardRating, SrsState } from './types.js';

/**
 * Review scheduling, delegated to FSRS rather than hand-rolled: the four
 * ratings the review UI already offers are exactly FSRS's grade scale, and the
 * algorithm decides *when* a word comes back instead of the deck being
 * reshuffled at random every session.
 *
 * `SrsState` is a compact projection of the FSRS card — epoch-millisecond
 * dates and rounded reals — because every tracked word's progress shares a
 * single `chrome.storage` item.
 */
const scheduler = fsrs();

const GRADES: Readonly<Record<FlashcardRating, Grade>> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** Stability at which a word counts as mastered: recalled ~two months on. */
const MASTERED_STABILITY_DAYS = 60;

/** Below this recall probability a word has lapsed out of `mastered` again. */
const MASTERED_RETRIEVABILITY = 0.7;

/**
 * Failures before a card is treated as a leech. FSRS answers a lapse by
 * shortening the interval, which is the right response to forgetting but not
 * to a card that keeps being forgotten: past this many, the interval is not
 * what is wrong, and drilling it on repeat costs the session slots every other
 * word could have used.
 */
export const LEECH_LAPSES = 8;

const PRECISION = 4;

function toCard(progress: FlashcardProgress | undefined, now: Date): Card {
  const srs = progress?.srs;
  if (!srs) return createEmptyCard(now);

  return {
    due: new Date(srs.due),
    stability: srs.stability,
    difficulty: srs.difficulty,
    // Deprecated in ts-fsrs and recomputed from `last_review`; never persisted.
    elapsed_days: 0,
    scheduled_days: srs.scheduledDays,
    learning_steps: srs.learningSteps,
    reps: progress?.reviews ?? 0,
    lapses: srs.lapses,
    state: srs.state as State,
    ...(progress?.lastReviewed !== undefined && { last_review: new Date(progress.lastReviewed) }),
  };
}

function toSrsState(card: Card): SrsState {
  return {
    due: card.due.getTime(),
    stability: roundTo(card.stability, PRECISION),
    difficulty: roundTo(card.difficulty, PRECISION),
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    lapses: card.lapses,
    state: card.state,
  };
}

/** Apply a rating and return the word's updated progress, scheduling included. */
export function reviewCard(
  progress: FlashcardProgress | undefined,
  rating: FlashcardRating,
  now: Date = new Date(),
): FlashcardProgress {
  const { card } = scheduler.next(toCard(progress, now), now, GRADES[rating]);
  const correct = rating === 'good' || rating === 'easy';

  return {
    reviews: card.reps,
    correct: (progress?.correct ?? 0) + (correct ? 1 : 0),
    consecutiveCorrect: correct ? (progress?.consecutiveCorrect ?? 0) + 1 : 0,
    lastRating: rating,
    lastReviewed: now.getTime(),
    srs: toSrsState(card),
  };
}

/**
 * When each rating would bring the word back, without recording anything. The
 * reader is being asked to grade their own recall, and the four buttons mean
 * nothing until they say what they cost.
 */
export function previewSchedule(
  progress: FlashcardProgress | undefined,
  now: Date = new Date(),
): Record<FlashcardRating, number> {
  // FSRS rejects a review dated before the last one. A device whose clock has
  // gone backwards must not take the answer screen down with it.
  const last = progress?.lastReviewed;
  const at = last !== undefined && last > now.getTime() ? new Date(last) : now;

  const card = toCard(progress, at);
  const preview = {} as Record<FlashcardRating, number>;

  for (const [rating, grade] of Object.entries(GRADES) as Array<[FlashcardRating, Grade]>) {
    preview[rating] = scheduler.next(card, at, grade).card.due.getTime();
  }

  return preview;
}

/** A card that has been forgotten so often that rescheduling it is not the answer. */
export function isLeech(progress: FlashcardProgress | undefined): boolean {
  return (progress?.srs?.lapses ?? 0) >= LEECH_LAPSES;
}

/** Never-reviewed words are due immediately. */
export function dueAt(progress: FlashcardProgress | undefined): number {
  return progress?.srs?.due ?? 0;
}

export function isDue(progress: FlashcardProgress | undefined, now: number = Date.now()): boolean {
  return dueAt(progress) <= now;
}

/** Probability the word is still recalled right now, per the forgetting curve. */
export function retrievability(
  progress: FlashcardProgress | undefined,
  now: Date = new Date(),
): number {
  if (!progress?.srs) return 0;
  return scheduler.get_retrievability(toCard(progress, now), now, false);
}

/**
 * True once a word is both durable and still likely to be recalled today, so
 * `mastered` lapses on its own when the review never happens.
 */
export function isMastered(progress: FlashcardProgress, now: Date = new Date()): boolean {
  const srs = progress.srs;
  if (!srs || srs.stability < MASTERED_STABILITY_DAYS) return false;
  return retrievability(progress, now) >= MASTERED_RETRIEVABILITY;
}

export function isLearning(progress: FlashcardProgress): boolean {
  const state = progress.srs?.state;
  return state === undefined || state === State.Learning || state === State.Relearning;
}
