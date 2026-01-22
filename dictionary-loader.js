// dictionary-loader.js - Load and search local dictionary files from submodules

// Dictionary data will be loaded from submodules
let mandarinDict = null;
let cantoneseDict = null;
let cantoneseReadingsDict = null; // Separate dict for readings-only file
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
        const url = chrome.runtime.getURL(path);
        console.log('[Dict] Attempting to load Mandarin dictionary from:', url);
        const response = await fetch(url);
        console.log('[Dict] Response status:', response.status, response.statusText);
        
        if (response.ok) {
          const text = await response.text();
          console.log('[Dict] Loaded text, length:', text.length, 'chars');
          // The JS files are ES6 modules with export default
          // Format: export default [["traditional","simplified","pinyin","definition",...],...]
          try {
            // Extract the data from the export default statement
            // Format: export default {"all":[...]} or export default [...]
            let dataText = text.trim();
            if (dataText.startsWith('export default ')) {
              dataText = dataText.substring('export default '.length);
            }
            
            // Service workers can't use eval, so we need to parse as JSON
            // The data should be valid JSON (object or array)
            let parsedData;
            try {
              parsedData = JSON.parse(dataText);
            } catch (jsonError) {
              // If JSON.parse fails, the data might have trailing content or comments
              // Try to extract just the JSON part
              const jsonMatch = dataText.match(/^(\{.*\}|\[.*\])/s);
              if (jsonMatch) {
                parsedData = JSON.parse(jsonMatch[1]);
              } else {
                throw jsonError;
              }
            }
            
            // Handle different structures: {"all": [...]} or [...]
            let dataArray = null;
            if (parsedData && typeof parsedData === 'object') {
              if (Array.isArray(parsedData)) {
                dataArray = parsedData;
              } else if (parsedData.all && Array.isArray(parsedData.all)) {
                dataArray = parsedData.all;
              } else if (parsedData.simplified && Array.isArray(parsedData.simplified)) {
                dataArray = parsedData.simplified;
              } else if (parsedData.traditional && Array.isArray(parsedData.traditional)) {
                dataArray = parsedData.traditional;
              }
            }
            
            if (!dataArray) {
              console.warn('[Dict] Could not find array data in', path);
              continue;
            }
            
            // Convert array format to dictionary object
            // Format: [traditional, simplified, pinyin, definition, ...]
            // Support multiple entries per word (different pronunciations)
            // Use batch processing to avoid blocking
            console.log('[Dict] Processing', dataArray.length, 'Mandarin entries...');
            mandarinDict = {};
            
            // Process in batches to avoid blocking the main thread
            const BATCH_SIZE = 1000;
            let processed = 0;
            
            for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
              const batch = dataArray.slice(i, i + BATCH_SIZE);
              
              for (const entry of batch) {
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
                  // Store as arrays to support multiple pronunciations per word
                  if (simplified) {
                    if (!mandarinDict[simplified]) {
                      mandarinDict[simplified] = [];
                    }
                    mandarinDict[simplified].push(dictEntry);
                  }
                  if (traditional && traditional !== simplified) {
                    if (!mandarinDict[traditional]) {
                      mandarinDict[traditional] = [];
                    }
                    mandarinDict[traditional].push(dictEntry);
                  }
                }
              }
              
              processed += batch.length;
              // Yield to event loop every batch to keep UI responsive
              if (i + BATCH_SIZE < dataArray.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
              }
            }
            
            console.log('[Dict] Loaded Mandarin dictionary from', path, ':', Object.keys(mandarinDict).length, 'entries');
            break;
          } catch (parseError) {
            console.error('[Dict] Failed to parse JS module from', path, ':', parseError);
            console.error('[Dict] Parse error details:', parseError.message, parseError.stack);
            continue;
          }
        }
      } catch (e) {
        console.error('[Dict] Failed to load', path, ':', e);
        console.error('[Dict] Error details:', e.message, e.stack);
        continue;
      }
    }

    // Load CC-CANTO (Cantonese) dictionary
    // The cc-canto-data repository has two files:
    // 1. cccanto-webdist.txt - has definitions and jyutping
    // 2. cccedict-canto-readings.txt - has readings (jyutping) only
    // We load both and merge them
    
    // Load main dictionary with definitions
    try {
      const mainPath = 'dictionaries/cantonese/cccanto-webdist.txt';
      const response = await fetch(chrome.runtime.getURL(mainPath));
      if (response.ok) {
        const text = await response.text();
        console.log('[Dict] Parsing Cantonese dictionary from', mainPath, '...');
        cantoneseDict = await parseCedictFormat(text);
        console.log('[Dict] Loaded Cantonese dictionary from', mainPath, ':', Object.keys(cantoneseDict).length, 'entries');
      }
    } catch (e) {
      console.warn('[Dict] Failed to load main Cantonese dictionary:', e);
    }
    
    // Load readings-only dictionary and merge with main dictionary
    try {
      const readingsPath = 'dictionaries/cantonese/cccedict-canto-readings.txt';
      const response = await fetch(chrome.runtime.getURL(readingsPath));
      if (response.ok) {
        const text = await response.text();
        console.log('[Dict] Parsing Cantonese readings from', readingsPath, '...');
        cantoneseReadingsDict = await parseCedictFormat(text);
        console.log('[Dict] Loaded Cantonese readings from', readingsPath, ':', Object.keys(cantoneseReadingsDict).length, 'entries');
        
        // Merge readings into main dictionary (add jyutping to entries that don't have it)
        if (cantoneseDict && cantoneseReadingsDict) {
          let mergedCount = 0;
          for (const [word, readingEntries] of Object.entries(cantoneseReadingsDict)) {
            const readingEntryArray = Array.isArray(readingEntries) ? readingEntries : [readingEntries];
            const mainEntries = cantoneseDict[word];
            const mainEntryArray = Array.isArray(mainEntries) ? mainEntries : (mainEntries ? [mainEntries] : []);
            
            if (mainEntryArray.length > 0) {
              // Entry exists in main dict, add jyutping if missing
              for (const readingEntry of readingEntryArray) {
                for (const mainEntry of mainEntryArray) {
                  if (!mainEntry.jyutping && readingEntry.jyutping) {
                    mainEntry.jyutping = readingEntry.jyutping;
                    mergedCount++;
                  }
                }
              }
              cantoneseDict[word] = mainEntryArray;
            } else {
              // Entry only in readings dict, add it to main dict
              cantoneseDict[word] = readingEntryArray;
              mergedCount += readingEntryArray.length;
            }
          }
          console.log('[Dict] Merged', mergedCount, 'readings into Cantonese dictionary');
        } else if (!cantoneseDict && cantoneseReadingsDict) {
          // If main dict failed to load, use readings dict as fallback
          cantoneseDict = cantoneseReadingsDict;
          console.log('[Dict] Using readings dictionary as Cantonese dictionary');
        }
      }
    } catch (e) {
      console.warn('[Dict] Failed to load Cantonese readings dictionary:', e);
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
 * Optimized with batch processing for large files
 */
async function parseCedictFormat(text) {
  const dict = {};
  const lines = text.split('\n');
  
  // Process in batches to avoid blocking
  const BATCH_SIZE = 1000;
  let processed = 0;
  
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    
    for (const line of batch) {
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
        
        // Store as arrays to support multiple pronunciations per word
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
        if (traditional !== simplified) {
          if (!dict[traditional]) {
            dict[traditional] = [];
          }
          dict[traditional].push(entry);
        }
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
        
        // Store as arrays to support multiple pronunciations per word
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
        if (traditional !== simplified) {
          if (!dict[traditional]) {
            dict[traditional] = [];
          }
          dict[traditional].push(entry);
        }
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
        
        // Store as arrays to support multiple pronunciations per word
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
        if (traditional !== simplified) {
          if (!dict[traditional]) {
            dict[traditional] = [];
          }
          dict[traditional].push(entry);
        }
      }
    }
    
    processed += batch.length;
    // Yield to event loop every batch
    if (i + BATCH_SIZE < lines.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
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

  console.log('[Dict] Looking up word:', word);
  console.log('[Dict] Mandarin dict loaded:', !!mandarinDict, mandarinDict ? Object.keys(mandarinDict).length + ' entries' : 'no');
  console.log('[Dict] Cantonese dict loaded:', !!cantoneseDict, cantoneseDict ? Object.keys(cantoneseDict).length + ' entries' : 'no');

  const result = {
    word: word,
    mandarin: { definition: '', pinyin: '' },
    cantonese: { definition: '', jyutping: '' }
  };

  // Search in Mandarin dictionary (CC-CEDICT format from edvardsr/cc-cedict)
  // Only use exact matches - no partial matching
  // Support multiple entries per word (different pronunciations)
  if (mandarinDict && typeof mandarinDict === 'object') {
    // Try exact lookup by word - may return array of entries
    const entries = mandarinDict[word];
    
    if (entries) {
      // Handle both array (multiple pronunciations) and single entry (backward compatibility)
      const entryArray = Array.isArray(entries) ? entries : [entries];
      
      if (entryArray.length > 0) {
        console.log('[Dict] Found', entryArray.length, 'Mandarin entry/entries for', word);
        
        // Store all entries for detailed display
        result.mandarin.entries = entryArray;
        
        // If multiple pronunciations, group by pinyin
        if (entryArray.length > 1) {
          // Group entries by pinyin
          const byPinyin = {};
          for (const entry of entryArray) {
            const pinyin = entry.pinyin || '';
            if (!byPinyin[pinyin]) {
              byPinyin[pinyin] = [];
            }
            const defs = entry.definitions || (entry.definition ? [entry.definition] : []);
            byPinyin[pinyin].push(...defs.filter(d => d && String(d).trim().length > 0));
          }
          
          // Store pinyin list and formatted definition for backward compatibility
          result.mandarin.pinyin = Object.keys(byPinyin).join(', ');
          const formatted = Object.entries(byPinyin)
            .map(([pinyin, defs]) => {
              const defsStr = defs.join('; ');
              return `${pinyin}: ${defsStr}`;
            })
            .join(' | ');
          result.mandarin.definition = formatted;
        } else {
          // Single entry
          const entry = entryArray[0];
          result.mandarin.pinyin = entry.pinyin || '';
          if (entry.definitions && entry.definitions.length > 0) {
            result.mandarin.definition = entry.definitions.join('; ');
          } else if (entry.definition) {
            result.mandarin.definition = String(entry.definition);
          }
        }
      }
    } else {
      console.log('[Dict] No exact Mandarin entry found for', word);
    }
  }

  // Search in Cantonese dictionary (CC-CANTO format)
  // Only use exact matches - no partial matching
  // Support multiple entries per word (different pronunciations)
  if (cantoneseDict && typeof cantoneseDict === 'object') {
    // Try exact lookup by word - may return array of entries
    const entries = cantoneseDict[word];
    
    if (entries) {
      // Handle both array (multiple pronunciations) and single entry (backward compatibility)
      const entryArray = Array.isArray(entries) ? entries : [entries];
      
      if (entryArray.length > 0) {
        console.log('[Dict] Found', entryArray.length, 'Cantonese entry/entries for', word);
        
        // Store all entries for detailed display
        result.cantonese.entries = entryArray;
        
        // If multiple pronunciations, group by jyutping
        if (entryArray.length > 1) {
          const byJyutping = {};
          for (const entry of entryArray) {
            const jyutping = entry.jyutping || '';
            if (!byJyutping[jyutping]) {
              byJyutping[jyutping] = [];
            }
            const defs = entry.definitions || [];
            byJyutping[jyutping].push(...defs.filter(d => d && String(d).trim().length > 0));
          }
          
          result.cantonese.jyutping = Object.keys(byJyutping).join(', ');
          const formatted = Object.entries(byJyutping)
            .map(([jyutping, defs]) => {
              const defsStr = defs.join('; ');
              return `${jyutping}: ${defsStr}`;
            })
            .join(' | ');
          result.cantonese.definition = formatted;
        } else {
          // Single entry
          const entry = entryArray[0];
          result.cantonese.jyutping = entry.jyutping || '';
          if (entry.definitions && entry.definitions.length > 0) {
            result.cantonese.definition = entry.definitions.join('; ');
          }
        }
      }
    } else {
      // Try readings-only dictionary as fallback for jyutping
      if (cantoneseReadingsDict && cantoneseReadingsDict[word]) {
        const readingEntries = cantoneseReadingsDict[word];
        const readingEntryArray = Array.isArray(readingEntries) ? readingEntries : [readingEntries];
        const readingEntry = readingEntryArray[0];
        console.log('[Dict] Found Cantonese reading for', word, ':', readingEntry);
        result.cantonese.jyutping = readingEntry.jyutping || '';
        // Don't use Mandarin definition - keep Cantonese separate
      } else {
        console.log('[Dict] No exact Cantonese entry found for', word);
      }
    }
  }

  // If no definitions found at all
  if (!result.mandarin.definition && !result.cantonese.definition) {
    result.mandarin.definition = 'Word not found in dictionary';
    result.cantonese.definition = 'Not found';
  }

  return result;
}
