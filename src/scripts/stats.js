// stats.js - Statistics page logic

console.log('[Stats] Script loaded');

// Popups might load before DOMContentLoaded, so also try immediate execution
function init() {
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
function loadStatistics() {
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
  chrome.runtime.sendMessage({ type: 'get_statistics' }, (response) => {
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
      loadingEl.textContent = 'Failed to load statistics: ' + (response.error || 'Unknown error');
      loadingEl.style.color = '#dc3545';
      return;
    }

    const statistics = response.statistics || {};
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
        const countA = statistics[a].count || 0;
        const countB = statistics[b].count || 0;
        return countB - countA;
      });

      // Clear existing list
      statsListEl.innerHTML = '';

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
function createStatItem(word, stat) {
  const item = document.createElement('div');
  item.className = 'stat-item';
  item.dataset.word = word;

  const header = document.createElement('div');
  header.className = 'stat-header';
  header.style.cursor = 'pointer';

  const wordEl = document.createElement('div');
  wordEl.className = 'stat-word';
  wordEl.textContent = word;

  const detailsEl = document.createElement('div');
  detailsEl.className = 'stat-details';

  const countEl = document.createElement('div');
  countEl.className = 'stat-count';
  countEl.textContent = stat.count || 0;

  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.textContent = 'Hover Count';

  const expandIcon = document.createElement('div');
  expandIcon.className = 'stat-expand-icon';
  expandIcon.textContent = '▶';

  detailsEl.appendChild(countEl);
  detailsEl.appendChild(labelEl);
  detailsEl.appendChild(expandIcon);

  header.appendChild(wordEl);
  header.appendChild(detailsEl);

  // Expanded content container (initially hidden)
  const expandedContent = document.createElement('div');
  expandedContent.className = 'stat-expanded';
  expandedContent.style.display = 'none';

  item.appendChild(header);
  item.appendChild(expandedContent);

  // Add click handler to toggle expansion
  header.addEventListener('click', () => {
    toggleExpansion(item, word, expandedContent, expandIcon);
  });

  return item;
}

/**
 * Toggle expansion of a stat item
 */
function toggleExpansion(item, word, expandedContent, expandIcon) {
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
function loadDefinition(word, container) {
  container.innerHTML = '<div class="stat-loading">Loading definition...</div>';
  container.style.display = 'block';

  chrome.runtime.sendMessage({ type: 'lookup_word', word: word }, (response) => {
    if (chrome.runtime.lastError) {
      container.innerHTML = `<div class="stat-error">Error: ${chrome.runtime.lastError.message}</div>`;
      return;
    }

    if (!response || !response.success || !response.definition) {
      container.innerHTML = '<div class="stat-error">Definition not found</div>';
      return;
    }

    const definition = response.definition;
    container.innerHTML = createDefinitionHTML(word, definition);
    container.dataset.loaded = 'true';
  });
}

/**
 * Create HTML for definition display
 */
function createDefinitionHTML(word, definition) {
  const displayWord = definition.word || word;
  
  const formatDefinitions = (defText) => {
    if (!defText || defText === 'Not found' || defText === 'N/A') {
      return defText || 'Not found';
    }
    const definitions = defText.split(';').map(d => d.trim()).filter(d => d.length > 0);
    if (definitions.length === 1) {
      return definitions[0];
    }
    return definitions.map(def => `<div class="definition-item">${escapeHtml(def)}</div>`).join('');
  };

  const formatMandarin = (mandarinData) => {
    if (!mandarinData || !mandarinData.entries || mandarinData.entries.length <= 1) {
      return `
        <div class="definition-section">
          <div class="definition-label">Mandarin</div>
          <div class="definition-pinyin">${escapeHtml(mandarinData?.pinyin || 'N/A')}</div>
          <div class="definition-text">${formatDefinitions(mandarinData?.definition)}</div>
        </div>
      `;
    }
    
    const entries = mandarinData.entries;
    const byPinyin = {};
    for (const entry of entries) {
      const pinyin = entry.pinyin || '';
      if (!byPinyin[pinyin]) {
        byPinyin[pinyin] = [];
      }
      const defs = entry.definitions || (entry.definition ? [entry.definition] : []);
      byPinyin[pinyin].push(...defs.filter(d => d && String(d).trim().length > 0));
    }
    
    let html = '<div class="definition-section"><div class="definition-label">Mandarin</div>';
    for (const [pinyin, defs] of Object.entries(byPinyin)) {
      const defsStr = defs.join('; ');
      html += `
        <div class="pronunciation-group">
          <div class="definition-pinyin">${escapeHtml(pinyin)}</div>
          <div class="definition-text">${formatDefinitions(defsStr)}</div>
        </div>
      `;
    }
    html += '</div>';
    return html;
  };

  const formatCantonese = (cantoneseData) => {
    if (!cantoneseData || !cantoneseData.entries || cantoneseData.entries.length <= 1) {
      return `
        <div class="definition-section">
          <div class="definition-label">Cantonese</div>
          <div class="definition-jyutping">${escapeHtml(cantoneseData?.jyutping || 'N/A')}</div>
          <div class="definition-text">${formatDefinitions(cantoneseData?.definition)}</div>
        </div>
      `;
    }
    
    const entries = cantoneseData.entries;
    const byJyutping = {};
    for (const entry of entries) {
      const jyutping = entry.jyutping || '';
      if (!byJyutping[jyutping]) {
        byJyutping[jyutping] = [];
      }
      const defs = entry.definitions || [];
      byJyutping[jyutping].push(...defs.filter(d => d && String(d).trim().length > 0));
    }
    
    let html = '<div class="definition-section"><div class="definition-label">Cantonese</div>';
    for (const [jyutping, defs] of Object.entries(byJyutping)) {
      const defsStr = defs.join('; ');
      html += `
        <div class="pronunciation-group">
          <div class="definition-jyutping">${escapeHtml(jyutping)}</div>
          <div class="definition-text">${formatDefinitions(defsStr)}</div>
        </div>
      `;
    }
    html += '</div>';
    return html;
  };

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  return `
    <div class="definition-container">
      <div class="definition-word">${escapeHtml(displayWord)}</div>
      <div class="definition-sections">
        ${formatMandarin(definition.mandarin)}
        ${formatCantonese(definition.cantonese)}
      </div>
    </div>
  `;
}

/**
 * Setup clear button functionality
 */
function setupClearButton() {
  const clearBtn = document.getElementById('clear-btn');
  
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
