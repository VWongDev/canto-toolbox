import type {
  FlashcardStage,
  FrequencyBand,
  WordStatistics,
  LookupResponse,
  ErrorResponse,
  Statistics,
  WordStatus,
} from '../shared/types.js';
import { getFlashcardStage } from '../shared/statistics-utils.js';
import { createElement } from '../shared/dom-element.js';
import { createDefinitionElement } from '../shared/definition-section.js';
import { createContextSentence } from '../shared/context-sentence.js';
import { BAND_LABELS } from '../shared/frequency.js';
import { MAX_TRACKED_WORDS } from '../shared/statistics-store.js';
import { bandOf, sortWords, SORT_LABELS, type SortKey } from './ordering.js';
import type { StudyOverview } from './overview.js';

export const ELEMENT_IDS = {
  loading: 'loading',
  emptyState: 'empty-state',
  statsList: 'stats-list',
  wordCount: 'word-count',
  clearBtn: 'clear-btn',
  flashcardBtn: 'flashcard-btn',
  filterTabs: 'filter-tabs',
  bandTabs: 'band-tabs',
  sortSelect: 'sort-select',
} as const;

const OVERVIEW_IDS = {
  dueNow: 'overview-due-now',
  dueToday: 'overview-due-today',
  accuracy: 'overview-accuracy',
  reviews: 'overview-reviews',
  retired: 'overview-retired',
} as const;

/** Chevron drawn as SVG so it scales cleanly; rotation is handled in CSS. */
const CHEVRON_SVG =
  '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
  '<path d="M3.5 1.5L7 5l-3.5 3.5" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Gives each row's panel an id its header can point `aria-controls` at. */
let panelCount = 0;

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
  bandTabsEl: HTMLElement;
  sortSelectEl: HTMLSelectElement;
}

/** Every way the list can be narrowed or ordered, as the page currently has it. */
export interface ListView {
  stages: Set<FlashcardStage>;
  bands: Set<FrequencyBand>;
  sort: SortKey;
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
  const bandTabsEl = document.getElementById(ELEMENT_IDS.bandTabs);
  const sortSelectEl = document.getElementById(ELEMENT_IDS.sortSelect);

  if (
    !loadingEl ||
    !emptyStateEl ||
    !statsListEl ||
    !wordCountEl ||
    !filterTabsEl ||
    !bandTabsEl ||
    !(sortSelectEl instanceof HTMLSelectElement)
  ) {
    console.error('[Stats] Required DOM elements not found!');
    return null;
  }

  return {
    loadingEl,
    emptyStateEl,
    statsListEl,
    wordCountEl,
    filterTabsEl,
    bandTabsEl,
    sortSelectEl,
  };
}

/**
 * Fills the sort control from the comparators that back it, so a label can
 * never name an order the list does not actually sort by.
 */
export function renderSortOptions(sortSelectEl: HTMLSelectElement): void {
  sortSelectEl.replaceChildren();

  for (const [key, label] of Object.entries(SORT_LABELS)) {
    sortSelectEl.appendChild(
      createElement<HTMLOptionElement>({
        tag: 'option',
        attributes: { value: key },
        textContent: label,
      })
    );
  }
}

/**
 * The numbers that say what to do next, rather than what has been read. Drawn
 * from the whole record, so filtering the list below does not change them.
 */
