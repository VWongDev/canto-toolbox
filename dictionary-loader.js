// dictionary-loader.js - Load and search local dictionary files from submodules

// Dictionary data will be loaded from submodules
let mandarinDict = null;
let cantoneseDict = null;
let dictionariesLoaded = false;

/**
 * Load dictionary files from the dictionaries submodules
 */
async function loadDictionaries() {
  if (dictionariesLoaded) {
    return { mandarinDict, cantoneseDict };
  }

  try {
    // Load CC-CEDICT (Mandarin) dictionary
    // The edvardsr/cc-cedict repository has JS files in data/ folder
    const mandarinPaths = [
      'dictionaries/mandarin/data/all.js',
      'dictionaries/mandarin/data/simplified.js'
    ];

    for (const path of mandarinPaths) {
      try {
        const response = await fetch(chrome.runtime.getURL(path));
        if (response.ok) {
          const text = await response.text();
          // The JS files are ES6 modules with export default
          // Format: export default [["traditional","simplified","pinyin","definition",...],...]
          try {
            // Extract the data array from the export default statement
            // Remove "export default " prefix and parse as JSON
            let dataText = text.trim();
            if (dataText.startsWith('export default ')) {
              dataText = dataText.substring('export default '.length);
            }
            
            // Parse the array
            const dataArray = eval('(' + dataText + ')');
            
            // Convert array format to dictionary object
            // Format: [traditional, simplified, pinyin, definition, ...]
            mandarinDict = {};
            if (Array.isArray(dataArray)) {
              for (const entry of dataArray) {
                if (Array.isArray(entry) && entry.length >= 4) {
                  const [traditional, simplified, pinyin, definition] = entry;
                  const definitions = Array.isArray(definition) ? definition : [definition];
                  
                  const dictEntry = {
                    traditional,
                    simplified,
                    pinyin: pinyin || '',
                    definitions: definitions.filter(d => d && String(d).trim().length > 0)
                  };
                  
                  // Index by both simplified and traditional
                  if (simplified) mandarinDict[simplified] = dictEntry;
                  if (traditional && traditional !== simplified) mandarinDict[traditional] = dictEntry;
                }
              }
            }
            
            console.log('[Dict] Loaded Mandarin dictionary from', path, ':', Object.keys(mandarinDict).length, 'entries');
            break;
          } catch (parseError) {
            console.warn('[Dict] Failed to parse JS module:', parseError);
            continue;
          }
        }
      } catch (e) {
        console.warn('[Dict] Failed to load', path, ':', e);
        continue;
      }
    }

    // Load CC-CANTO (Cantonese) dictionary
    // The cc-canto-data repository has text files in CC-CEDICT format
    const cantonesePaths = [
      'dictionaries/cantonese/cccanto-webdist.txt',
      'dictionaries/cantonese/cccedict-canto-readings.txt'
    ];

    for (const path of cantonesePaths) {
      try {
        const response = await fetch(chrome.runtime.getURL(path));
        if (response.ok) {
          const text = await response.text();
          cantoneseDict = parseCedictFormat(text);
          console.log('[Dict] Loaded Cantonese dictionary from', path, ':', Object.keys(cantoneseDict).length, 'entries');
          break;
        }
      } catch (e) {
        continue;
      }
    }

    dictionariesLoaded = true;
    
    if (!mandarinDict && !cantoneseDict) {
      console.warn('[Dict] No dictionary files found. Please ensure dictionaries submodules are initialized.');
    }
    
    return { mandarinDict, cantoneseDict };
  } catch (error) {
    console.error('[Dict] Error loading dictionaries:', error);
    return { mandarinDict, cantoneseDict };
  }
}

/**
 * Parse CC-CEDICT format text file
 * Format variations:
 * 1. Traditional Simplified [pinyin] /definition1/definition2/
 * 2. Traditional Simplified [pinyin] {jyutping} /definition1/definition2/ (CC-CANTO)
 * 3. Traditional Simplified [pinyin] {jyutping} (readings only, no definitions)
 */
