import { dueAt, isDue, isLearning } from '../shared/scheduler.js';
import { nextDueAt, progressFor } from '../shared/statistics-utils.js';
import type { ReviewDirection, Statistics, WordStatistics } from '../shared/types.js';

export const MAX_CARDS = 20;

/** Sightings before an unpinned word is worth drilling at all. */
export const MIN_COUNT = 2;

/** Cap on cards introduced per session, so due reviews are never crowded out. */
export const MAX_NEW_CARDS = 10;

export interface ReviewCard {
  word: string;
  direction: ReviewDirection;
  /** The sentence the word was met in, when one was captured. */
  context?: string;
}

export function cardKey(card: ReviewCard): string {
  return `${card.word}|${card.direction}`;
}

/**
 * The order a word's cards are introduced. Recognition comes first because it
 * is what reading already half-teaches; the other three ask for what reading
 * never tests, and none is worth asking about a word the reader cannot yet
 * recognise. Writing comes last: it is the only card that asks the reader to
 * produce the character stroke by stroke rather than just name or pick it.
 */
const INTRODUCTION_ORDER: readonly ReviewDirection[] = [
  'recognition',
  'production',
  'components',
  'writing',
];

function isUnlocked(stat: WordStatistics, direction: ReviewDirection): boolean {
  if (direction === 'recognition') return stat.pinned === true || stat.count >= MIN_COUNT;

  // Producing a word, taking it apart, or writing it tests nothing until it is
  // recognised reliably — which is exactly what leaving the learning steps
  // means.
  const recognition = stat.flashcard;
  if (!recognition?.srs || isLearning(recognition)) return false;

  // Dispatched rather than defaulted: a direction added later must state its
  // own gate instead of silently inheriting the one above it.
  if (direction === 'production') return true;
  if (direction === 'components') return stat.decomposable === true;
  return stat.writable === true;
}

function toCard(word: string, stat: WordStatistics, direction: ReviewDirection): ReviewCard {
  return {
    word,
    direction,
    ...(stat.context !== undefined && { context: stat.context }),
  };
}

/**
 * The one card this word offers the session. A word never appears twice in a
 * session: answering 電話 and then being asked to produce it minutes later
 * tests the session's memory rather than the reader's.
 */
function chooseCard(
  word: string,
  stat: WordStatistics,
  now: number,
): { card: ReviewCard; due: number } | { card: ReviewCard; introduce: true } | null {
  let owed: { direction: ReviewDirection; due: number } | null = null;

  for (const direction of INTRODUCTION_ORDER) {
    const progress = progressFor(stat, direction);
    if (!progress?.srs) continue;
    if (!isDue(progress, now)) continue;

    const due = dueAt(progress);
    if (!owed || due < owed.due) owed = { direction, due };
  }

  if (owed) return { card: toCard(word, stat, owed.direction), due: owed.due };

  for (const direction of INTRODUCTION_ORDER) {
    if (progressFor(stat, direction)?.srs) continue;
    if (!isUnlocked(stat, direction)) continue;
    return { card: toCard(word, stat, direction), introduce: true };
  }

  return null;
}

/**
 * Which unseen word is worth a session slot. The commonest word the reader has
 * met pays back the most for the same effort, so new cards follow the corpus
 * rank rather than arriving in whatever order a shuffle produced. A word the
 * corpus never ranked is rarer than its cap and goes last; ties fall back to
 * how often the reader has actually met it.
 */
function compareNewWords(a: WordStatistics, b: WordStatistics): number {
  const rankA = a.rank ?? Infinity;
  const rankB = b.rank ?? Infinity;
  if (rankA !== rankB) return rankA - rankB;
  return b.count - a.count;
}

/**
 * A session is the cards the scheduler says are owed, most overdue first,
 * topped up with cards not yet introduced. Words already in the deck stay
 * eligible however rarely they are hovered; new ones still have to clear the
 * exposure gate, and retired ones are left out entirely.
 */
export function selectSession(statistics: Statistics, now: number = Date.now()): ReviewCard[] {
  const due: Array<{ card: ReviewCard; due: number }> = [];
  const fresh: Array<{ card: ReviewCard; stat: WordStatistics }> = [];

  for (const [word, stat] of Object.entries(statistics)) {
    if (stat.suppressed) continue;

    const chosen = chooseCard(word, stat, now);
    if (!chosen) continue;

    if ('due' in chosen) due.push(chosen);
    else fresh.push({ card: chosen.card, stat });
  }

  due.sort((a, b) => a.due - b.due);
  fresh.sort((a, b) => compareNewWords(a.stat, b.stat));

  const reviews = due.slice(0, MAX_CARDS).map(entry => entry.card);
  const room = Math.min(MAX_NEW_CARDS, MAX_CARDS - reviews.length);

  return [...reviews, ...fresh.slice(0, room).map(entry => entry.card)];
}

/** Epoch ms of the soonest scheduled review across every card the deck holds. */
export function nextReviewAt(statistics: Statistics): number | undefined {
  let soonest: number | undefined;

  for (const stat of Object.values(statistics)) {
    if (stat.suppressed) continue;

    const due = nextDueAt(stat);
    if (due === undefined) continue;
    if (soonest === undefined || due < soonest) soonest = due;
  }

  return soonest;
}
