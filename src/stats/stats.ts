import type {
  StatisticsResponse,
  LookupResponse,
  ErrorResponse,
  Statistics,
  FlashcardStage,
  FrequencyBand,
  WordStatistics,
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
  updateFilterCounts,
  updateFilterTabStates,
  type ListView,
  type StatsElements
} from './stats-view.js';
import { summarise } from './overview.js';
import { DEFAULT_SORT, isSortKey } from './ordering.js';

export class StatsManager {
  private readonly document: Document;
  private readonly client: StatsClient;
  private readonly storage: StatsStorage;
  private cachedStatistics: Statistics | null = null;
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
    );
  }

  /**
   * A retired or chosen word changes which stage it counts towards and whether
   * the deck will offer it, so the list is rebuilt from the updated record
   * rather than just the one row being repainted.
   */
  private setWordStatus(elements: StatsElements, word: string, status: WordStatus): void {
    const stat = this.cachedStatistics?.[word];
    if (!stat || !this.cachedStatistics) return;

    const updated: WordStatistics = { ...stat };
    if (status.suppressed !== undefined) {
      if (status.suppressed) updated.suppressed = true;
      else delete updated.suppressed;
    }
    if (status.pinned !== undefined) {
      if (status.pinned) updated.pinned = true;
      else delete updated.pinned;
    }

    this.cachedStatistics = { ...this.cachedStatistics, [word]: updated };
    this.client.setWordStatus(word, status, () => {});
    this.render(elements, this.cachedStatistics);
  }

  private setupListControls(elements: StatsElements): void {
    this.setupTabs<FlashcardStage>(elements, elements.filterTabsEl, 'stage', this.view.stages);
    this.setupTabs<FrequencyBand>(elements, elements.bandTabsEl, 'band', this.view.bands);

    elements.sortSelectEl.addEventListener('change', () => {
      const chosen = elements.sortSelectEl.value;
      if (!isSortKey(chosen)) return;

      this.view = { ...this.view, sort: chosen };
      if (this.cachedStatistics) this.render(elements, this.cachedStatistics);
    });
  }

  /** Each tab toggles one value; an empty set means the filter is off entirely. */
  private setupTabs<T extends string>(
    elements: StatsElements,
    tabsEl: HTMLElement,
    key: 'stage' | 'band',
    active: Set<T>,
  ): void {
    tabsEl.addEventListener('click', (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      const tab = e.target.closest(`[data-${key}]`) as HTMLElement | null;
      const value = tab?.dataset[key] as T | undefined;
      if (!value) return;

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
    this.view = { stages: new Set(), bands: new Set(), sort: DEFAULT_SORT };
    this.loadStatistics();
  }

  private setupFlashcardButton(): void {
    const flashcardBtn = this.document.getElementById(ELEMENT_IDS.flashcardBtn);
    if (!flashcardBtn) return;

    flashcardBtn.addEventListener('click', () => {
      void chrome.tabs.create({ url: chrome.runtime.getURL('src/flashcards/flashcards.html') });
    });
  }

  private setupClearButton(): void {
    const clearBtn = this.document.getElementById(ELEMENT_IDS.clearBtn);
    if (!clearBtn) {
      console.error('[Stats] Clear button not found');
      return;
    }

    clearBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear all statistics? This action cannot be undone.')) {
        return;
      }

      try {
        await this.clearStatistics();
      } catch (error) {
        console.error('Error clearing statistics:', error);
        alert('Failed to clear statistics. Please try again.');
      }
    });
  }
}

export const statsManager = new StatsManager(document, statsClient, statsStorage);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => statsManager.init());
} else {
  statsManager.init();
}