export function renderOverview(document: Document, overview: StudyOverview): void {
  const values: Record<string, string> = {
    [OVERVIEW_IDS.dueNow]: String(overview.dueNow),
    [OVERVIEW_IDS.dueToday]: String(overview.dueToday),
    [OVERVIEW_IDS.accuracy]:
      overview.accuracy === undefined ? '—' : `${Math.round(overview.accuracy * 100)}%`,
    [OVERVIEW_IDS.reviews]: String(overview.reviews),
    [OVERVIEW_IDS.retired]: String(overview.retired),
  };

  for (const [id, value] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
}

export function showError(loadingEl: HTMLElement, message: string): void {
  loadingEl.textContent = message;
  // A class rather than an inline hex: the hardcoded red stayed red on the
  // dark canvas, and nothing ever cleared it again.
  loadingEl.classList.add('is-error');
}

export function updateFilterCounts(elements: StatsElements, statistics: Statistics): void {
  const stages: Record<FlashcardStage, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  const bands: Record<FrequencyBand, number> =
    { core: 0, common: 0, frequent: 0, uncommon: 0, rare: 0 };

  for (const stat of Object.values(statistics)) {
    stages[getFlashcardStage(stat)]++;
    bands[bandOf(stat)]++;
  }

  for (const [stage, count] of Object.entries(stages)) {
    const el = elements.filterTabsEl.querySelector(`#count-${stage}`);
    if (el) el.textContent = String(count);
  }

  for (const [band, count] of Object.entries(bands)) {
    const el = elements.bandTabsEl.querySelector(`#count-${band}`);
    if (el) el.textContent = String(count);
  }
}

function updateTabStates(tabsEl: HTMLElement, key: string, active: ReadonlySet<string>): void {
  tabsEl.querySelectorAll('.filter-tab').forEach(tab => {
    const value = (tab as HTMLElement).dataset[key];
    const on = value !== undefined && active.has(value);
    tab.classList.toggle('active', on);
    // The pills are toggles, not links: without this the state they carry is
    // colour alone, which a screen reader never sees.
    tab.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

export function updateFilterTabStates(elements: StatsElements, view: ListView): void {
  updateTabStates(elements.filterTabsEl, 'stage', view.stages as ReadonlySet<string>);
  updateTabStates(elements.bandTabsEl, 'band', view.bands as ReadonlySet<string>);
  elements.sortSelectEl.value = view.sort;
}

function matchesView(stat: WordStatistics, view: ListView): boolean {
  if (view.stages.size > 0 && !view.stages.has(getFlashcardStage(stat))) return false;
  if (view.bands.size > 0 && !view.bands.has(bandOf(stat))) return false;
  return true;
}

/**
 * The tracked total, and the cap it is heading for. Words are evicted silently
 * once the record is full, so the number is worth showing before it bites.
 */
function describeTotal(total: number): string {
  const words = `${total} ${total === 1 ? 'word' : 'words'} tracked`;
  return total >= MAX_TRACKED_WORDS * 0.8 ? `${words} of ${MAX_TRACKED_WORDS}` : words;
}

export function renderStatistics(
  statistics: Statistics,
  elements: StatsElements,
  loadDefinition: LoadDefinition,
  view: ListView,
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

  const filtered = allWords.filter(word => {
    const stat = statistics[word];
    return stat !== undefined && matchesView(stat, view);
  });

  emptyStateEl.style.display = filtered.length === 0 ? 'block' : 'none';
  statsListEl.style.display = filtered.length === 0 ? 'none' : 'flex';
  wordCountEl.textContent = describeTotal(allWords.length);

  if (filtered.length === 0) {
    const names = [
      ...[...view.stages].map(stage => STAGE_LABELS[stage]),
      ...[...view.bands].map(band => BAND_LABELS[band]),
    ].join(' or ');
    const p = emptyStateEl.querySelector('p');
    if (p) p.textContent = `No ${names} words yet.`;
    return;
  }

  statsListEl.replaceChildren();

  sortWords(filtered, statistics, view.sort).forEach(word => {
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

  // A real button: the row is the page's main control, and as a div it could
  // be reached by neither Tab nor Enter.
  const panelId = `stat-panel-${++panelCount}`;
  const header = createElement<HTMLButtonElement>({
    tag: 'button',
    className: 'stat-header',
    attributes: { type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId },
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
    id: panelId,
    className: 'stat-expanded',
    style: { display: 'none' },
    children: [definitionEl, createStatusControls(word, stat, setStatus)],
  });

  item.appendChild(header);
  item.appendChild(expandedContent);

  header.addEventListener('click', () => {
    toggleExpansion(item, header, word, expandedContent, definitionEl, loadDefinition);
  });

  return item;
}

function toggleExpansion(
  item: HTMLElement,
  header: HTMLElement,
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

  header.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
}

