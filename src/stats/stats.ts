import type { StatisticsResponse, LookupResponse, ErrorResponse } from '../shared/types.js';
import { statsClient, type StatsClient } from './stats-client.js';
import {
  ELEMENT_IDS,
  getRequiredElements,
  showError,
  renderStatistics,
  renderDefinitionLoading,
  renderDefinition,
  type StatsElements
} from './stats-view.js';

const STORAGE_KEY = 'wordStatistics';

export class StatsManager {
  private readonly document: Document;
  private readonly client: StatsClient;
  private readonly chromeStorage: typeof chrome.storage;

  constructor(document: Document, client: StatsClient, chromeStorage: typeof chrome.storage) {
    this.document = document;
    this.client = client;
    this.chromeStorage = chromeStorage;
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

    renderStatistics(response.statistics, elements, (word, container) => {
      this.loadDefinition(word, container);
    });
  }

  private loadDefinition(word: string, container: HTMLElement): void {
    renderDefinitionLoading(container);
    this.client.lookupWord(word, (response: LookupResponse | ErrorResponse) => {
      renderDefinition(container, response, word);
    });
  }

  private async clearStatistics(): Promise<void> {
    await this.chromeStorage.sync.set({ [STORAGE_KEY]: {} });
    await this.chromeStorage.local.set({ [STORAGE_KEY]: {} });
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

export const statsManager = new StatsManager(document, statsClient, chrome.storage);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => statsManager.init());
} else {
  statsManager.init();
}
