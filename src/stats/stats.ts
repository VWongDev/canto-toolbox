import type {
  StatisticsResponse,
  LookupResponse,
  ErrorResponse,
  Statistics,
  FlashcardStage,
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
  updateFilterCounts,
  updateFilterTabStates,
  type StatsElements
} from './stats-view.js';

export class StatsManager {
  private readonly document: Document;
  private readonly client: StatsClient;
  private readonly storage: StatsStorage;
  private cachedStatistics: Statistics | null = null;
  private activeFilters: Set<FlashcardStage> = new Set();

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
    this.setupFilterTabs(elements);
    this.render(elements, response.statistics);
  }

  private render(elements: StatsElements, statistics: Statistics): void {
    renderStatistics(
      statistics,
      elements,
      (word, container) => this.loadDefinition(word, container),
      this.activeFilters,
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

  private setupFilterTabs(elements: StatsElements): void {
    elements.filterTabsEl.addEventListener('click', (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      const tab = e.target.closest('[data-stage]') as HTMLElement | null;
      if (!tab) return;
      const stage = tab.dataset.stage as FlashcardStage | undefined;
      if (!stage) return;

      if (this.activeFilters.has(stage)) {
        this.activeFilters.delete(stage);
      } else {
        this.activeFilters.add(stage);
      }

      updateFilterTabStates(elements.filterTabsEl, this.activeFilters);

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
    this.activeFilters = new Set();
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
