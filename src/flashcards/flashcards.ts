import type { StatisticsResponse, LookupResponse, ErrorResponse, Statistics } from '../shared/types.js';
import { dueAt, isDue } from '../shared/scheduler.js';
import { flashcardClient, type FlashcardClient } from './flashcard-client.js';
import {
  ELEMENT_IDS,
  SCREEN_IDS,
  setScreen,
  renderEmptyState,
  renderFinished,
  updateProgress,
  getCurrentWord,
  renderFront,
  renderBack,
  renderBackLoading,
  renderBackError,
  isScreenVisible,
  isAnswerVisible,
  isAnswerRevealable
} from './flashcards-view.js';

const MAX_CARDS = 20;
const MIN_COUNT = 2;

/** Cap on unseen words per session, so due reviews are never crowded out. */
const MAX_NEW_CARDS = 10;

const NOTHING_TRACKED =
  'No words to review yet.\nHover over Chinese words at least twice to unlock flashcard review.';

type Rating = 'again' | 'hard' | 'good' | 'easy';

const RATING_KEYS: Readonly<Record<string, Rating>> = {
  '1': 'again',
  '2': 'hard',
  '3': 'good',
  '4': 'easy'
};

const ADVANCE_KEYS = [' ', 'Enter'];
const DEFAULT_RATING: Rating = 'good';

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * A session is the words the scheduler says are owed, most overdue first,
 * topped up with unseen words. Words already in the deck stay eligible however
 * rarely they are hovered; unseen ones still have to clear the exposure gate
 * before they are worth drilling.
 */
export function selectSession(statistics: Statistics, now: number = Date.now()): string[] {
  const due: Array<{ word: string; due: number }> = [];
  const unseen: string[] = [];

  for (const [word, stat] of Object.entries(statistics)) {
    const progress = stat.flashcard;
    if (progress?.srs) {
      if (isDue(progress, now)) due.push({ word, due: dueAt(progress) });
    } else if (stat.count >= MIN_COUNT) {
      unseen.push(word);
    }
  }

  due.sort((a, b) => a.due - b.due);
  const reviews = due.slice(0, MAX_CARDS).map(entry => entry.word);
  const room = Math.min(MAX_NEW_CARDS, MAX_CARDS - reviews.length);

  return [...reviews, ...fisherYatesShuffle(unseen).slice(0, room)];
}

/** Epoch ms of the soonest scheduled review, or undefined if the deck is empty. */
function nextReviewAt(statistics: Statistics): number | undefined {
  const scheduled = Object.values(statistics)
    .map(stat => stat.flashcard?.srs?.due)
    .filter((due): due is number => due !== undefined);

  return scheduled.length > 0 ? Math.min(...scheduled) : undefined;
}

function formatRelative(deltaMs: number): string {
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const minutes = Math.round(deltaMs / 60_000);
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');

  return format.format(Math.round(hours / 24), 'day');
}

function emptyStateMessage(statistics: Statistics, now: number): string {
  const next = nextReviewAt(statistics);
  if (next === undefined) return NOTHING_TRACKED;

  return `All caught up.\nYour next review is due ${formatRelative(next - now)}.`;
}

export class FlashcardManager {
  private readonly document: Document;
  private readonly client: FlashcardClient;
  private reviewQueue: string[] = [];
  private sessionWords: string[] = [];
  private correctCount = 0;
  private totalCount = 0;

  constructor(document: Document, client: FlashcardClient) {
    this.document = document;
    this.client = client;
  }

  init(): void {
    this.setupRatingButtons();
    this.setupShowAnswerButton();
    this.setupReviewAgainButton();
    this.setupKeyboardShortcuts();

    this.client.getStatistics((response: StatisticsResponse | ErrorResponse) => {
      if (!response.success) {
        renderEmptyState(this.document, NOTHING_TRACKED);
        return;
      }

      const now = Date.now();
      const session = selectSession(response.statistics, now);

      if (session.length === 0) {
        renderEmptyState(this.document, emptyStateMessage(response.statistics, now));
        return;
      }

      this.sessionWords = session;
      this.reviewQueue = [...session];
      this.correctCount = 0;
      this.totalCount = session.length;
      setScreen(this.document, SCREEN_IDS.review);
      this.showNextCard();
    });
  }

  showNextCard(): void {
    const word = this.reviewQueue.shift();
    if (word === undefined) {
      renderFinished(this.document, this.correctCount, this.totalCount);
      return;
    }

    const queued = this.reviewQueue.length;
    const done = this.totalCount - queued - 1;
    updateProgress(this.document, done, this.totalCount);
    renderFront(this.document, word);
  }

  private setupShowAnswerButton(): void {
    const btn = this.document.getElementById(ELEMENT_IDS.showAnswerBtn);
    if (!btn) return;

    btn.addEventListener('click', () => this.showAnswer());
  }

  private showAnswer(): void {
    const word = getCurrentWord(this.document);
    if (!word) return;

    renderBackLoading(this.document);

    this.client.lookupWord(word, (response: LookupResponse | ErrorResponse) => {
      if (!response.success || !response.definition) {
        renderBackError(this.document);
        return;
      }
      renderBack(this.document, word, response.definition);
    });
  }

  private setupRatingButtons(): void {
    const ratingBtns = this.document.getElementById(ELEMENT_IDS.ratingBtns);
    if (!ratingBtns) return;

    ratingBtns.addEventListener('click', (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      const rating = e.target.closest<HTMLElement>('[data-rating]')?.dataset.rating as
        | Rating
        | undefined;
      if (!rating) return;
      this.rate(rating);
    });
  }

  private setupKeyboardShortcuts(): void {
    this.document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (this.handleKey(e.key)) e.preventDefault();
    });
  }

  /** Returns true when the key was consumed by a shortcut. */
  private handleKey(key: string): boolean {
    if (isScreenVisible(this.document, SCREEN_IDS.finished)) {
      if (!ADVANCE_KEYS.includes(key)) return false;
      this.restartSession();
      return true;
    }

    if (!isScreenVisible(this.document, SCREEN_IDS.review)) return false;

    if (isAnswerVisible(this.document)) {
      const rating = RATING_KEYS[key] ?? (ADVANCE_KEYS.includes(key) ? DEFAULT_RATING : undefined);
      if (!rating) return false;
      this.rate(rating);
      return true;
    }

    if (!isAnswerRevealable(this.document) || !ADVANCE_KEYS.includes(key)) return false;
    this.showAnswer();
    return true;
  }

  private rate(rating: Rating): void {
    const word = getCurrentWord(this.document);
    if (!word) return;

    if (rating === 'again' || rating === 'hard') {
      this.reviewQueue.push(word);
    } else {
      this.correctCount++;
    }

    this.client.updateFlashcard(word, rating, () => {});
    this.showNextCard();
  }

  private setupReviewAgainButton(): void {
    const btn = this.document.getElementById(ELEMENT_IDS.reviewAgainBtn);
    if (!btn) return;

    btn.addEventListener('click', () => this.restartSession());
  }

  private restartSession(): void {
    this.reviewQueue = fisherYatesShuffle(this.sessionWords);
    this.correctCount = 0;
    this.totalCount = this.sessionWords.length;
    setScreen(this.document, SCREEN_IDS.review);
    this.showNextCard();
  }
}

const flashcardManager = new FlashcardManager(document, flashcardClient);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => flashcardManager.init());
} else {
  flashcardManager.init();
}
