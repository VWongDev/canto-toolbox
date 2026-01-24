// stats.ts - Statistics page logic

import type { DefinitionResult, StatisticsResponse, WordStatistics, LookupResponse } from '../types';
import { createElement, clearElement } from './dom-utils';

console.log('[Stats] Script loaded');

// Popups might load before DOMContentLoaded, so also try immediate execution
function init(): void {
  console.log('[Stats] Initializing...');
  loadStatistics();
  setupClearButton();
}

// Try both DOMContentLoaded and immediate execution
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM is already ready
  init();
}

/**
 * Load and display statistics
 */
function loadStatistics(): void {
  console.log('[Stats] loadStatistics called');
  const loadingEl = document.getElementById('loading');
  const emptyStateEl = document.getElementById('empty-state');
  const statsListEl = document.getElementById('stats-list');
  const wordCountEl = document.getElementById('word-count');

  if (!loadingEl || !emptyStateEl || !statsListEl || !wordCountEl) {
    console.error('[Stats] Required DOM elements not found!', { loadingEl, emptyStateEl, statsListEl, wordCountEl });
    return;
  }

  // Get statistics from background script
  console.log('[Stats] Requesting statistics from background script...');
  console.log('[Stats] chrome.runtime available:', !!chrome.runtime);
  chrome.runtime.sendMessage({ type: 'get_statistics' }, (response: StatisticsResponse | undefined) => {
    console.log('[Stats] Received response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('[Stats] Error getting statistics:', chrome.runtime.lastError);
      loadingEl.textContent = 'Error loading statistics: ' + chrome.runtime.lastError.message;
      loadingEl.style.color = '#dc3545';
      return;
    }

    if (!response) {
      console.error('[Stats] No response received');
      loadingEl.textContent = 'No response from background script. Please try again.';
      loadingEl.style.color = '#dc3545';
      return;
    }

    if (!response.success) {
      console.error('[Stats] Failed to load statistics:', response);
      loadingEl.textContent = 'Failed to load statistics: ' + ('error' in response ? response.error : 'Unknown error');
      loadingEl.style.color = '#dc3545';
      return;
    }

    if (!('statistics' in response)) {
      console.error('[Stats] Invalid response format');
      loadingEl.textContent = 'Invalid response from background script.';
      loadingEl.style.color = '#dc3545';
      return;
    }

    const statistics = response.statistics;
    const words = Object.keys(statistics);
    console.log('[Stats] Loaded statistics:', words.length, 'words', statistics);

    // Hide loading
    loadingEl.style.display = 'none';

    if (words.length === 0) {
      // Show empty state
      emptyStateEl.style.display = 'block';
      statsListEl.style.display = 'none';
      wordCountEl.textContent = '0 words tracked';
    } else {
      // Show statistics
      emptyStateEl.style.display = 'none';
      statsListEl.style.display = 'flex';
      
      // Update word count
      wordCountEl.textContent = `${words.length} ${words.length === 1 ? 'word' : 'words'} tracked`;

      // Sort words by count (descending)
      const sortedWords = words.sort((a, b) => {
        const countA = statistics[a]?.count || 0;
        const countB = statistics[b]?.count || 0;
        return countB - countA;
      });

      // Clear existing list
      clearElement(statsListEl);

      // Create list items
      sortedWords.forEach(word => {
        const stat = statistics[word];
        const item = createStatItem(word, stat);
        statsListEl.appendChild(item);
      });
    }
  });
}

/**
 * Create a statistics list item
 */
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
      createElement({
        className: 'stat-expand-icon',
        textContent: '▶'
      })
    ]
  });

  header.appendChild(wordEl);
  header.appendChild(detailsEl);

  // Expanded content container (initially hidden)
  const expandedContent = createElement({
    className: 'stat-expanded',
    style: { display: 'none' }
  });

  item.appendChild(header);
  item.appendChild(expandedContent);

  // Add click handler to toggle expansion
  header.addEventListener('click', () => {
    toggleExpansion(item, word, expandedContent, detailsEl.querySelector('.stat-expand-icon') as HTMLElement);
  });

  return item;
}

/**
 * Toggle expansion of a stat item
 */
function toggleExpansion(item: HTMLElement, word: string, expandedContent: HTMLElement, expandIcon: HTMLElement): void {
  const isExpanded = expandedContent.style.display !== 'none';
  
  if (isExpanded) {
    // Collapse
    expandedContent.style.display = 'none';
    expandIcon.textContent = '▶';
    item.classList.remove('expanded');
  } else {
    // Expand
    if (!expandedContent.dataset.loaded) {
      // Load definitions
      loadDefinition(word, expandedContent);
    } else {
      expandedContent.style.display = 'block';
    }
    expandIcon.textContent = '▼';
    item.classList.add('expanded');
  }
}

/**
 * Load definition for a word
 */
