import type { DefinitionResult } from '../shared/types.js';
import { createElement } from '../shared/dom-element.js';
import { createDefinitionElement } from '../shared/definition-section.js';

export const ELEMENT_IDS = {
  progress: 'progress',
  counter: 'counter',
  cardFront: 'card-front',
  cardBack: 'card-back',
  showAnswerContainer: 'show-answer-btn-container',
  ratingBtns: 'rating-btns',
  card: 'card',
  showAnswerBtn: 'show-answer-btn',
  reviewAgainBtn: 'review-again-btn',
  resultSummary: 'result-summary'
} as const;

export const SCREEN_IDS = {
  loading: 'loading',
  emptyState: 'empty-state',
  review: 'review',
  finished: 'finished'
} as const;

export type ScreenId = (typeof SCREEN_IDS)[keyof typeof SCREEN_IDS];

export function setScreen(document: Document, id: ScreenId): void {
  Object.values(SCREEN_IDS).forEach(screenId => {
    const el = document.getElementById(screenId);
    if (el) el.style.display = screenId === id ? '' : 'none';
  });
}

export function renderFinished(document: Document, correctCount: number, totalCount: number): void {
  setScreen(document, SCREEN_IDS.finished);
  const summaryEl = document.getElementById(ELEMENT_IDS.resultSummary);
  if (summaryEl) {
    summaryEl.textContent = `${correctCount} / ${totalCount} correct`;
  }
}

export function updateProgress(document: Document, done: number, total: number): void {
  const progressEl = document.getElementById(ELEMENT_IDS.progress);
  const counterEl = document.getElementById(ELEMENT_IDS.counter);
  if (progressEl) {
    progressEl.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
  }
  if (counterEl) {
    counterEl.textContent = `Card ${done + 1} of ${total}`;
  }
}

export function getCurrentWord(document: Document): string | undefined {
  return document.getElementById(ELEMENT_IDS.card)?.dataset.currentWord;
}

export function renderFront(document: Document, word: string): void {
  const cardFront = document.getElementById(ELEMENT_IDS.cardFront);
  const cardBack = document.getElementById(ELEMENT_IDS.cardBack);
  const showAnswerContainer = document.getElementById(ELEMENT_IDS.showAnswerContainer);
  const ratingBtns = document.getElementById(ELEMENT_IDS.ratingBtns);

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

  const card = document.getElementById(ELEMENT_IDS.card);
  if (card) card.dataset.currentWord = word;
}

/** Loading placeholder shown on the card back while a lookup is in flight. */
export function renderBackLoading(document: Document): void {
  const cardBack = document.getElementById(ELEMENT_IDS.cardBack);
  if (cardBack) {
    cardBack.textContent = 'Loading...';
    cardBack.style.display = '';
  }
  const showAnswerContainer = document.getElementById(ELEMENT_IDS.showAnswerContainer);
  if (showAnswerContainer) showAnswerContainer.style.display = 'none';
}

export function renderBackError(document: Document): void {
  const cardBack = document.getElementById(ELEMENT_IDS.cardBack);
  if (cardBack) {
    cardBack.replaceChildren();
    cardBack.appendChild(
      createElement({ className: 'flashcard-error', textContent: 'Definition not found' })
    );
  }
  const ratingBtns = document.getElementById(ELEMENT_IDS.ratingBtns);
  if (ratingBtns) ratingBtns.style.display = '';
}

export function renderBack(document: Document, word: string, definition: DefinitionResult): void {
  const cardBack = document.getElementById(ELEMENT_IDS.cardBack);
  const showAnswerContainer = document.getElementById(ELEMENT_IDS.showAnswerContainer);
  const ratingBtns = document.getElementById(ELEMENT_IDS.ratingBtns);

  if (cardBack) {
    cardBack.replaceChildren();
    cardBack.appendChild(createDefinitionElement(word, definition));
    cardBack.style.display = '';
  }
  if (showAnswerContainer) showAnswerContainer.style.display = 'none';
  if (ratingBtns) ratingBtns.style.display = '';
}
