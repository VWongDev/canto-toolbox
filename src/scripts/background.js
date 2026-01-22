// background.js - Service worker for dictionary lookup and statistics tracking

// Import dictionary loader functions
import { loadDictionaries, lookupWordInDictionaries } from './dictionary-loader.js';

// Cache for dictionary lookups
const lookupCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Pre-load dictionaries when service worker starts (non-blocking)
// This improves performance by loading dictionaries in the background
let dictionariesLoading = false;
let dictionariesLoadPromise = null;

function preloadDictionaries() {
  if (dictionariesLoadPromise) {
    return dictionariesLoadPromise;
  }
  
  if (dictionariesLoading) {
    return Promise.resolve();
  }
  
  dictionariesLoading = true;
  dictionariesLoadPromise = loadDictionaries()
    .then(() => {
      console.log('[Background] Dictionaries pre-loaded successfully');
      dictionariesLoading = false;
    })
    .catch(error => {
      console.error('[Background] Failed to pre-load dictionaries:', error);
      dictionariesLoading = false;
      dictionariesLoadPromise = null; // Allow retry
    });
  
  return dictionariesLoadPromise;
}

// Start loading dictionaries immediately when service worker starts
preloadDictionaries();

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
    getStatistics()
      .then(stats => {
        console.log('[Background] Returning statistics:', Object.keys(stats).length, 'words');
        sendResponse({ success: true, statistics: stats });
      })
      .catch(error => {
        console.error('[Background] Error getting statistics:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates we will send a response asynchronously
  }
  
  if (message.type === 'track_word') {
    // Track statistics without doing a lookup
    updateStatistics(message.word)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('[Background] Failed to track statistics:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates we will send a response asynchronously
  }
  
  // Log unhandled message types
  console.warn('[Background] Unhandled message type:', message.type);
  return false;
});

/**
 * Lookup Chinese word in local dictionary files
 * Tries to find the longest matching word by checking progressively shorter substrings
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
    // Try to find the longest matching word
    // For single character hover: try progressively longer words starting from that character
    // For multi-character selection: try the full selection, then shorter substrings
    let definition = null;
    let matchedWord = word;
    
    // Ensure dictionaries are loaded (use pre-loaded if available)
    await preloadDictionaries();
    
    // For hover: try to find longest exact match up to 4 characters
    // Try from longest to shortest: 4 chars, 3 chars, 2 chars, 1 char
    // This matches the lookahead behavior in content script
    let foundMatch = false;
    
    // Start with the full word (up to 4 chars from content script)
    for (let len = word.length; len >= 1; len--) {
      const substring = word.substring(0, len);
      const subDefinition = await lookupWordInDictionaries(substring);
      
      // Check if this substring has a valid exact definition
      if (subDefinition && 
          subDefinition.mandarin.definition && 
          !subDefinition.mandarin.definition.includes('not found') &&
          !subDefinition.mandarin.definition.includes('not loaded') &&
          subDefinition.mandarin.definition.trim().length > 0) {
        definition = subDefinition;
        matchedWord = substring;
        foundMatch = true;
        console.log('[Dict] Found exact match:', substring, 'for word', word);
        break; // Use the longest match found
      }
    }
    
    // If no match found in the lookahead, try just the first character
    if (!foundMatch && word.length > 1) {
      const firstChar = word[0];
      const charDefinition = await lookupWordInDictionaries(firstChar);
      if (charDefinition && 
          charDefinition.mandarin.definition && 
          !charDefinition.mandarin.definition.includes('not found') &&
          !charDefinition.mandarin.definition.includes('not loaded') &&
          charDefinition.mandarin.definition.trim().length > 0) {
        definition = charDefinition;
        matchedWord = firstChar;
        console.log('[Dict] Found single character match:', firstChar);
      }
    }
    
    if (definition) {
      // Update the word in the result to reflect what was actually matched
      definition.word = matchedWord;
      console.log('[Dict] Found definition for:', matchedWord);
      
      // Cache the result
      lookupCache.set(word, {
        data: definition,
        timestamp: Date.now()
      });
      
      return definition;
    }
    
    // No match found
    return {
      word: word,
      mandarin: { 
        definition: 'Word not found in dictionary',
        pinyin: '' 
      },
      cantonese: { 
        definition: 'Not found',
        jyutping: '' 
      }
    };
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
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    console.warn('[Background] Invalid word for statistics:', word);
    return;
  }

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
    console.log('[Background] Updated statistics for word:', word, 'count:', stats[word].count);
  } catch (error) {
    console.error('[Background] Failed to update statistics in sync storage:', error);
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
      console.log('[Background] Updated statistics in local storage for word:', word, 'count:', stats[word].count);
    } catch (localError) {
      console.error('[Background] Failed to update local statistics:', localError);
      throw localError;
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
