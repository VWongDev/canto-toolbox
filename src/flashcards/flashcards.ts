import type { StatisticsResponse, LookupResponse, ErrorResponse } from '../shared/types.js';
import { flashcardClient, type FlashcardClient } from './flashcard-client.js';
import {
  ELEMENT_IDS,
  SCREEN_IDS,
  setScreen,
  renderFinished,
  updateProgress,
  getCurrentWord,
  renderFront,
  renderBack,
  renderBackLoading,
  renderBackError
} from './flashcards-view.js';

const MAX_CARDS = 20;
const MIN_COUNT = 2;

type Rating = 'again' | 'hard' | 'good' | 'easy';

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
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

    this.client.getStatistics((response: StatisticsResponse | ErrorResponse) => {
      if (!response.success) {
        setScreen(this.document, SCREEN_IDS.emptyState);
        return;
      }

      const eligible = Object.entries(response.statistics)
        .filter(([, stat]) => stat.count >= MIN_COUNT)
        .map(([word]) => word);

      if (eligible.length === 0) {
        setScreen(this.document, SCREEN_IDS.emptyState);
        return;
      }

      const shuffled = fisherYatesShuffle(eligible).slice(0, MAX_CARDS);
      this.sessionWords = shuffled;
      this.reviewQueue = [...shuffled];
      this.correctCount = 0;
      this.totalCount = shuffled.length;
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
