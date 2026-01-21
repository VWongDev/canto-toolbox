// background.js - Service worker for dictionary lookup and statistics tracking

// Import dictionary loader
importScripts('dictionary-loader.js');

// Cache for dictionary lookups
const lookupCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type, message);
  
  if (message.type === 'lookup_word') {
    console.log('[Background] Looking up word:', message.word);
    lookupWord(message.word)
      .then(definition => {
        console.log('[Background] Lookup successful, definition:', definition);
        // Track statistics
        updateStatistics(message.word);
        sendResponse({ success: true, definition });
      })
      .catch(error => {
        console.error('[Background] Lookup error:', error);
        console.error('[Background] Error details:', error.name, error.message, error.stack);
        sendResponse({ 
          success: false, 
          error: error.message || 'Unknown error',
          errorName: error.name
        });
      });
    return true; // Indicates we will send a response asynchronously
  }
  
  if (message.type === 'get_statistics') {
    getStatistics().then(stats => {
      sendResponse({ success: true, statistics: stats });
    });
    return true;
  }
  
  // Log unhandled message types
  console.warn('[Background] Unhandled message type:', message.type);
  return false;
});

/**
 * Lookup Chinese word in local dictionary files
 * Uses CC-CEDICT (Mandarin) and CC-CANTO (Cantonese) dictionaries from submodules
 */
async function lookupWord(word) {
  // Check cache first
  const cached = lookupCache.get(word);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('[Dict] Using cached definition for:', word);
    return cached.data;
  }

  console.log('[Dict] Looking up word in local dictionaries:', word);

  try {
    // Use local dictionary lookup
    const definition = await lookupWordInDictionaries(word);
    console.log('[Dict] Found definition:', definition);
    
    // Cache the result
    lookupCache.set(word, {
      data: definition,
      timestamp: Date.now()
    });
    
    return definition;
  } catch (error) {
    console.error('[Dict] Dictionary lookup failed:', error);
    console.error('[Dict] Error details:', error.message, error.stack);
    
    // Return a fallback structure
    return {
      word: word,
      mandarin: { 
        definition: 'Dictionary files not loaded. Please ensure dictionaries submodules are initialized.',
        pinyin: '' 
      },
      cantonese: { 
        definition: 'Dictionary files not loaded',
        jyutping: '' 
      }
    };
  }
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
