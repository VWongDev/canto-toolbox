import type { DefinitionResult, StatisticsResponse, WordStatistics, LookupResponse, DictionaryEntry, ErrorResponse } from '../types';
import { createElement, clearElement } from './dom-utils';
import { messageManager, type MessageManager } from './background.js';
import { createPronunciationSection, type PronunciationSectionConfig } from '../utils/ui-helpers.js';

const ELEMENT_IDS = {
  loading: 'loading',
  emptyState: 'empty-state',
  statsList: 'stats-list',
  wordCount: 'word-count',
  clearBtn: 'clear-btn'
} as const;

const STORAGE_KEY = 'wordStatistics';
const EXPAND_ICON_COLLAPSED = '▶';
const EXPAND_ICON_EXPANDED = '▼';

export class StatsManager {
  private readonly document: Document;
  private readonly messageManager: MessageManager;
  private readonly chromeStorage: typeof chrome.storage;

  constructor(document: Document, messageManager: MessageManager, chromeStorage: typeof chrome.storage) {
    this.document = document;
    this.messageManager = messageManager;
    this.chromeStorage = chromeStorage;
  }

  init(): void {
    this.loadStatistics();
    this.setupClearButton();
  }

  private getRequiredElements() {
    const loadingEl = this.document.getElementById(ELEMENT_IDS.loading);
    const emptyStateEl = this.document.getElementById(ELEMENT_IDS.emptyState);
    const statsListEl = this.document.getElementById(ELEMENT_IDS.statsList);
    const wordCountEl = this.document.getElementById(ELEMENT_IDS.wordCount);

    if (!loadingEl || !emptyStateEl || !statsListEl || !wordCountEl) {
      console.error('[Stats] Required DOM elements not found!', { loadingEl, emptyStateEl, statsListEl, wordCountEl });
      return null;
    }

    return { loadingEl, emptyStateEl, statsListEl, wordCountEl };
  }

  private showError(loadingEl: HTMLElement, message: string): void {
    loadingEl.textContent = message;
    loadingEl.style.color = '#dc3545';
  }

  private handleStatisticsResponse(response: StatisticsResponse | ErrorResponse | undefined, elements: ReturnType<typeof this.getRequiredElements>): void {
    if (!elements) return;

    const { loadingEl, emptyStateEl, statsListEl, wordCountEl } = elements;

    if (!response) {
      console.error('[Stats] No response received');
      this.showError(loadingEl, 'No response from background script. Please try again.');
      return;
    }

    if (!response.success) {
      console.error('[Stats] Failed to load statistics:', response);
      this.showError(loadingEl, 'Failed to load statistics: ' + response.error);
      return;
    }

    this.displayStatistics(response.statistics, elements);
  }

  private displayStatistics(statistics: Record<string, WordStatistics>, elements: ReturnType<typeof this.getRequiredElements>): void {
    if (!elements) return;

    const { loadingEl, emptyStateEl, statsListEl, wordCountEl } = elements;
    const words = Object.keys(statistics);

    loadingEl.style.display = 'none';

    if (words.length === 0) {
      emptyStateEl.style.display = 'block';
      statsListEl.style.display = 'none';
      wordCountEl.textContent = '0 words tracked';
    } else {
      emptyStateEl.style.display = 'none';
      statsListEl.style.display = 'flex';
      wordCountEl.textContent = `${words.length} ${words.length === 1 ? 'word' : 'words'} tracked`;

      const sortedWords = sortWordsByCount(words, statistics);
      clearElement(statsListEl);

      sortedWords.forEach(word => {
        const stat = statistics[word];
        const item = this.createStatItem(word, stat);
        statsListEl.appendChild(item);
      });
    }
  }

  private loadStatistics(): void {
    const elements = this.getRequiredElements();
    if (!elements) return;

    this.messageManager.getStatistics((response: StatisticsResponse | ErrorResponse) => {
      this.handleStatisticsResponse(response, elements);
    });
  }

