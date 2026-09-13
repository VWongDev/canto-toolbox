import type {
  StatisticsResponse,
  LookupResponse,
  ErrorResponse,
  Statistics,
  WordStatus,
} from '../shared/types.js';
import { statsClient, type StatsClient } from './stats-client.js';
import { statsStorage, type StatsStorage } from './stats-storage.js';
import {
  ELEMENT_IDS,
  getRequiredElements,
  showError,
  renderStatistics,
  renderDefinitionLoading,
  renderDefinition,
  renderOverview,
  renderSortOptions,
  refreshStatRow,
  updateFilterCounts,
  updateFilterTabStates,
  type ListView,
  type StatsElements
} from './stats-view.js';
import { summarise } from './overview.js';
import { DEFAULT_SORT, isSortKey } from './ordering.js';
import { applyWordStatus } from '../shared/statistics-utils.js';

const CLEAR_LABEL = 'Clear Statistics';
const CLEAR_CONFIRM_LABEL = 'Clear everything?';
const CLEAR_FAILED_LABEL = 'Could not clear';

/** How long the armed button waits for the second press before standing down. */
const CLEAR_CONFIRM_MS = 5000;

export class StatsManager {
  private readonly document: Document;
  private readonly client: StatsClient;
  private readonly storage: StatsStorage;
  private cachedStatistics: Statistics | null = null;
  private controlsReady = false;
  private view: ListView = { stages: new Set(), bands: new Set(), sort: DEFAULT_SORT };

  constructor(document: Document, client: StatsClient, storage: StatsStorage) {
    this.document = document;
    this.client = client;
    this.storage = storage;
  }

  init(): void {
    this.loadStatistics();
    this.setupClearButton();
    this.setupFlashcardButton();
  }

  private loadStatistics(): void {
    const elements = getRequiredElements(this.document);
    if (!elements) return;

    this.client.getStatistics((response: StatisticsResponse | ErrorResponse) => {
      this.handleStatisticsResponse(response, elements);
    });
  }

  private handleStatisticsResponse(
    response: StatisticsResponse | ErrorResponse | undefined,
    elements: StatsElements
  ): void {
    const { loadingEl } = elements;

    if (!response) {
      console.error('[Stats] No response received');
      showError(loadingEl, 'No response from background script. Please try again.');
      return;
    }

    if (!response.success) {
      console.error('[Stats] Failed to load statistics:', response);
      showError(loadingEl, 'Failed to load statistics: ' + response.error);
      return;
    }

    this.cachedStatistics = response.statistics;
    updateFilterCounts(elements, response.statistics);
    this.setupListControls(elements);
    this.render(elements, response.statistics);
  }

  private render(elements: StatsElements, statistics: Statistics): void {
    // The overview reads the whole record on purpose: what is owed does not
    // change because the list below is filtered to one stage.
    renderOverview(this.document, summarise(statistics));
    updateFilterCounts(elements, statistics);
    updateFilterTabStates(elements, this.view);
    renderStatistics(
      statistics,
      elements,
      (word, container) => this.loadDefinition(word, container),
      this.view,
      (word, status) => this.setWordStatus(elements, word, status),
      () => this.clearFilters(elements),
    );
  }

  private clearFilters(elements: StatsElements): void {
    this.view.stages.clear();
    this.view.bands.clear();
    if (this.cachedStatistics) this.render(elements, this.cachedStatistics);
  }

  /**
   * A retired or chosen word changes which stage it counts towards, so the
   * overview and the pills are redrawn from the updated record. The row itself
   * is repainted in place: the buttons sit inside the row's expanded panel, and
   * rebuilding the list closed the panel the reader had just opened. Only a
   * word the press moves out of the current filter needs the list rebuilt.
   */
  private setWordStatus(elements: StatsElements, word: string, status: WordStatus): void {
    const stat = this.cachedStatistics?.[word];
    if (!stat || !this.cachedStatistics) return;

    const updated = applyWordStatus(stat, status);

    this.cachedStatistics = { ...this.cachedStatistics, [word]: updated };
    this.client.setWordStatus(word, status, () => {});

    renderOverview(this.document, summarise(this.cachedStatistics));
    updateFilterCounts(elements, this.cachedStatistics);

    if (!refreshStatRow(elements, word, updated, this.view)) {
      this.render(elements, this.cachedStatistics);
    }
  }

