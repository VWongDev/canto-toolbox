import type { DefinitionResult, StatisticsResponse, WordStatistics, LookupResponse, DictionaryEntry } from '../types';
import { createElement, clearElement } from './dom-utils';

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

function init(): void {
  loadStatistics();
  setupClearButton();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function getRequiredElements() {
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

function showError(loadingEl: HTMLElement, message: string): void {
  loadingEl.textContent = message;
  loadingEl.style.color = '#dc3545';
}

function handleStatisticsResponse(response: StatisticsResponse | undefined, elements: ReturnType<typeof getRequiredElements>): void {
  if (!elements) return;

  const { loadingEl, emptyStateEl, statsListEl, wordCountEl } = elements;

  if (chrome.runtime.lastError) {
    console.error('[Stats] Error getting statistics:', chrome.runtime.lastError);
    showError(loadingEl, 'Error loading statistics: ' + chrome.runtime.lastError.message);
    return;
  }

  if (!response) {
    console.error('[Stats] No response received');
    showError(loadingEl, 'No response from background script. Please try again.');
    return;
  }

  if (!response.success) {
    console.error('[Stats] Failed to load statistics:', response);
    const errorMsg = 'error' in response ? response.error : 'Unknown error';
    showError(loadingEl, 'Failed to load statistics: ' + errorMsg);
    return;
  }

  if (!('statistics' in response)) {
    console.error('[Stats] Invalid response format');
    showError(loadingEl, 'Invalid response from background script.');
    return;
  }

  displayStatistics(response.statistics, elements);
}

function displayStatistics(statistics: Record<string, WordStatistics>, elements: ReturnType<typeof getRequiredElements>): void {
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
      const item = createStatItem(word, stat);
      statsListEl.appendChild(item);
    });
  }
}

function sortWordsByCount(words: string[], statistics: Record<string, WordStatistics>): string[] {
  return words.sort((a, b) => {
    const countA = statistics[a]?.count || 0;
    const countB = statistics[b]?.count || 0;
    return countB - countA;
  });
}

function loadStatistics(): void {
  const elements = getRequiredElements();
  if (!elements) return;

  chrome.runtime.sendMessage({ type: 'get_statistics' }, (response: StatisticsResponse | undefined) => {
    handleStatisticsResponse(response, elements);
  });
}

function createStatItem(word: string, stat: WordStatistics): HTMLElement {
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
    toggleExpansion(item, word, expandedContent, expandIcon);
  });

  return item;
}

function toggleExpansion(item: HTMLElement, word: string, expandedContent: HTMLElement, expandIcon: HTMLElement): void {
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

function handleDefinitionResponse(response: LookupResponse | undefined, container: HTMLElement, word: string): void {
  clearElement(container);
  
  if (chrome.runtime.lastError) {
    const errorEl = createElement({
      className: 'stat-error',
      textContent: `Error: ${chrome.runtime.lastError.message}`
    });
    container.appendChild(errorEl);
    return;
  }

  if (!response || !response.success || !('definition' in response) || !response.definition) {
    const errorEl = createElement({
      className: 'stat-error',
      textContent: 'Definition not found'
    });
    container.appendChild(errorEl);
    return;
  }

  const definition = response.definition;
  const definitionEl = createDefinitionElement(word, definition);
  container.appendChild(definitionEl);
  container.dataset.loaded = 'true';
}

function loadDefinition(word: string, container: HTMLElement): void {
  clearElement(container);
  
  const loadingEl = createElement({
    className: 'stat-loading',
    textContent: 'Loading definition...'
  });
  container.appendChild(loadingEl);
  container.style.display = 'block';

  chrome.runtime.sendMessage({ type: 'lookup_word', word: word }, (response: LookupResponse | undefined) => {
    handleDefinitionResponse(response, container, word);
  });
}

function getRomanisationFromEntries(entries: DictionaryEntry[]): string {
  if (entries.length === 0) return 'N/A';
  if (entries.length === 1) return entries[0].romanisation || 'N/A';
  
  const pronunciations = new Set<string>();
  for (const entry of entries) {
    if (entry.romanisation) {
      pronunciations.add(entry.romanisation);
    }
  }
  return Array.from(pronunciations).join(', ');
}

function getDefinitionsFromEntries(entries: DictionaryEntry[]): string[] {
  const allDefinitions: string[] = [];
  for (const entry of entries) {
    const defs = entry.definitions || [];
    allDefinitions.push(...defs.filter(d => d && String(d).trim().length > 0));
  }
  return allDefinitions;
}

function createDefinitionTextElement(definitions: string[] | undefined): HTMLElement {
  if (!definitions || definitions.length === 0) {
    return createElement({
      className: 'definition-text',
      textContent: 'Not found'
    });
  }
  
  if (definitions.length === 1) {
    return createElement({
      className: 'definition-text',
      textContent: definitions[0]
    });
  }
  
  return createElement({
    className: 'definition-text',
    children: definitions.map(def =>
      createElement({
        className: 'definition-item',
        textContent: def
      })
    )
  });
}

function groupEntriesByPronunciation(entries: Array<{ romanisation?: string; definitions?: string[] }>): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const entry of entries) {
    const pronunciation = entry.romanisation || '';
    if (!grouped[pronunciation]) {
      grouped[pronunciation] = [];
    }
    const defs = entry.definitions || [];
    grouped[pronunciation].push(...defs.filter(d => d && String(d).trim().length > 0));
  }
  return grouped;
}