  private createStatItem(word: string, stat: WordStatistics): HTMLElement {
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
      this.toggleExpansion(item, word, expandedContent, expandIcon);
    });

    return item;
  }

  private toggleExpansion(item: HTMLElement, word: string, expandedContent: HTMLElement, expandIcon: HTMLElement): void {
    const isExpanded = expandedContent.style.display !== 'none';
    
    if (isExpanded) {
      expandedContent.style.display = 'none';
      expandIcon.textContent = EXPAND_ICON_COLLAPSED;
      item.classList.remove('expanded');
    } else {
      if (!expandedContent.dataset.loaded) {
        this.loadDefinition(word, expandedContent);
      } else {
        expandedContent.style.display = 'block';
      }
      expandIcon.textContent = EXPAND_ICON_EXPANDED;
      item.classList.add('expanded');
    }
  }

  private handleDefinitionResponse(response: LookupResponse | ErrorResponse | undefined, container: HTMLElement, word: string): void {
    clearElement(container);
    
    if (!response || !response.success || !response.definition) {
      container.appendChild(createElement({
        className: 'stat-error',
        textContent: 'Something went wrong'
      }));
      return;
    }

    const definitionEl = createDefinitionElement(word, response.definition);
    container.appendChild(definitionEl);
    container.dataset.loaded = 'true';
  }

  private loadDefinition(word: string, container: HTMLElement): void {
    clearElement(container);
    
    const loadingEl = createElement({
      className: 'stat-loading',
      textContent: 'Loading definition...'
    });
    container.appendChild(loadingEl);
    container.style.display = 'block';

    this.messageManager.lookupWord(word, (response: LookupResponse | ErrorResponse) => {
      this.handleDefinitionResponse(response, container, word);
    });
  }

  private async clearStatistics(): Promise<void> {
    await this.chromeStorage.sync.set({ [STORAGE_KEY]: {} });
    await this.chromeStorage.local.set({ [STORAGE_KEY]: {} });
    this.loadStatistics();
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

export const statsManager = new StatsManager(document, messageManager, chrome.storage);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => statsManager.init());
} else {
  statsManager.init();
}

function sortWordsByCount(words: string[], statistics: Record<string, WordStatistics>): string[] {
  return words.sort((a, b) => {
    const countA = statistics[a]?.count || 0;
    const countB = statistics[b]?.count || 0;
    return countB - countA;
  });
}

function createDefinitionTextElement(definitions: string[] | undefined): HTMLElement {
  const defs = definitions && definitions.length > 0 ? definitions : ['Not found'];
  return createElement({
    className: 'definition-text',
    children: defs.map(def =>
      createElement({ className: 'definition-item', textContent: def })
    )
  });
}


const statsPronunciationConfig: PronunciationSectionConfig = {
  sectionClassName: 'definition-section',
  labelClassName: 'definition-label',
  pronunciationClassName: (key) => `definition-${key}`,
  groupClassName: 'pronunciation-group',
  createDefinitionElement: (defs) => createDefinitionTextElement(defs),
  showDefinitionIfEmpty: (key) => key === 'pinyin'
};

function createPronunciationSectionForStats(
  data: DefinitionResult['mandarin'] | DefinitionResult['cantonese'],
  label: string,
  pronunciationKey: 'pinyin' | 'jyutping'
): HTMLElement {
  return createPronunciationSection(data, label, pronunciationKey, statsPronunciationConfig);
}

function createMandarinSection(mandarinData: DefinitionResult['mandarin']): HTMLElement {
  return createPronunciationSectionForStats(mandarinData, 'Mandarin', 'pinyin');
}

function createCantoneseSection(cantoneseData: DefinitionResult['cantonese']): HTMLElement {
  return createPronunciationSectionForStats(cantoneseData, 'Cantonese', 'jyutping');
}

function createDefinitionElement(word: string, definition: DefinitionResult): HTMLElement {
  const displayWord = definition.word || word;
  
  return createElement({
    className: 'definition-container',
    children: [
      createElement({
        className: 'definition-word',
        textContent: displayWord
      }),
      createElement({
        className: 'definition-sections',
        children: [
          createMandarinSection(definition.mandarin),
          createCantoneseSection(definition.cantonese)
        ]
      })
    ]
  });
}
