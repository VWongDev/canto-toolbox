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
    console.log('[API] Using cached definition for:', word);
    return cached.data;
  }

  console.log('[API] Looking up word:', word);

  try {
    // Try multiple API endpoints as fallbacks
    const endpoints = [
      `https://api.mdbg.net/chinese/dictionary/WordLookup?w=${encodeURIComponent(word)}`,
      `https://www.mdbg.net/chinese/dictionary/WordLookup?w=${encodeURIComponent(word)}`,
      // Alternative: try a different format
      `https://api.mdbg.net/chinese/dictionary/word/${encodeURIComponent(word)}`
    ];

    let data = null;
    let lastError = null;

    for (const apiUrl of endpoints) {
      try {
        console.log('[API] Trying endpoint:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          // Add timeout
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        console.log('[API] Response status:', response.status, response.statusText);

        if (!response.ok) {
          console.log('[API] Endpoint failed with status:', response.status);
          lastError = new Error(`API error: ${response.status} ${response.statusText}`);
          continue; // Try next endpoint
        }

        data = await response.json();
        console.log('[API] Success! Response data:', JSON.stringify(data).substring(0, 500));
        break; // Success, exit loop
      } catch (fetchError) {
        console.log('[API] Endpoint error:', fetchError.message);
        lastError = fetchError;
        continue; // Try next endpoint
      }
    }

    if (!data) {
      throw lastError || new Error('All API endpoints failed');
    }
    
    // Parse API response format
    const definition = parseMDBGResponse(data, word);
    console.log('[API] Parsed definition:', definition);
    
    // Cache the result
    apiCache.set(word, {
      data: definition,
      timestamp: Date.now()
    });
    
    return definition;
  } catch (error) {
    console.error('[API] Dictionary lookup failed:', error);
    console.error('[API] Error details:', error.message, error.stack);
    
    // Return a basic structure even on error - at least show the word
    // This ensures the popup still appears
    return {
      word: word,
      mandarin: { 
        definition: `Error: ${error.message}. Please check console for details.`, 
        pinyin: '' 
      },
      cantonese: { 
        definition: 'Not available', 
        jyutping: '' 
      }
    };
  }
}

/**
 * Parse MDBG API response to extract definitions and pronunciations
 * MDBG API returns data in various formats, so we handle multiple structures
 */
function parseMDBGResponse(data, word) {
  const result = {
    word: word,
    mandarin: { definition: '', pinyin: '' },
    cantonese: { definition: '', jyutping: '' }
  };

  console.log('[API] Parsing response structure:', JSON.stringify(data).substring(0, 500));

  // Handle different possible response structures
  let words = [];
  
  if (data && Array.isArray(data)) {
    words = data;
  } else if (data && data.words && Array.isArray(data.words)) {
    words = data.words;
  } else if (data && data.data && Array.isArray(data.data)) {
    words = data.data;
  } else if (data && typeof data === 'object') {
    // Try to find word data in the object
    for (const key in data) {
      if (Array.isArray(data[key])) {
        words = data[key];
        break;
      }
    }
  }

  if (words.length > 0) {
    const firstWord = words[0];
    console.log('[API] First word data:', firstWord);
    
    // Extract pinyin - handle different field names
    result.mandarin.pinyin = firstWord.pinyin || 
                             firstWord.pinyinText || 
                             firstWord.pronunciation || 
                             firstWord.pron || 
                             '';
    
    // Extract definitions - handle different structures
    let definitions = [];
    if (firstWord.definitions && Array.isArray(firstWord.definitions)) {
      definitions = firstWord.definitions;
    } else if (firstWord.definitions && typeof firstWord.definitions === 'string') {
      definitions = [firstWord.definitions];
    } else if (firstWord.definition) {
      definitions = Array.isArray(firstWord.definition) ? firstWord.definition : [firstWord.definition];
    } else if (firstWord.english) {
      definitions = Array.isArray(firstWord.english) ? firstWord.english : [firstWord.english];
    }
    
    if (definitions.length > 0) {
      result.mandarin.definition = definitions
        .map(def => {
          if (typeof def === 'string') return def;
          if (def.english) return def.english;
          if (def.text) return def.text;
          return String(def);
        })
        .filter(def => def && def.trim().length > 0)
        .join('; ');
    }
    
    // Try to find Cantonese data (jyutping)
    result.cantonese.jyutping = firstWord.jyutping || 
                                firstWord.jyutpingText || 
                                firstWord.cantonese || 
                                '';
    
    // If no Cantonese definition found, use Mandarin definition
    if (!result.cantonese.definition) {
      result.cantonese.definition = result.mandarin.definition || 'Not available';
    }
    
    // If we still don't have a definition, provide a fallback
    if (!result.mandarin.definition || result.mandarin.definition.trim().length === 0) {
      result.mandarin.definition = 'Definition not found in dictionary';
    }
  } else {
    console.log('[API] No words found in response');
    result.mandarin.definition = 'Word not found in dictionary';
    result.cantonese.definition = 'Not available';
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
