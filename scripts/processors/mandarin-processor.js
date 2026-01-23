import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

/**
 * Load Mandarin dictionary file content
 */
function loadMandarinFiles() {
  const mandarinPaths = [
    join(rootDir, 'dictionaries/mandarin/data/all.js'),
    join(rootDir, 'dictionaries/mandarin/data/simplified.js')
  ];

  for (const path of mandarinPaths) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
    console.warn(`[Build] Mandarin dictionary file not found: ${path}`);
  }

  throw new Error('No valid Mandarin dictionary file found');
}

/**
 * Process Mandarin dictionary into unified format
 * @returns {Object} Dictionary object keyed by word
 */
export function processMandarinDict() {
  const fileContent = loadMandarinFiles();
  const mandarinDict = {};

  // Extract the data from the export default statement
  let dataText = fileContent.trim();
  if (dataText.startsWith('export default ')) {
    dataText = dataText.substring('export default '.length);
  }
  
  // Parse JSON
  let parsedData;
  try {
    parsedData = JSON.parse(dataText);
  } catch (jsonError) {
    // Try to extract just the JSON part
    const jsonMatch = dataText.match(/^(\{.*\}|\[.*\])/s);
    if (jsonMatch) {
      parsedData = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error(`Failed to parse Mandarin dictionary: ${jsonError.message}`);
    }
  }
  
  // Handle different structures
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
    throw new Error('Could not find array data in Mandarin dictionary file');
  }
  
  console.log(`[Build] Processing ${dataArray.length} Mandarin entries...`);

  // Convert to unified format
  for (const entry of dataArray) {
    if (Array.isArray(entry) && entry.length >= 4) {
      const [traditional, simplified, pinyin, definition] = entry;
      const definitions = Array.isArray(definition) ? definition : [definition];
      
      const dictEntry = {
        traditional,
        simplified,
        pinyin: pinyin || '',
        jyutping: '', // Mandarin doesn't have jyutping
        definitions: definitions.filter(d => d && String(d).trim().length > 0)
      };
      
      // Index by both simplified and traditional
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

  console.log(`[Build] Loaded Mandarin dictionary: ${Object.keys(mandarinDict).length} entries`);
  return mandarinDict;
}
