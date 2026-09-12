import type {
  StatisticsResponse,
  LookupResponse,
  ErrorResponse,
  DefinitionResult,
  Statistics,
} from '../shared/types.js';
import { flashcardClient, type FlashcardClient } from './flashcard-client.js';
import { cardKey, nextReviewAt, selectSession, type ReviewCard } from './session.js';
import {
  ELEMENT_IDS,
  SCREEN_IDS,
  setScreen,
  renderEmptyState,
  renderFinished,
  updateProgress,
  getCurrentWord,
  getCurrentDirection,
  renderFront,
  renderFrontLoading,
  renderBack,
  renderBackLoading,
  renderBackError,
  isScreenVisible,
  isAnswerVisible,
  isAnswerRevealable
} from './flashcards-view.js';

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
  private reviewQueue: ReviewCard[] = [];
  private sessionCards: ReviewCard[] = [];
  private correctCount = 0;
  private totalCount = 0;
  /** Definitions already fetched this session, keyed by word. */
  private readonly definitions = new Map<string, DefinitionResult>();
  /**
   * Cards whose answer has already reached the scheduler this session. A
   * requeued "Again" and a "Review again" round are drills, not new evidence
   * about memory: sending them would have FSRS reschedule against an interval
   * of roughly zero and rewrite a stability that was never really tested.
   */
  private readonly scheduled = new Set<string>();

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

      this.sessionCards = session;
      this.reviewQueue = [...session];
      this.correctCount = 0;
      this.totalCount = session.length;
      setScreen(this.document, SCREEN_IDS.review);
      this.showNextCard();
    });
  }

  showNextCard(): void {
    const card = this.reviewQueue.shift();
    if (card === undefined) {
      renderFinished(this.document, this.correctCount, this.totalCount);
      return;
    }

    const queued = this.reviewQueue.length;
    const done = this.totalCount - queued - 1;
    updateProgress(this.document, done, this.totalCount);

    // Only the production card needs the dictionary to pose its question; the
    // others are drawn from the word alone and must not wait on a lookup.
    if (card.direction === 'production') {
      renderFrontLoading(this.document, card);
      this.withDefinition(card, definition => renderFront(this.document, card, definition));
      return;
    }

    renderFront(this.document, card);
  }

  /** Fetch the word's definition, or hand back the copy this session already has. */
  private withDefinition(
    card: ReviewCard,
    render: (definition: DefinitionResult | undefined) => void,
  ): void {
    const cached = this.definitions.get(card.word);
    if (cached) {
      render(cached);
      return;
    }

    this.client.lookupWord(card.word, (response: LookupResponse | ErrorResponse) => {
      if (!this.isCurrent(card)) return;

      if (!response.success || !response.definition) {
        render(undefined);
        return;
      }

      this.definitions.set(card.word, response.definition);
      render(response.definition);
    });
  }

  /** A lookup that returns after the reader has moved on must not redraw the card. */
  private isCurrent(card: ReviewCard): boolean {
    return (
      getCurrentWord(this.document) === card.word &&
      getCurrentDirection(this.document) === card.direction
    );
  }

  private setupShowAnswerButton(): void {
    const btn = this.document.getElementById(ELEMENT_IDS.showAnswerBtn);
    if (!btn) return;

    btn.addEventListener('click', () => this.showAnswer());
  }

  private showAnswer(): void {
    const card = this.currentCard();
    if (!card) return;

    renderBackLoading(this.document);

    this.withDefinition(card, definition => {
      if (definition) renderBack(this.document, card, definition);
      else renderBackError(this.document);
    });
  }

  /** The card on screen, rebuilt from the session so its context travels with it. */
  private currentCard(): ReviewCard | undefined {
    const word = getCurrentWord(this.document);
    const direction = getCurrentDirection(this.document);
    if (!word || !direction) return undefined;

    return this.sessionCards.find(card => card.word === word && card.direction === direction);
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
    const card = this.currentCard();
    if (!card) return;

    if (rating === 'again' || rating === 'hard') {
      this.reviewQueue.push(card);
    } else {
      this.correctCount++;
    }

    const key = cardKey(card);
    if (!this.scheduled.has(key)) {
      this.scheduled.add(key);
      this.client.updateFlashcard(card.word, rating, card.direction, () => {});
    }

    this.showNextCard();
  }

  private setupReviewAgainButton(): void {
    const btn = this.document.getElementById(ELEMENT_IDS.reviewAgainBtn);
    if (!btn) return;

    btn.addEventListener('click', () => this.restartSession());
  }

  private restartSession(): void {
    this.reviewQueue = fisherYatesShuffle(this.sessionCards);
    this.correctCount = 0;
    this.totalCount = this.sessionCards.length;
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