function createMandarinSection(mandarinData: DefinitionResult['mandarin']): HTMLElement {
  if (!mandarinData || !mandarinData.entries || mandarinData.entries.length <= 1) {
    const entries = mandarinData?.entries || [];
    const romanisation = getRomanisationFromEntries(entries);
    const definitions = getDefinitionsFromEntries(entries);
    
    return createElement({
      className: 'definition-section',
      children: [
        createElement({
          className: 'definition-label',
          textContent: 'Mandarin'
        }),
        createElement({
          className: 'definition-pinyin',
          textContent: romanisation
        }),
        createDefinitionTextElement(definitions)
      ]
    });
  }
  
  const byPinyin = groupEntriesByPronunciation(mandarinData.entries);
  
  return createElement({
    className: 'definition-section',
    children: [
      createElement({
        className: 'definition-label',
        textContent: 'Mandarin'
      }),
      ...Object.entries(byPinyin).map(([pinyin, defs]) => {
        return createElement({
          className: 'pronunciation-group',
          children: [
            createElement({
              className: 'definition-pinyin',
              textContent: pinyin
            }),
            createDefinitionTextElement(defs)
          ]
        });
      })
    ]
  });
}

function createCantoneseSection(cantoneseData: DefinitionResult['cantonese']): HTMLElement {
  if (!cantoneseData || !cantoneseData.entries || cantoneseData.entries.length <= 1) {
    const entries = cantoneseData?.entries || [];
    const romanisation = getRomanisationFromEntries(entries);
    const definitions = getDefinitionsFromEntries(entries);
    const hasDefinition = definitions.length > 0;
    
    const children: HTMLElement[] = [
      createElement({
        className: 'definition-label',
        textContent: 'Cantonese'
      }),
      createElement({
        className: 'definition-jyutping',
        textContent: romanisation
      })
    ];
    
    if (hasDefinition) {
      children.push(createDefinitionTextElement(definitions));
    }
    
    return createElement({
      className: 'definition-section',
      children
    });
  }
  
  const byJyutping = groupEntriesByPronunciation(cantoneseData.entries);
  
  const children: HTMLElement[] = [
    createElement({
      className: 'definition-label',
      textContent: 'Cantonese'
    }),
    ...Object.entries(byJyutping).map(([jyutping, defs]) => {
      const hasDefinition = defs && defs.length > 0;
      
      const groupChildren: HTMLElement[] = [
        createElement({
          className: 'definition-jyutping',
          textContent: jyutping
        })
      ];
      
      if (hasDefinition) {
        groupChildren.push(createDefinitionTextElement(defs));
      }
      
      return createElement({
        className: 'pronunciation-group',
        children: groupChildren
      });
    })
  ];
  
  return createElement({
    className: 'definition-section',
    children
  });
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

async function clearStatistics(): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: {} });
  await chrome.storage.local.set({ [STORAGE_KEY]: {} });
  loadStatistics();
}

function setupClearButton(): void {
  const clearBtn = document.getElementById(ELEMENT_IDS.clearBtn);
  if (!clearBtn) {
    console.error('[Stats] Clear button not found');
    return;
  }
  
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all statistics? This action cannot be undone.')) {
      return;
    }

    try {
      await clearStatistics();
    } catch (error) {
      console.error('Error clearing statistics:', error);
      alert('Failed to clear statistics. Please try again.');
    }
  });
}
