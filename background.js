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
    
    // Ensure dictionaries are loaded first
    await loadDictionaries();
    
    // If word is a single character, try to find the longest word starting with it
    if (word.length === 1) {
      // For single character, we'll try the character itself first
      definition = await lookupWordInDictionaries(word);
      
      // If found, return it (single character lookup)
      if (definition && 
          definition.mandarin.definition && 
          !definition.mandarin.definition.includes('not found') &&
          !definition.mandarin.definition.includes('not loaded')) {
        matchedWord = word;
      } else {
        // Single character not found - return not found
        definition = null;
      }
    } else {
      // Multi-character word (from selection): try full word first, then shorter substrings
      definition = await lookupWordInDictionaries(word);
      
      // If not found or has no definition, try progressively shorter substrings
      if (!definition || (!definition.mandarin.definition || definition.mandarin.definition.includes('not found'))) {
        // Try shorter substrings: word.length-1, word.length-2, etc., down to 1 character
        for (let len = word.length - 1; len >= 1; len--) {
          const substring = word.substring(0, len);
          const subDefinition = await lookupWordInDictionaries(substring);
          
          // Check if this substring has a valid definition
          if (subDefinition && 
              subDefinition.mandarin.definition && 
              !subDefinition.mandarin.definition.includes('not found') &&
              !subDefinition.mandarin.definition.includes('not loaded')) {
            definition = subDefinition;
            matchedWord = substring;
            console.log('[Dict] Found shorter match:', substring, 'for word', word);
            break;
          }
        }
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
