import type { FlashcardStage, WordStatistics, LookupResponse, ErrorResponse, Statistics, WordStatus } from '../shared/types.js';
import { getFlashcardStage } from '../shared/statistics-utils.js';
import { createElement } from '../shared/dom-element.js';
import { createDefinitionElement } from '../shared/definition-section.js';
import { createContextSentence } from '../shared/context-sentence.js';

export const ELEMENT_IDS = {
  loading: 'loading',
  emptyState: 'empty-state',
  statsList: 'stats-list',
  wordCount: 'word-count',
  clearBtn: 'clear-btn',
  flashcardBtn: 'flashcard-btn',
  filterTabs: 'filter-tabs',
} as const;

/** Chevron drawn as SVG so it scales cleanly; rotation is handled in CSS. */
const CHEVRON_SVG =
  '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
  '<path d="M3.5 1.5L7 5l-3.5 3.5" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

/** Records a decision the reader made about a word, then re-renders the list. */
export type SetWordStatus = (word: string, status: WordStatus) => void;

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
  setStatus: SetWordStatus,
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
    statsListEl.appendChild(createStatItem(word, stat, loadDefinition, setStatus));
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
  word: string,
  context?: string
): void {
  container.replaceChildren();
  if (context) container.appendChild(createContextSentence(word, context));

  if (!response || !response.success || !response.definition) {
    container.appendChild(createElement({
      className: 'stat-error',
      textContent: 'Something went wrong'
    }));
    return;
  }

  container.appendChild(createDefinitionElement(word, response.definition, false));
  container.dataset.loaded = 'true';
}

function createStageBadge(stage: FlashcardStage): HTMLElement {
  return createElement({
    tag: 'span',
    className: `stage-badge stage-badge--${stage}`,
    textContent: STAGE_LABELS[stage],
  });
}

/**
 * Retiring and choosing are the two things the reader can say about a word
 * that hovering cannot: that they already know it, and that they want it
 * studied sooner than the exposure gate would allow.
 */
function createStatusControls(
  word: string,
  stat: WordStatistics,
  setStatus: SetWordStatus,
): HTMLElement {
  const retired = stat.suppressed === true;
  const pinned = stat.pinned === true;

  const know = createElement<HTMLButtonElement>({
    tag: 'button',
    className: `stat-action${retired ? ' stat-action--on' : ''}`,
    textContent: retired ? 'Retired' : 'I know this',
    attributes: { title: retired ? 'Put this word back in the deck' : 'Stop reviewing this word' },
    listeners: {
      click: (event: Event) => {
        event.stopPropagation();
        setStatus(word, { suppressed: !retired });
      },
    },
  });

  const study = createElement<HTMLButtonElement>({
    tag: 'button',
    className: `stat-action${pinned ? ' stat-action--on' : ''}`,
    textContent: pinned ? 'Studying' : 'Study this',
    attributes: { title: pinned ? 'Stop prioritising this word' : 'Add this word to the deck now' },
    listeners: {
      click: (event: Event) => {
        event.stopPropagation();
        setStatus(word, { pinned: !pinned });
      },
    },
  });

  return createElement({ className: 'stat-actions', children: [study, know] });
}

function createStatItem(
  word: string,
  stat: WordStatistics,
  loadDefinition: LoadDefinition,
  setStatus: SetWordStatus,
): HTMLElement {
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

  const expandIcon = createElement({ className: 'stat-expand-icon' });
  expandIcon.innerHTML = CHEVRON_SVG;

  const count = stat.count || 0;
  const detailsEl = createElement({
    className: 'stat-details',
    children: [
      createElement({
        className: 'stat-count',
        textContent: String(count)
      }),
      createElement({
        className: 'stat-label',
        textContent: count === 1 ? 'time studied' : 'times studied'
      }),
      expandIcon
    ]
  });

  header.appendChild(wordRow);
  header.appendChild(detailsEl);

  // The definition is rendered into a container of its own, so re-rendering it
  // cannot take the row's controls with it.
  const definitionEl = createElement({ className: 'stat-definition' });
  const expandedContent = createElement({
    className: 'stat-expanded',
    style: { display: 'none' },
    children: [definitionEl, createStatusControls(word, stat, setStatus)],
  });

  item.appendChild(header);
  item.appendChild(expandedContent);

  header.addEventListener('click', () => {
    toggleExpansion(item, word, expandedContent, definitionEl, loadDefinition);
  });

  return item;
}

function toggleExpansion(
  item: HTMLElement,
  word: string,
  expandedContent: HTMLElement,
  definitionEl: HTMLElement,
  loadDefinition: LoadDefinition
): void {
  const isExpanded = expandedContent.style.display !== 'none';

  if (isExpanded) {
    expandedContent.style.display = 'none';
    item.classList.remove('expanded');
  } else {
    expandedContent.style.display = 'block';
    if (!definitionEl.dataset.loaded) loadDefinition(word, definitionEl);
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
