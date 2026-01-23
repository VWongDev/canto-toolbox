import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Dictionary, DictionaryEntry } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Compiled output is in scripts/dist/, so go up 3 levels to reach root
const rootDir = join(__dirname, '../../..');

/**
 * Load Mandarin dictionary file content
 */
function loadMandarinFiles(): string {
  const path = join(rootDir, 'dictionaries/mandarin/data/all.js');
  return readFileSync(path, 'utf-8');
}

/**
 * Process Mandarin dictionary into unified format
 */
export function processMandarinDict(): Dictionary {
  const fileContent = loadMandarinFiles();
  const mandarinDict: Dictionary = {};

  // Extract the data from the export default statement
  let dataText = fileContent.trim();
  if (dataText.startsWith('export default ')) {
    dataText = dataText.substring('export default '.length);
  }
  
  // Parse JSON
  let parsedData: unknown;
  try {
    parsedData = JSON.parse(dataText);
  } catch (jsonError) {
    // Try to extract just the JSON part
    const jsonMatch = dataText.match(/^(\{.*\}|\[.*\])/s);
    if (jsonMatch) {
      parsedData = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error(`Failed to parse Mandarin dictionary: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
    }
  }
  
  // Handle different structures
  let dataArray: unknown[] | null = null;
  if (parsedData && typeof parsedData === 'object') {
    if (Array.isArray(parsedData)) {
      dataArray = parsedData;
    } else if (typeof parsedData === 'object' && parsedData !== null) {
      const obj = parsedData as Record<string, unknown>;
      if (obj.all && Array.isArray(obj.all)) {
        dataArray = obj.all;
      } else if (obj.simplified && Array.isArray(obj.simplified)) {
        dataArray = obj.simplified;
      } else if (obj.traditional && Array.isArray(obj.traditional)) {
        dataArray = obj.traditional;
      }
    }
  }
  
  if (!dataArray) {
    throw new Error('Could not find array data in Mandarin dictionary file');
  }
  
  console.log(`[Build] Processing ${dataArray.length} Mandarin entries...`);

  // Convert to unified format
  for (const entry of dataArray) {
    if (Array.isArray(entry) && entry.length >= 4) {
      const [traditional, simplified, pinyin, definition] = entry as [string, string, string, string | string[]];
      const definitions = Array.isArray(definition) ? definition : [definition];
      
      const dictEntry: DictionaryEntry = {
        traditional: String(traditional),
        simplified: String(simplified),
        pinyin: String(pinyin || ''),
        jyutping: '', // Mandarin doesn't have jyutping
        definitions: definitions.filter(d => d && String(d).trim().length > 0).map(String)
      };
      
      // Index by both simplified and traditional
      if (dictEntry.simplified) {
        if (!mandarinDict[dictEntry.simplified]) {
          mandarinDict[dictEntry.simplified] = [];
        }
        mandarinDict[dictEntry.simplified].push(dictEntry);
      }
      if (dictEntry.traditional && dictEntry.traditional !== dictEntry.simplified) {
        if (!mandarinDict[dictEntry.traditional]) {
          mandarinDict[dictEntry.traditional] = [];
        }
        mandarinDict[dictEntry.traditional].push(dictEntry);
      }
    }
  }

  console.log(`[Build] Loaded Mandarin dictionary: ${Object.keys(mandarinDict).length} entries`);
  return mandarinDict;
}
