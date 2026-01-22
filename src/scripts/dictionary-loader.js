// dictionary-loader.js - Load pre-processed dictionaries

// Dictionary data - loaded from pre-processed JSON files
let mandarinDict = null;
let cantoneseDict = null;
let dictionariesLoaded = false;

/**
 * Load pre-processed dictionary files
 */
export async function loadDictionaries() {
  if (dictionariesLoaded) {
    return { mandarinDict, cantoneseDict };
  }

  try {
    // Load pre-processed Mandarin dictionary
    const mandarinUrl = chrome.runtime.getURL('src/data/mandarin.json');
    const mandarinResponse = await fetch(mandarinUrl);
    
    if (mandarinResponse.ok) {
      mandarinDict = await mandarinResponse.json();
      console.log('[Dict] Loaded Mandarin dictionary:', Object.keys(mandarinDict).length, 'entries');
    } else {
      console.error('[Dict] Failed to load Mandarin dictionary:', mandarinResponse.status);
    }

    // Load pre-processed Cantonese dictionary
    const cantoneseUrl = chrome.runtime.getURL('src/data/cantonese.json');
    const cantoneseResponse = await fetch(cantoneseUrl);
    
    if (cantoneseResponse.ok) {
      cantoneseDict = await cantoneseResponse.json();
      console.log('[Dict] Loaded Cantonese dictionary:', Object.keys(cantoneseDict).length, 'entries');
    } else {
      console.error('[Dict] Failed to load Cantonese dictionary:', cantoneseResponse.status);
    }

    dictionariesLoaded = true;
    return { mandarinDict, cantoneseDict };
  } catch (error) {
    console.error('[Dict] Error loading dictionaries:', error);
    return { mandarinDict, cantoneseDict };
  }
}

/**
 * Lookup word in a dictionary (unified function for both Mandarin and Cantonese)
 * @param {Object} dict - The dictionary object
 * @param {string} word - The word to lookup
 * @returns {Object|null} - Dictionary entry with pinyin/jyutping and definitions, or null
 */
function lookupInDict(dict, word) {
  if (!dict || typeof dict !== 'object') {
    return null;
  }

  const entries = dict[word];
  if (!entries) {
    return null;
  }

  // Handle both array (multiple pronunciations) and single entry (backward compatibility)
  const entryArray = Array.isArray(entries) ? entries : [entries];
  
  if (entryArray.length === 0) {
    return null;
  }

  return entryArray;
}

/**
 * Format entries for display
 * @param {Array} entries - Array of dictionary entries
 * @param {string} pronunciationKey - 'pinyin' for Mandarin, 'jyutping' for Cantonese
 * @returns {Object} - Formatted result with pronunciation and definition
 */
function formatEntries(entries, pronunciationKey) {
  if (!entries || entries.length === 0) {
    return { definition: '', [pronunciationKey]: '' };
  }

  // If multiple pronunciations, group by pronunciation
  if (entries.length > 1) {
    const byPronunciation = {};
    for (const entry of entries) {
      const pronunciation = entry[pronunciationKey] || '';
      if (!byPronunciation[pronunciation]) {
        byPronunciation[pronunciation] = [];
      }
      const defs = entry.definitions || [];
      byPronunciation[pronunciation].push(...defs.filter(d => d && String(d).trim().length > 0));
    }

    const pronunciationList = Object.keys(byPronunciation).join(', ');
    const formatted = Object.entries(byPronunciation)
      .map(([pronunciation, defs]) => {
        const defsStr = defs.join('; ');
        return `${pronunciation}: ${defsStr}`;
      })
      .join(' | ');

    return {
      [pronunciationKey]: pronunciationList,
      definition: formatted,
      entries: entries
    };
  } else {
    // Single entry
    const entry = entries[0];
    const pronunciation = entry[pronunciationKey] || '';
    const defs = entry.definitions || [];
    const definition = defs.filter(d => d && String(d).trim().length > 0).join('; ');

    return {
      [pronunciationKey]: pronunciation,
      definition: definition,
      entries: entries
    };
  }
}

/**
 * Search for a word in the dictionaries
 */
export async function lookupWordInDictionaries(word) {
  // Ensure dictionaries are loaded
  await loadDictionaries();

  console.log('[Dict] Looking up word:', word);

  const result = {
    word: word,
    mandarin: { definition: '', pinyin: '' },
    cantonese: { definition: '', jyutping: '' }
  };

  // Lookup in Mandarin dictionary (unified approach)
  const mandarinEntries = lookupInDict(mandarinDict, word);
  if (mandarinEntries) {
    console.log('[Dict] Found', mandarinEntries.length, 'Mandarin entry/entries for', word);
    result.mandarin = formatEntries(mandarinEntries, 'pinyin');
  } else {
    console.log('[Dict] No exact Mandarin entry found for', word);
  }

  // Lookup in Cantonese dictionary (unified approach)
  const cantoneseEntries = lookupInDict(cantoneseDict, word);
  if (cantoneseEntries) {
    console.log('[Dict] Found', cantoneseEntries.length, 'Cantonese entry/entries for', word);
    result.cantonese = formatEntries(cantoneseEntries, 'jyutping');
  } else {
    console.log('[Dict] No exact Cantonese entry found for', word);
  }

  // If no definitions found at all
  if (!result.mandarin.definition && !result.cantonese.definition) {
    result.mandarin.definition = 'Word not found in dictionary';
    result.cantonese.definition = 'Not found';
  }

  return result;
}