function parseCedictFormat(text) {
  const dict = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.trim().length === 0) {
      continue;
    }
    
    // Try format with definitions: Traditional Simplified [pinyin] {jyutping} /def1/def2/
    let match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, jyutping, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      const entry = {
        traditional,
        simplified,
        pinyin,
        jyutping,
        definitions: defs
      };
      
      dict[simplified] = entry;
      if (traditional !== simplified) dict[traditional] = entry;
      continue;
    }
    
    // Try format without jyutping: Traditional Simplified [pinyin] /def1/def2/
    match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      const entry = {
        traditional,
        simplified,
        pinyin,
        definitions: defs
      };
      
      dict[simplified] = entry;
      if (traditional !== simplified) dict[traditional] = entry;
      continue;
    }
    
    // Try format with jyutping but no definitions: Traditional Simplified [pinyin] {jyutping}
    match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}$/);
    if (match) {
      const [, traditional, simplified, pinyin, jyutping] = match;
      
      const entry = {
        traditional,
        simplified,
        pinyin,
        jyutping,
        definitions: [] // No definitions in this file
      };
      
      dict[simplified] = entry;
      if (traditional !== simplified) dict[traditional] = entry;
    }
  }
  
  return dict;
}

/**
 * Search for a word in the dictionaries
 */
async function lookupWordInDictionaries(word) {
  // Ensure dictionaries are loaded
  await loadDictionaries();

  const result = {
    word: word,
    mandarin: { definition: '', pinyin: '' },
    cantonese: { definition: '', jyutping: '' }
  };

  // Search in Mandarin dictionary (CC-CEDICT format from edvardsr/cc-cedict)
  if (mandarinDict && typeof mandarinDict === 'object') {
    // Try direct lookup by word
    let entry = mandarinDict[word];
    
    if (entry) {
      result.mandarin.pinyin = entry.pinyin || '';
      if (entry.definitions && entry.definitions.length > 0) {
        result.mandarin.definition = entry.definitions.join('; ');
      } else if (entry.definition) {
        result.mandarin.definition = String(entry.definition);
      }
    } else {
      // Try searching for partial matches or character-by-character
      // For multi-character words, try to find entries that contain the word
      for (const [key, value] of Object.entries(mandarinDict)) {
        if (key.includes(word) || word.includes(key)) {
          entry = value;
          break;
        }
      }
      
      if (entry) {
        result.mandarin.pinyin = entry.pinyin || '';
        if (entry.definitions && entry.definitions.length > 0) {
          result.mandarin.definition = entry.definitions.join('; ');
        }
      }
    }
  }

  // Search in Cantonese dictionary (CC-CANTO format)
  if (cantoneseDict && typeof cantoneseDict === 'object') {
    let entry = cantoneseDict[word];
    
    if (entry) {
      result.cantonese.jyutping = entry.jyutping || '';
      if (entry.definitions && entry.definitions.length > 0) {
        result.cantonese.definition = entry.definitions.join('; ');
      }
    } else {
      // Try searching for partial matches
      for (const [key, value] of Object.entries(cantoneseDict)) {
        if (key.includes(word) || word.includes(key)) {
          entry = value;
          break;
        }
      }
      
      if (entry) {
        result.cantonese.jyutping = entry.jyutping || '';
        if (entry.definitions && entry.definitions.length > 0) {
          result.cantonese.definition = entry.definitions.join('; ');
        }
      }
    }
  }

  // If no Cantonese definition found, use Mandarin as fallback
  if (!result.cantonese.definition && result.mandarin.definition) {
    result.cantonese.definition = result.mandarin.definition;
  }

  // If no definitions found at all
  if (!result.mandarin.definition && !result.cantonese.definition) {
    result.mandarin.definition = 'Word not found in dictionary';
    result.cantonese.definition = 'Not found';
  }

  return result;
}
