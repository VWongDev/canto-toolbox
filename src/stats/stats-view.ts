import type { WordStatistics, LookupResponse, ErrorResponse } from '../shared/types.js';
import { createElement } from '../shared/dom-element.js';
import { createDefinitionElement } from '../shared/definition-section.js';

export const ELEMENT_IDS = {
  loading: 'loading',
  emptyState: 'empty-state',
  statsList: 'stats-list',
  wordCount: 'word-count',
  clearBtn: 'clear-btn',
  flashcardBtn: 'flashcard-btn'
} as const;

const EXPAND_ICON_COLLAPSED = '▶';
const EXPAND_ICON_EXPANDED = '▼';

export interface StatsElements {
  loadingEl: HTMLElement;
  emptyStateEl: HTMLElement;
  statsListEl: HTMLElement;
  wordCountEl: HTMLElement;
}

/** Lazily loads and renders a word's definition into its expanded container. */
export type LoadDefinition = (word: string, container: HTMLElement) => void;

export function getRequiredElements(document: Document): StatsElements | null {
  const loadingEl = document.getElementById(ELEMENT_IDS.loading);
  const emptyStateEl = document.getElementById(ELEMENT_IDS.emptyState);
  const statsListEl = document.getElementById(ELEMENT_IDS.statsList);
  const wordCountEl = document.getElementById(ELEMENT_IDS.wordCount);

  if (!loadingEl || !emptyStateEl || !statsListEl || !wordCountEl) {
    console.error('[Stats] Required DOM elements not found!', { loadingEl, emptyStateEl, statsListEl, wordCountEl });
    return null;
  }

  return { loadingEl, emptyStateEl, statsListEl, wordCountEl };
}

export function showError(loadingEl: HTMLElement, message: string): void {
  loadingEl.textContent = message;
  loadingEl.style.color = '#dc3545';
}

export function renderStatistics(
  statistics: Record<string, WordStatistics>,
  elements: StatsElements,
  loadDefinition: LoadDefinition
): void {
  const { loadingEl, emptyStateEl, statsListEl, wordCountEl } = elements;
  const words = Object.keys(statistics);

  loadingEl.style.display = 'none';

  if (words.length === 0) {
    emptyStateEl.style.display = 'block';
    statsListEl.style.display = 'none';
    wordCountEl.textContent = '0 words tracked';
    return;
  }

  emptyStateEl.style.display = 'none';
  statsListEl.style.display = 'flex';
  wordCountEl.textContent = `${words.length} ${words.length === 1 ? 'word' : 'words'} tracked`;

  const sortedWords = sortWordsByCount(words, statistics);
  statsListEl.replaceChildren();

  sortedWords.forEach(word => {
    const stat = statistics[word];
    if (!stat) return;
    statsListEl.appendChild(createStatItem(word, stat, loadDefinition));
  });
}

/** Loading placeholder shown while a definition request is in flight. */
export function renderDefinitionLoading(container: HTMLElement): void {
  container.replaceChildren();
  container.appendChild(createElement({
    className: 'stat-loading',
    textContent: 'Loading definition...'
  }));
  container.style.display = 'block';
}

export function renderDefinition(
  container: HTMLElement,
  response: LookupResponse | ErrorResponse | undefined,
  word: string
): void {
  container.replaceChildren();

  if (!response || !response.success || !response.definition) {
    container.appendChild(createElement({
      className: 'stat-error',
      textContent: 'Something went wrong'
    }));
    return;
  }

  container.appendChild(createDefinitionElement(word, response.definition));
  container.dataset.loaded = 'true';
}

function createStatItem(word: string, stat: WordStatistics, loadDefinition: LoadDefinition): HTMLElement {
  const item = createElement({
    className: 'stat-item',
    dataset: { word }
  });

  const header = createElement({
    className: 'stat-header',
    style: { cursor: 'pointer' }
  });

  const wordEl = createElement({
    className: 'stat-word',
    textContent: word
  });

  const expandIcon = createElement({
    className: 'stat-expand-icon',
    textContent: EXPAND_ICON_COLLAPSED
  });

  const detailsEl = createElement({
    className: 'stat-details',
    children: [
      createElement({
        className: 'stat-count',
        textContent: String(stat.count || 0)
      }),
      createElement({
        className: 'stat-label',
        textContent: 'Hover Count'
      }),
      expandIcon
    ]
  });

  header.appendChild(wordEl);
  header.appendChild(detailsEl);

  const expandedContent = createElement({
    className: 'stat-expanded',
    style: { display: 'none' }
  });

  item.appendChild(header);
  item.appendChild(expandedContent);

  header.addEventListener('click', () => {
    toggleExpansion(item, word, expandedContent, expandIcon, loadDefinition);
  });

  return item;
}

function toggleExpansion(
  item: HTMLElement,
  word: string,
  expandedContent: HTMLElement,
  expandIcon: HTMLElement,
  loadDefinition: LoadDefinition
): void {
  const isExpanded = expandedContent.style.display !== 'none';

  if (isExpanded) {
    expandedContent.style.display = 'none';
    expandIcon.textContent = EXPAND_ICON_COLLAPSED;
    item.classList.remove('expanded');
  } else {
    if (!expandedContent.dataset.loaded) {
      loadDefinition(word, expandedContent);
    } else {
      expandedContent.style.display = 'block';
    }
    expandIcon.textContent = EXPAND_ICON_EXPANDED;
    item.classList.add('expanded');
  }
}

function sortWordsByCount(words: string[], statistics: Record<string, WordStatistics>): string[] {
  return words.sort((a, b) => {
    const countA = statistics[a]?.count ?? 0;
    const countB = statistics[b]?.count ?? 0;
    return countB - countA;
  });
}
