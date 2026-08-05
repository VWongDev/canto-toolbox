import type { FlashcardStage, WordStatistics, LookupResponse, ErrorResponse, Statistics } from '../shared/types.js';
import { getFlashcardStage } from '../shared/statistics-utils.js';
import { createElement } from '../shared/dom-element.js';
import { createDefinitionElement, definitionPronunciationConfig } from '../shared/definition-section.js';

export const ELEMENT_IDS = {
  loading: 'loading',
  emptyState: 'empty-state',
  statsList: 'stats-list',
  wordCount: 'word-count',
  clearBtn: 'clear-btn',
  flashcardBtn: 'flashcard-btn',
  filterTabs: 'filter-tabs',
} as const;

const EXPAND_ICON_COLLAPSED = '▶';
const EXPAND_ICON_EXPANDED = '▼';

const STAGE_LABELS: Record<FlashcardStage, string> = {
  new: 'New',
  learning: 'Learning',
  familiar: 'Familiar',
  mastered: 'Mastered',
};

export interface StatsElements {
  loadingEl: HTMLElement;
  emptyStateEl: HTMLElement;
  statsListEl: HTMLElement;
  wordCountEl: HTMLElement;
  filterTabsEl: HTMLElement;
}

/** Lazily loads and renders a word's definition into its expanded container. */
export type LoadDefinition = (word: string, container: HTMLElement) => void;

export function getRequiredElements(document: Document): StatsElements | null {
  const loadingEl = document.getElementById(ELEMENT_IDS.loading);
  const emptyStateEl = document.getElementById(ELEMENT_IDS.emptyState);
  const statsListEl = document.getElementById(ELEMENT_IDS.statsList);
  const wordCountEl = document.getElementById(ELEMENT_IDS.wordCount);
  const filterTabsEl = document.getElementById(ELEMENT_IDS.filterTabs);

  if (!loadingEl || !emptyStateEl || !statsListEl || !wordCountEl || !filterTabsEl) {
    console.error('[Stats] Required DOM elements not found!');
    return null;
  }

  return { loadingEl, emptyStateEl, statsListEl, wordCountEl, filterTabsEl };
}

export function showError(loadingEl: HTMLElement, message: string): void {
  loadingEl.textContent = message;
  loadingEl.style.color = '#dc3545';
}

export function updateFilterCounts(elements: StatsElements, statistics: Statistics): void {
  const counts = { new: 0, learning: 0, familiar: 0, mastered: 0 };

  for (const stat of Object.values(statistics)) {
    counts[getFlashcardStage(stat)]++;
  }

  const entries: [string, number][] = [
    ['new', counts.new],
    ['learning', counts.learning],
    ['familiar', counts.familiar],
    ['mastered', counts.mastered],
  ];

  for (const [stage, count] of entries) {
    const el = elements.filterTabsEl.querySelector(`#count-${stage}`);
    if (el) el.textContent = String(count);
  }
}

export function updateFilterTabStates(filterTabsEl: HTMLElement, activeFilters: Set<FlashcardStage>): void {
  filterTabsEl.querySelectorAll('.filter-tab').forEach(tab => {
    const stage = (tab as HTMLElement).dataset.stage as FlashcardStage | undefined;
    tab.classList.toggle('active', stage !== undefined && activeFilters.has(stage));
  });
}

export function renderStatistics(
  statistics: Statistics,
  elements: StatsElements,
  loadDefinition: LoadDefinition,
  activeFilters: Set<FlashcardStage>,
): void {
  const { loadingEl, emptyStateEl, statsListEl, wordCountEl } = elements;
  const allWords = Object.keys(statistics);

  loadingEl.style.display = 'none';

  if (allWords.length === 0) {
    emptyStateEl.style.display = 'block';
    statsListEl.style.display = 'none';
    wordCountEl.textContent = '0 words tracked';
    return;
  }

  const filtered = activeFilters.size === 0
    ? allWords
    : allWords.filter(w => {
        const stat = statistics[w];
        return stat && activeFilters.has(getFlashcardStage(stat));
      });

  emptyStateEl.style.display = filtered.length === 0 ? 'block' : 'none';
  statsListEl.style.display = filtered.length === 0 ? 'none' : 'flex';
  wordCountEl.textContent = `${allWords.length} ${allWords.length === 1 ? 'word' : 'words'} tracked`;

  if (filtered.length === 0) {
    const activeStageNames = [...activeFilters].map(s => STAGE_LABELS[s]).join(' or ');
    const p = emptyStateEl.querySelector('p');
    if (p) p.textContent = `No ${activeStageNames} words yet.`;
    return;
  }

  const sortedWords = sortWordsByCount(filtered, statistics);
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

  container.appendChild(createDefinitionElement(word, response.definition, definitionPronunciationConfig, false));
  container.dataset.loaded = 'true';
}

function createStageBadge(stage: FlashcardStage): HTMLElement {
  return createElement({
    tag: 'span',
    className: `stage-badge stage-badge--${stage}`,
    textContent: STAGE_LABELS[stage],
  });
}

function createStatItem(word: string, stat: WordStatistics, loadDefinition: LoadDefinition): HTMLElement {
  const stage = getFlashcardStage(stat);

  const item = createElement({
    className: 'stat-item',
    dataset: { word }
  });

  const header = createElement({
    className: 'stat-header',
    style: { cursor: 'pointer' }
  });

  const wordRow = createElement({
    className: 'stat-word-row',
    children: [
      createElement({ className: 'stat-word', textContent: word }),
      createStageBadge(stage),
    ],
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

  header.appendChild(wordRow);
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
