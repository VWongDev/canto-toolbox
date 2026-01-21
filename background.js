// background.js - Service worker for dictionary API and statistics tracking

// Cache for API responses to reduce API calls
const apiCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'lookup_word') {
    lookupWord(message.word)
      .then(definition => {
        // Track statistics
        updateStatistics(message.word);
        sendResponse({ success: true, definition });
      })
      .catch(error => {
        console.error('Lookup error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates we will send a response asynchronously
  }
  
  if (message.type === 'get_statistics') {
    getStatistics().then(stats => {
      sendResponse({ success: true, statistics: stats });
    });
    return true;
  }
});

/**
 * Lookup Chinese word in dictionary API
 * Uses MDBG Chinese Dictionary API
 */
async function lookupWord(word) {
  // Check cache first
  const cached = apiCache.get(word);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Try MDBG API endpoint - multiple possible formats
    let apiUrl = `https://api.mdbg.net/chinese/dictionary/WordLookup?w=${encodeURIComponent(word)}`;
    let response = await fetch(apiUrl);
    
    // If that fails, try alternative endpoint format
    if (!response.ok) {
      apiUrl = `https://api.mdbg.net/chinese/dictionary/word/${encodeURIComponent(word)}`;
      response = await fetch(apiUrl);
    }
    
    if (!response.ok) {
      // Try CC-CEDICT format as fallback
      apiUrl = `https://cc-cedict.org/wiki/${encodeURIComponent(word)}`;
      response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
    }

    const data = await response.json();
    
    // Parse API response format
    const definition = parseMDBGResponse(data, word);
    
    // Cache the result
    apiCache.set(word, {
      data: definition,
      timestamp: Date.now()
    });
    
    return definition;
  } catch (error) {
    console.error('Dictionary lookup failed:', error);
    // Return a basic structure even on error - at least show the word
    return {
      word: word,
      mandarin: { definition: 'Definition not available', pinyin: '' },
      cantonese: { definition: 'Not available', jyutping: '' }
    };
  }
}

/**
 * Parse MDBG API response to extract definitions and pronunciations
 */
function parseMDBGResponse(data, word) {
  const result = {
    word: word,
    mandarin: { definition: '', pinyin: '' },
    cantonese: { definition: '', jyutping: '' }
  };

  if (data && data.words && data.words.length > 0) {
    const firstWord = data.words[0];
    
    // Extract pinyin
    if (firstWord.pinyin) {
      result.mandarin.pinyin = firstWord.pinyin;
    }
    
    // Extract definitions
    if (firstWord.definitions && firstWord.definitions.length > 0) {
      result.mandarin.definition = firstWord.definitions
        .map(def => def.english || def)
        .join('; ');
    }
    
    // Try to find Cantonese data (jyutping)
    // MDBG may not always have Cantonese, so we'll try alternative sources
    // For now, we'll use a fallback or leave it empty
    if (firstWord.jyutping) {
      result.cantonese.jyutping = firstWord.jyutping;
    }
    
    // If no Cantonese definition found, try to get from alternative source
    // or use a placeholder
    if (!result.cantonese.definition) {
      result.cantonese.definition = result.mandarin.definition || 'Not available';
    }
  }

  return result;
}

/**
 * Update word statistics in Chrome sync storage
 */
async function updateStatistics(word) {
  try {
    const result = await chrome.storage.sync.get(['wordStatistics']);
    const stats = result.wordStatistics || {};
    
    if (!stats[word]) {
      stats[word] = {
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      };
    }
    
    stats[word].count += 1;
    stats[word].lastSeen = Date.now();
    
    await chrome.storage.sync.set({ wordStatistics: stats });
  } catch (error) {
    console.error('Failed to update statistics:', error);
    // Fallback to local storage if sync fails
    try {
      const result = await chrome.storage.local.get(['wordStatistics']);
      const stats = result.wordStatistics || {};
      if (!stats[word]) {
        stats[word] = { count: 0, firstSeen: Date.now(), lastSeen: Date.now() };
      }
      stats[word].count += 1;
      stats[word].lastSeen = Date.now();
      await chrome.storage.local.set({ wordStatistics: stats });
    } catch (localError) {
      console.error('Failed to update local statistics:', localError);
    }
  }
}

/**
 * Get all statistics
 */
async function getStatistics() {
  try {
    const result = await chrome.storage.sync.get(['wordStatistics']);
    return result.wordStatistics || {};
  } catch (error) {
    console.error('Failed to get statistics:', error);
    // Fallback to local storage
    try {
      const result = await chrome.storage.local.get(['wordStatistics']);
      return result.wordStatistics || {};
    } catch (localError) {
      return {};
    }
  }
}
