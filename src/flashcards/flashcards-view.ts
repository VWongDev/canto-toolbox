import type { DefinitionResult, ReviewDirection } from '../shared/types.js';
import { createElement } from '../shared/dom-element.js';
import { createDefinitionElement } from '../shared/definition-section.js';
import { createContextSentence } from '../shared/context-sentence.js';
import { primaryGloss } from '../shared/gloss.js';
import type { ReviewCard } from './session.js';

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
  knowBtn: 'know-btn',
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

/**
 * The empty screen covers two different situations — nothing tracked yet, and
 * a deck with nothing due — so its copy is set by the caller. Newlines become
 * line breaks to match the markup's original two-line shape.
 */
export function renderEmptyState(document: Document, message: string): void {
  setScreen(document, SCREEN_IDS.emptyState);

  const paragraph = document.getElementById(SCREEN_IDS.emptyState)?.querySelector('p');
  if (!paragraph) return;

  paragraph.replaceChildren();
  message.split('\n').forEach((line, index) => {
    if (index > 0) paragraph.appendChild(document.createElement('br'));
    paragraph.appendChild(document.createTextNode(line));
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

export function getCurrentDirection(document: Document): ReviewDirection | undefined {
  return document.getElementById(ELEMENT_IDS.card)?.dataset.currentDirection as
    | ReviewDirection
    | undefined;
}

function isVisible(document: Document, id: string): boolean {
  const el = document.getElementById(id);
  return el !== null && el.style.display !== 'none';
}

export function isScreenVisible(document: Document, id: ScreenId): boolean {
  return isVisible(document, id);
}

/** True once the answer is revealed and the rating buttons are actionable. */
export function isAnswerVisible(document: Document): boolean {
  return isVisible(document, ELEMENT_IDS.ratingBtns);
}

/** False while a lookup is in flight, so a reveal cannot be requested twice. */
export function isAnswerRevealable(document: Document): boolean {
  return isVisible(document, ELEMENT_IDS.showAnswerContainer);
}

/** What each card asks for, named on the card so the prompt is never ambiguous. */
const PROMPTS: Readonly<Record<ReviewDirection, string>> = {
  recognition: 'What does it mean?',
  production: 'Which word is it?',
  components: 'What is it made of?',
};

const DIRECTION_LABELS: Readonly<Record<ReviewDirection, string>> = {
  recognition: 'Recognise',
  production: 'Produce',
  components: 'Parts',
};

function createPrompt(direction: ReviewDirection): HTMLElement {
  return createElement({
    className: 'card-prompt',
    children: [
      createElement({
        tag: 'span',
        className: `card-kind card-kind--${direction}`,
        textContent: DIRECTION_LABELS[direction],
      }),
      createElement({ tag: 'span', className: 'card-ask', textContent: PROMPTS[direction] }),
    ],
  });
}

/**
 * The production front: the meaning, and the sentence with the word cut out of
 * it. The word itself is what the reader has to supply, so it appears nowhere.
 */
function createProductionFront(card: ReviewCard, definition: DefinitionResult | undefined): HTMLElement[] {
  const gloss = definition ? primaryGloss(definition) : '';

  const children: HTMLElement[] = [
    createElement({
      className: gloss ? 'card-gloss' : 'card-gloss card-gloss--missing',
      textContent: gloss || 'Definition unavailable',
    }),
  ];

  if (card.context) {
    children.push(createContextSentence(card.word, card.context, { blank: true, label: 'In context' }));
  }

  return children;
}

export function renderFront(
  document: Document,
  card: ReviewCard,
  definition?: DefinitionResult,
): void {
  const cardFront = document.getElementById(ELEMENT_IDS.cardFront);
  const cardBack = document.getElementById(ELEMENT_IDS.cardBack);
  const showAnswerContainer = document.getElementById(ELEMENT_IDS.showAnswerContainer);
  const ratingBtns = document.getElementById(ELEMENT_IDS.ratingBtns);

  if (cardFront) {
    cardFront.replaceChildren();
    cardFront.appendChild(createPrompt(card.direction));

    if (card.direction === 'production') {
      createProductionFront(card, definition).forEach(child => cardFront.appendChild(child));
    } else {
      cardFront.appendChild(
        createElement({ className: 'card-characters', textContent: card.word })
      );
    }

    cardFront.style.display = '';
  }
  if (cardBack) {
    cardBack.replaceChildren();
    cardBack.style.display = 'none';
  }
  if (showAnswerContainer) showAnswerContainer.style.display = '';
  if (ratingBtns) ratingBtns.style.display = 'none';

  const cardEl = document.getElementById(ELEMENT_IDS.card);
  if (cardEl) {
    cardEl.dataset.currentWord = card.word;
    cardEl.dataset.currentDirection = card.direction;
  }
}

/** Placeholder for the one front that cannot be drawn until a lookup returns. */
export function renderFrontLoading(document: Document, card: ReviewCard): void {
  const cardFront = document.getElementById(ELEMENT_IDS.cardFront);
  const cardBack = document.getElementById(ELEMENT_IDS.cardBack);
  const showAnswerContainer = document.getElementById(ELEMENT_IDS.showAnswerContainer);
  const ratingBtns = document.getElementById(ELEMENT_IDS.ratingBtns);

  if (cardFront) {
    cardFront.replaceChildren();
    cardFront.appendChild(createElement({ className: 'card-gloss', textContent: 'Loading...' }));
    cardFront.style.display = '';
  }
  if (cardBack) {
    cardBack.replaceChildren();
    cardBack.style.display = 'none';
  }
  // Nothing has been asked yet, so there is nothing to reveal.
  if (showAnswerContainer) showAnswerContainer.style.display = 'none';
  if (ratingBtns) ratingBtns.style.display = 'none';

  const cardEl = document.getElementById(ELEMENT_IDS.card);
  if (cardEl) {
    cardEl.dataset.currentWord = card.word;
    cardEl.dataset.currentDirection = card.direction;
  }
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

export function renderBack(
  document: Document,
  card: ReviewCard,
  definition: DefinitionResult,
): void {
  const cardBack = document.getElementById(ELEMENT_IDS.cardBack);
  const showAnswerContainer = document.getElementById(ELEMENT_IDS.showAnswerContainer);
  const ratingBtns = document.getElementById(ELEMENT_IDS.ratingBtns);

  if (cardBack) {
    cardBack.replaceChildren();
    // Only the production card withheld the word, so only its answer leads
    // with it; the others already have it on the front.
    cardBack.appendChild(
      createDefinitionElement(card.word, definition, card.direction === 'production')
    );
    // The sentence the reader actually met the word in, under the dictionary
    // senses: a gloss says what a word means, this says how it was used.
    if (card.context) cardBack.appendChild(createContextSentence(card.word, card.context));
    cardBack.style.display = '';
  }
  if (showAnswerContainer) showAnswerContainer.style.display = 'none';
  if (ratingBtns) ratingBtns.style.display = '';
}
