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
  renderWritingFront,
  renderWritingBack,
  renderBack,
  renderBackLoading,
  renderBackError,
  isScreenVisible,
  isAnswerVisible,
  isWritingAnswerVisible,
  isAnswerRevealable,
  renderRatingIntervals
} from './flashcards-view.js';
import { previewSchedule } from '../shared/scheduler.js';
import { progressFor } from '../shared/statistics-utils.js';
import { ratingForMistakes, startQuiz, type WritingQuiz } from './writing.js';

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
  /** The record the session was built from, so a card can price its own ratings. */
  private statistics: Statistics = {};
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
  /** The quiz on screen, so a card left behind stops listening for strokes. */
  private quiz: WritingQuiz | undefined;
  /** The grade a finished quiz measured, waiting on the reader to move on. */
  private pendingRating: Rating | undefined;

  constructor(document: Document, client: FlashcardClient) {
    this.document = document;
    this.client = client;
  }

  init(): void {
    this.setupRatingButtons();
    this.setupShowAnswerButton();
    this.setupWritingNextButton();
    this.setupReviewAgainButton();
    this.setupKnowButton();
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

      this.statistics = response.statistics;
      this.sessionCards = session;
      this.reviewQueue = [...session];
      this.correctCount = 0;
      this.totalCount = session.length;
      setScreen(this.document, SCREEN_IDS.review);
      this.showNextCard();
    });
  }

  showNextCard(): void {
    this.endQuiz();

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

    if (card.direction === 'writing') {
      this.startWriting(card);
      return;
    }

    renderFront(this.document, card);
  }

  /**
   * The writing card grades itself, so the quiz stands in for both the
   * question and the rating: the reader draws, and the mistakes decide what
   * FSRS hears. The definition is only fetched once the drawing is done —
   * showing it beforehand would answer a different card's question.
   */
  private startWriting(card: ReviewCard): void {
    const pane = renderWritingFront(this.document, card);
    if (!pane) return;

    const quiz = startQuiz(pane, card.word);
    this.quiz = quiz;

    void quiz.completed.then(mistakes => {
      if (this.quiz !== quiz || !this.isCurrent(card)) return;

      const rating = ratingForMistakes(mistakes);
      this.pendingRating = rating;
      renderBackLoading(this.document);

      this.withDefinition(card, definition => {
        renderWritingBack(this.document, card, definition, { mistakes, rating });
      });
    });
  }

  /** Stop a quiz whose card is no longer on screen. */
  private endQuiz(): void {
    this.quiz?.cancel();
    this.quiz = undefined;
    this.pendingRating = undefined;
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
      this.priceRatings(card);
    });
  }

  /** Write on each rating button when it would bring this card back. */
  private priceRatings(card: ReviewCard): void {
    const now = Date.now();
    const stat = this.statistics[card.word];
    const progress = stat ? progressFor(stat, card.direction) : undefined;

    renderRatingIntervals(this.document, previewSchedule(progress, new Date(now)), now);
  }

  /** The card on screen, rebuilt from the session so its context travels with it. */
  private currentCard(): ReviewCard | undefined {
    const word = getCurrentWord(this.document);
    const direction = getCurrentDirection(this.document);
    if (!word || !direction) return undefined;

    return this.sessionCards.find(card => card.word === word && card.direction === direction);
  }

  private setupWritingNextButton(): void {
    const btn = this.document.getElementById(ELEMENT_IDS.writingNextBtn);
    if (!btn) return;

    btn.addEventListener('click', () => this.advanceWriting());
  }

  /** Submit the grade the quiz measured. The reader has no say in it. */
  private advanceWriting(): void {
    const rating = this.pendingRating;
    if (!rating) return;

    this.rate(rating);
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

    if (key === 'k' || key === 'K') {
      this.retireCurrentWord();
      return true;
    }

    // A finished writing quiz has already been graded, so the only key it
    // takes is the one that moves on.
    if (isWritingAnswerVisible(this.document)) {
      if (!ADVANCE_KEYS.includes(key)) return false;
      this.advanceWriting();
      return true;
    }

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

  private setupKnowButton(): void {
    const btn = this.document.getElementById(ELEMENT_IDS.knowBtn);
    if (!btn) return;

    btn.addEventListener('click', () => this.retireCurrentWord());
  }

  /**
   * Retire the word on screen. The commonest words are the ones hovered most,
   * so without this the deck fills with 的 and 是 and keeps asking about them;
   * a reader who already knows a word should be able to say so once.
   */
  private retireCurrentWord(): void {
    const card = this.currentCard();
    if (!card) return;

    this.client.setWordStatus(card.word, { suppressed: true }, () => {});

    // Its other cards are owed no answer either, and a retired word must not
    // come back through the restart the finished screen offers.
    this.reviewQueue = this.reviewQueue.filter(queued => queued.word !== card.word);
    this.sessionCards = this.sessionCards.filter(queued => queued.word !== card.word);
    this.totalCount = Math.max(this.totalCount - 1, this.correctCount);

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
