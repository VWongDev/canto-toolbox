// stats.js - Statistics page logic

document.addEventListener('DOMContentLoaded', () => {
  loadStatistics();
  setupClearButton();
});

/**
 * Load and display statistics
 */
async function loadStatistics() {
  const loadingEl = document.getElementById('loading');
  const emptyStateEl = document.getElementById('empty-state');
  const statsListEl = document.getElementById('stats-list');
  const wordCountEl = document.getElementById('word-count');

  try {
    // Get statistics from background script
    const response = await chrome.runtime.sendMessage({ type: 'get_statistics' });
    
    if (!response || !response.success) {
      throw new Error('Failed to load statistics');
    }

    const statistics = response.statistics || {};
    const words = Object.keys(statistics);

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
  } catch (error) {
    console.error('Error loading statistics:', error);
    loadingEl.textContent = 'Error loading statistics. Please try again.';
    loadingEl.style.color = '#dc3545';
  }
}

/**
 * Create a statistics list item
 */
function createStatItem(word, stat) {
  const item = document.createElement('div');
  item.className = 'stat-item';

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

  detailsEl.appendChild(countEl);
  detailsEl.appendChild(labelEl);

  item.appendChild(wordEl);
  item.appendChild(detailsEl);

  return item;
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
