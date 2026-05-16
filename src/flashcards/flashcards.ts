import type { DefinitionResult, StatisticsResponse, LookupResponse, ErrorResponse } from '../shared/types.js';
import { createElement } from '../shared/dom-element.js';
import { flashcardClient, type FlashcardClient } from './flashcard-client.js';
import { createPronunciationSection, type PronunciationSectionConfig } from '../shared/pronunciation-section.js';
import { createEtymologySection } from '../shared/etymology-section.js';

const MAX_CARDS = 20;
const MIN_COUNT = 2;

type Rating = 'again' | 'hard' | 'good' | 'easy';

const flashcardsPronunciationConfig: PronunciationSectionConfig = {
  sectionClassName: 'definition-section',
  labelClassName: 'definition-label',
  pronunciationClassName: (key) => `definition-${key}`,
  groupClassName: 'pronunciation-group',
  createDefinitionElement: (defs) => createDefinitionTextElement(defs),
  showDefinitionIfEmpty: (key) => key === 'pinyin'
};

function createDefinitionTextElement(definitions: string[] | undefined): HTMLElement {
  const defs = definitions && definitions.length > 0 ? definitions : ['Not found'];
  return createElement({
    tag: 'ul',
    className: 'definition-text',
    children: defs.map(def =>
      createElement({ tag: 'li', className: 'definition-item', textContent: def })
    )
  });
}

function createDefinitionElement(word: string, definition: DefinitionResult): HTMLElement {
  const displayWord = definition.word || word;

  const children: HTMLElement[] = [
    createElement({
      className: 'definition-word',
      textContent: displayWord
    })
  ];

  if (definition.etymology?.length) {
    children.push(createEtymologySection(definition.etymology));
  }

  children.push(createElement({
    className: 'definition-sections',
    children: [
      createPronunciationSection(definition.mandarin, 'Mandarin', 'pinyin', flashcardsPronunciationConfig),
      createPronunciationSection(definition.cantonese, 'Cantonese', 'jyutping', flashcardsPronunciationConfig)
    ]
  }));

  return createElement({
    className: 'definition-container',
    children
  });
}

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
        this.showEmpty();
        return;
      }

      const eligible = Object.entries(response.statistics)
        .filter(([, stat]) => stat.count >= MIN_COUNT)
        .map(([word]) => word);

      if (eligible.length === 0) {
        this.showEmpty();
        return;
      }

      const shuffled = fisherYatesShuffle(eligible).slice(0, MAX_CARDS);
      this.sessionWords = shuffled;
      this.reviewQueue = [...shuffled];
      this.correctCount = 0;
      this.totalCount = shuffled.length;
      this.showReviewScreen();
      this.showNextCard();
    });
  }

  private showReviewScreen(): void {
    this.setScreen('review');
  }

  private showEmpty(): void {
    this.setScreen('empty-state');
  }

  private showFinished(): void {
    this.setScreen('finished');
    const summaryEl = this.document.getElementById('result-summary');
    if (summaryEl) {
      summaryEl.textContent = `${this.correctCount} / ${this.totalCount} correct`;
    }
  }

  private setScreen(id: string): void {
    ['loading', 'empty-state', 'review', 'finished'].forEach(screenId => {
      const el = this.document.getElementById(screenId);
      if (el) el.style.display = screenId === id ? '' : 'none';
    });
  }

  showNextCard(): void {
    const word = this.reviewQueue.shift();
    if (word === undefined) {
      this.showFinished();
      return;
    }

    const queued = this.reviewQueue.length;
    const done = this.totalCount - queued - 1;
    this.updateProgress(done, this.totalCount);
    this.showFront(word);
  }

  private updateProgress(done: number, total: number): void {
    const progressEl = this.document.getElementById('progress') as HTMLElement | null;
    const counterEl = this.document.getElementById('counter');
    if (progressEl) {
      progressEl.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
    }
    if (counterEl) {
      counterEl.textContent = `Card ${done + 1} of ${total}`;
    }
  }

  private showFront(word: string): void {
    const cardFront = this.document.getElementById('card-front');
    const cardBack = this.document.getElementById('card-back');
    const showAnswerContainer = this.document.getElementById('show-answer-btn-container');
    const ratingBtns = this.document.getElementById('rating-btns');

    if (cardFront) {
      cardFront.replaceChildren();
      cardFront.appendChild(
        createElement({ className: 'card-characters', textContent: word })
      );
      cardFront.style.display = '';
    }
    if (cardBack) {
      cardBack.replaceChildren();
      cardBack.style.display = 'none';
    }
    if (showAnswerContainer) showAnswerContainer.style.display = '';
    if (ratingBtns) ratingBtns.style.display = 'none';

    const card = this.document.getElementById('card');
    if (card) card.dataset.currentWord = word;
  }

  private showBack(word: string, definition: DefinitionResult): void {
    const cardBack = this.document.getElementById('card-back');
    const showAnswerContainer = this.document.getElementById('show-answer-btn-container');
    const ratingBtns = this.document.getElementById('rating-btns');

    if (cardBack) {
      cardBack.replaceChildren();
      cardBack.appendChild(createDefinitionElement(word, definition));
      cardBack.style.display = '';
    }
    if (showAnswerContainer) showAnswerContainer.style.display = 'none';
    if (ratingBtns) ratingBtns.style.display = '';
  }

  private setupShowAnswerButton(): void {
    const btn = this.document.getElementById('show-answer-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const card = this.document.getElementById('card');
      const word = card?.dataset.currentWord;
      if (!word) return;

      const cardBack = this.document.getElementById('card-back');
      if (cardBack) {
        cardBack.textContent = 'Loading...';
        cardBack.style.display = '';
      }
      const showAnswerContainer = this.document.getElementById('show-answer-btn-container');
      if (showAnswerContainer) showAnswerContainer.style.display = 'none';

      this.client.lookupWord(word, (response: LookupResponse | ErrorResponse) => {
        if (!response.success || !response.definition) {
          if (cardBack) {
            cardBack.replaceChildren();
            cardBack.appendChild(
              createElement({ className: 'flashcard-error', textContent: 'Definition not found' })
            );
          }
          const ratingBtns = this.document.getElementById('rating-btns');
          if (ratingBtns) ratingBtns.style.display = '';
          return;
        }
        this.showBack(word, response.definition);
      });
    });
  }

  private setupRatingButtons(): void {
    const ratingBtns = this.document.getElementById('rating-btns');
    if (!ratingBtns) return;

    ratingBtns.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const rating = target.dataset.rating as Rating | undefined;
      if (!rating) return;
      this.rate(rating);
    });
  }

  private rate(rating: Rating): void {
    const card = this.document.getElementById('card');
    const word = card?.dataset.currentWord;
    if (!word) return;

    if (rating === 'again' || rating === 'hard') {
      this.reviewQueue.push(word);
    } else {
      this.correctCount++;
    }

    this.showNextCard();
  }

  private setupReviewAgainButton(): void {
    const btn = this.document.getElementById('review-again-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      this.reviewQueue = fisherYatesShuffle(this.sessionWords);
      this.correctCount = 0;
      this.totalCount = this.sessionWords.length;
      this.showReviewScreen();
      this.showNextCard();
    });
  }
}

const flashcardManager = new FlashcardManager(document, flashcardClient);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => flashcardManager.init());
} else {
  flashcardManager.init();
}