  /**
   * Wired once. Statistics are loaded again after a clear, and re-running this
   * would leave two listeners on each row of pills — a click toggling a filter
   * on and straight back off.
   */
  private setupListControls(elements: StatsElements): void {
    if (this.controlsReady) return;
    this.controlsReady = true;

    renderSortOptions(elements.sortSelectEl);
    this.setupTabs(elements, elements.filterTabsEl, 'stage');
    this.setupTabs(elements, elements.bandTabsEl, 'band');

    elements.sortSelectEl.addEventListener('change', () => {
      const chosen = elements.sortSelectEl.value;
      if (!isSortKey(chosen)) return;

      this.view = { ...this.view, sort: chosen };
      if (this.cachedStatistics) this.render(elements, this.cachedStatistics);
    });
  }

  /**
   * Each tab toggles one value; an empty set means the filter is off entirely.
   * The set is read off the view on every click rather than captured, so
   * replacing the view does not leave the pills editing a discarded one.
   */
  private setupTabs(
    elements: StatsElements,
    tabsEl: HTMLElement,
    key: 'stage' | 'band',
  ): void {
    tabsEl.addEventListener('click', (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      const tab = e.target.closest(`[data-${key}]`) as HTMLElement | null;
      const value = tab?.dataset[key];
      if (!value) return;

      const active: Set<string> = key === 'stage' ? this.view.stages : this.view.bands;
      if (active.has(value)) active.delete(value);
      else active.add(value);

      if (this.cachedStatistics) this.render(elements, this.cachedStatistics);
    });
  }

  private loadDefinition(word: string, container: HTMLElement): void {
    renderDefinitionLoading(container);
    const context = this.cachedStatistics?.[word]?.context;
    this.client.lookupWord(word, (response: LookupResponse | ErrorResponse) => {
      renderDefinition(container, response, word, context);
    });
  }

  private async clearStatistics(): Promise<void> {
    await this.storage.clearStatistics();
    this.cachedStatistics = null;
    this.view.stages.clear();
    this.view.bands.clear();
    this.view.sort = DEFAULT_SORT;
    this.loadStatistics();
  }

  private setupFlashcardButton(): void {
    const flashcardBtn = this.document.getElementById(ELEMENT_IDS.flashcardBtn);
    if (!flashcardBtn) return;

    flashcardBtn.addEventListener('click', () => {
      void chrome.tabs.create({ url: chrome.runtime.getURL('src/flashcards/flashcards.html') });
    });
  }

  /**
   * Clearing is irreversible, so it asks twice — but through the button
   * itself rather than `confirm()`. The page is the extension's action popup,
   * and a modal dialog there is unreliable: it can take the popup down with
   * it, leaving the reader unsure whether anything was cleared.
   */
  private setupClearButton(): void {
    const clearBtn = this.document.getElementById(ELEMENT_IDS.clearBtn);
    if (!clearBtn) {
      console.error('[Stats] Clear button not found');
      return;
    }

    let armed = false;
    let disarm: ReturnType<typeof setTimeout> | undefined;

    const reset = (): void => {
      armed = false;
      if (disarm !== undefined) clearTimeout(disarm);
      disarm = undefined;
      clearBtn.textContent = CLEAR_LABEL;
      clearBtn.classList.remove('is-armed');
    };

    clearBtn.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        clearBtn.textContent = CLEAR_CONFIRM_LABEL;
        clearBtn.classList.add('is-armed');
        disarm = setTimeout(reset, CLEAR_CONFIRM_MS);
        return;
      }

      reset();

      try {
        await this.clearStatistics();
      } catch (error) {
        console.error('Error clearing statistics:', error);
        clearBtn.textContent = CLEAR_FAILED_LABEL;
        setTimeout(reset, CLEAR_CONFIRM_MS);
      }
    });

    // Tabbing away is an answer of "no".
    clearBtn.addEventListener('blur', reset);
  }
}

export const statsManager = new StatsManager(document, statsClient, statsStorage);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => statsManager.init());
} else {
  statsManager.init();
}