function loadDefinition(word: string, container: HTMLElement): void {
  clearElement(container);
  
  const loadingEl = createElement({
    className: 'stat-loading',
    textContent: 'Loading definition...'
  });
  container.appendChild(loadingEl);
  container.style.display = 'block';

  chrome.runtime.sendMessage({ type: 'lookup_word', word: word }, (response: LookupResponse | undefined) => {
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
  });
}

/**
 * Create definition element for display
 */
function createDefinitionElement(word: string, definition: DefinitionResult): HTMLElement {
  const displayWord = definition.word || word;
  
  const createDefinitionTextElement = (defText: string | undefined): HTMLElement => {
    if (!defText || defText === 'Not found' || defText === 'N/A') {
      return createElement({
        className: 'definition-text',
        textContent: defText || 'Not found'
      });
    }
    
    const definitions = defText.split(';').map(d => d.trim()).filter(d => d.length > 0);
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
  };

  const createMandarinSection = (mandarinData: DefinitionResult['mandarin']): HTMLElement => {
    if (!mandarinData || !mandarinData.entries || mandarinData.entries.length <= 1) {
      return createElement({
        className: 'definition-section',
        children: [
          createElement({
            className: 'definition-label',
            textContent: 'Mandarin'
          }),
          createElement({
            className: 'definition-pinyin',
            textContent: mandarinData?.romanisation || 'N/A'
          }),
          createDefinitionTextElement(mandarinData?.definition)
        ]
      });
    }
    
    const entries = mandarinData.entries;
    const byPinyin: Record<string, string[]> = {};
    for (const entry of entries) {
      const pinyin = entry.romanisation || '';
      if (!byPinyin[pinyin]) {
        byPinyin[pinyin] = [];
      }
      const defs = entry.definitions || [];
      byPinyin[pinyin].push(...defs.filter(d => d && String(d).trim().length > 0));
    }
    
    return createElement({
      className: 'definition-section',
      children: [
        createElement({
          className: 'definition-label',
          textContent: 'Mandarin'
        }),
        ...Object.entries(byPinyin).map(([pinyin, defs]) => {
          const defsStr = defs.join('; ');
          return createElement({
            className: 'pronunciation-group',
            children: [
              createElement({
                className: 'definition-pinyin',
                textContent: pinyin
              }),
              createDefinitionTextElement(defsStr)
            ]
          });
        })
      ]
    });
  };

  const createCantoneseSection = (cantoneseData: DefinitionResult['cantonese']): HTMLElement => {
    if (!cantoneseData || !cantoneseData.entries || cantoneseData.entries.length <= 1) {
      const hasDefinition = cantoneseData?.definition && 
                            cantoneseData.definition !== 'Not found' && 
                            cantoneseData.definition.trim().length > 0;
      
      const children: HTMLElement[] = [
        createElement({
          className: 'definition-label',
          textContent: 'Cantonese'
        }),
        createElement({
          className: 'definition-jyutping',
          textContent: cantoneseData?.romanisation || 'N/A'
        })
      ];
      
      if (hasDefinition) {
        children.push(createDefinitionTextElement(cantoneseData.definition));
      }
      
      return createElement({
        className: 'definition-section',
        children
      });
    }
    
    const entries = cantoneseData.entries;
    const byJyutping: Record<string, string[]> = {};
    for (const entry of entries) {
      const jyutping = entry.romanisation || '';
      if (!byJyutping[jyutping]) {
        byJyutping[jyutping] = [];
      }
      const defs = entry.definitions || [];
      byJyutping[jyutping].push(...defs.filter(d => d && String(d).trim().length > 0));
    }
    
    const children: HTMLElement[] = [
      createElement({
        className: 'definition-label',
        textContent: 'Cantonese'
      }),
      ...Object.entries(byJyutping).map(([jyutping, defs]) => {
        const defsStr = defs.join('; ');
        const hasDefinition = defsStr && defsStr.trim().length > 0;
        
        const groupChildren: HTMLElement[] = [
          createElement({
            className: 'definition-jyutping',
            textContent: jyutping
          })
        ];
        
        if (hasDefinition) {
          groupChildren.push(createDefinitionTextElement(defsStr));
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
  };

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

/**
 * Setup clear button functionality
 */
function setupClearButton(): void {
  const clearBtn = document.getElementById('clear-btn');
  if (!clearBtn) {
    console.error('[Stats] Clear button not found');
    return;
  }
  
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all statistics? This action cannot be undone.')) {
      return;
    }

    try {
      // Clear statistics in storage
      await chrome.storage.sync.set({ wordStatistics: {} });
      
      // Also clear local storage as fallback
      await chrome.storage.local.set({ wordStatistics: {} });

      // Reload statistics
      loadStatistics();
    } catch (error) {
      console.error('Error clearing statistics:', error);
      alert('Failed to clear statistics. Please try again.');
    }
  });
}
