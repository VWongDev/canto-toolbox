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
          // The JS files are CommonJS modules, we need to extract the data
          // They export an object with dictionary entries
          // We'll use eval in a safe way or parse the module
          try {
            // Create a function to execute the module code
            const moduleExports = {};
            const module = { exports: moduleExports };
            const exports = moduleExports;
            
            // Execute the module code
            const func = new Function('module', 'exports', text);
            func(module, exports);
            
            mandarinDict = module.exports || moduleExports;
            console.log('[Dict] Loaded Mandarin dictionary from', path);
            break;
          } catch (parseError) {
            console.warn('[Dict] Failed to parse JS module:', parseError);
            continue;
          }
        }
      } catch (e) {
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
 * Format: Traditional Simplified [pinyin] /definition1/definition2/
 */
function parseCedictFormat(text) {
  const dict = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.trim().length === 0) {
      continue;
    }
    
    // Parse CC-CEDICT format: Traditional Simplified [pinyin] /def1/def2/
    const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      // Store by simplified and traditional
      const entry = {
        traditional,
        simplified,
        pinyin,
        definitions: defs
      };
      
      dict[simplified] = entry;
      dict[traditional] = entry;
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
  if (mandarinDict) {
    // The cc-cedict library exports functions, but the data files might have the raw data
    // Try to find the word in the dictionary object
    let entry = null;
    
    if (typeof mandarinDict === 'object') {
      // Try direct lookup
      if (mandarinDict[word]) {
        entry = mandarinDict[word];
      } else {
        // Search in all entries
        for (const [key, value] of Object.entries(mandarinDict)) {
          if (key === word || (typeof value === 'object' && (value.simplified === word || value.traditional === word))) {
            entry = value;
            break;
          }
        }
      }
    }
    
    if (entry) {
      // Handle different entry formats
      if (Array.isArray(entry)) {
        // Multiple entries, take first
        entry = entry[0];
      }
      
      if (typeof entry === 'object') {
        result.mandarin.pinyin = entry.pinyin || entry.reading || '';
        
        if (entry.definitions) {
          result.mandarin.definition = Array.isArray(entry.definitions)
            ? entry.definitions.join('; ')
            : String(entry.definitions);
        } else if (entry.english) {
          result.mandarin.definition = Array.isArray(entry.english)
            ? entry.english.join('; ')
            : String(entry.english);
        }
      }
    }
  }

  // Search in Cantonese dictionary (CC-CANTO format)
  if (cantoneseDict) {
    if (cantoneseDict[word]) {
      const entry = cantoneseDict[word];
      // Extract jyutping from pinyin field (CC-CANTO format may have jyutping in pinyin field)
      result.cantonese.jyutping = entry.pinyin || entry.jyutping || '';
      result.cantonese.definition = Array.isArray(entry.definitions)
        ? entry.definitions.join('; ')
        : String(entry.definitions);
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
